"""Checkout prerequisites for a paid subscription — the smallcase-style steps before money moves.

1. Billing details, saved once per investor: PAN, name as per PAN, date of birth, state (invoicing + the client
   record a SEBI research analyst must keep).
2. Terms of service for the specific listing: the partner's details + Omnivest's platform terms (Omnivest is the
   merchant), shown in full and accepted with a one-time code to the investor's mobile. What was accepted, by whom,
   when, from where and which version is stored as a consent record.
payments.create_order refuses to price an order until both exist for the listing.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorDatabase

import phone_auth
from auth import build_current_user_dep
from content import DEFAULT_CONTENT as CONTENT_DEFAULTS

CONSENTS = "consents"
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
STATES = ["Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
          "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
          "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
          "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
          "Uttar Pradesh", "Uttarakhand", "West Bengal"]
TERMS_TEMPLATE_VERSION = "2026-09-06"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not isinstance(dt, datetime):
        return None
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def validate_billing(p: dict) -> Dict[str, Any]:
    pan = (p.get("pan") or "").strip().upper()
    name = re.sub(r"\s+", " ", (p.get("pan_name") or "").strip())
    dob = (p.get("dob") or "").strip()
    state = (p.get("state") or "").strip()
    errors: List[str] = []
    if not PAN_RE.match(pan):
        errors.append("PAN must look like ABCDE1234F")
    if len(name) < 3 or not re.match(r"^[A-Za-z .'-]+$", name):
        errors.append("Enter your name exactly as on your PAN card")
    try:
        d = date.fromisoformat(dob)
        age = (date.today() - d).days / 365.25
        if age < 18:
            errors.append("You must be 18 or older to subscribe")
        if age > 120:
            errors.append("Check the date of birth")
    except ValueError:
        errors.append("Date of birth must be a valid date")
    if state not in STATES:
        errors.append("Pick your state")
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Please fix the billing details", "errors": errors})
    return {"pan": pan, "pan_name": name, "dob": dob, "state": state}


def billing_complete(user: dict) -> bool:
    b = user.get("billing") or {}
    return bool(b.get("pan") and b.get("pan_name") and b.get("dob") and b.get("state"))


async def terms_for(db: AsyncIOMotorDatabase, pid: str) -> Optional[Dict[str, Any]]:
    """The document the investor signs: partner block (from the manager record) + platform terms (admin-editable content)."""
    listing = await db.analyst_portfolios.find_one({"id": pid}, {"_id": 0, "id": 1, "name": 1, "owner_id": 1, "owner_name": 1, "subscription": 1, "plans": 1, "status": 1})
    if not listing:
        return None
    mgr = await db.managers.find_one({"user_id": listing.get("owner_id"), "active": True}, {"_id": 0}) or {}
    usr = await db.users.find_one({"id": listing.get("owner_id")}, {"_id": 0, "analyst_profile": 1, "name": 1, "email": 1}) or {}
    prof = usr.get("analyst_profile") or {}
    content = await db.site_content.find_one({"key": "home"}, {"_id": 0, "subscriptionTerms": 1, "platformDetails": 1, "investorCharter": 1}) or {}
    platform = content.get("subscriptionTerms") or CONTENT_DEFAULTS.get("subscriptionTerms", "")
    pd = {**CONTENT_DEFAULTS.get("platformDetails", {}), **(content.get("platformDetails") or {})}
    charter = content.get("investorCharter") or CONTENT_DEFAULTS.get("investorCharter", "")
    # the approved partner application is the licence-holder record (what smallcase prints under "License Holder Details")
    app = await db.partner_applications.find_one({"$or": [{"phone": usr.get("phone")}, {"email": usr.get("email")}], "status": "approved"},
                                                 {"_id": 0}, sort=[("created_at", -1)]) or {} if (usr.get("phone") or usr.get("email")) else {}

    def officer(v):
        if isinstance(v, dict):
            return ", ".join(str(x) for x in [v.get("name"), v.get("email"), v.get("phone")] if x)
        return str(v or "")

    partner = {
        "name": prof.get("displayName") or mgr.get("name") or listing.get("owner_name") or usr.get("name") or "",
        "firm": mgr.get("firm", ""), "sebiReg": prof.get("sebiReg") or mgr.get("sebi_reg", "") or app.get("sebi_reg", ""),
        "email": usr.get("email") or app.get("email") or "", "website": mgr.get("website", "") or app.get("website", ""),
        "registeredName": app.get("registered_name", ""), "phone": app.get("phone", "") or usr.get("phone", ""),
        "raasbNo": app.get("raasb_no", ""), "registeredAddress": app.get("registered_address", ""),
        "complianceOfficer": officer(app.get("compliance_officer")), "principalOfficer": officer(app.get("principal_officer")),
        "applicantType": app.get("applicant_type", ""),
    }
    plans = ", ".join(f"{p.get('months')} month{'s' if int(p.get('months') or 0) > 1 else ''} ₹{int(p.get('price') or 0):,}" for p in (listing.get("plans") or []))
    e = html.escape
    rows = [("Model portfolio", listing.get("name") or ""), ("Plans", plans or "—"), ("Research analyst", partner["name"]),
            ("Licence holder", partner["registeredName"] or partner["firm"] or "—"), ("Brand / firm", partner["firm"] or "—"),
            ("SEBI registration no.", partner["sebiReg"] or "—"), ("Registration category", "Research Analyst"),
            ("Supervisory body (RAASB)", f"BSE · membership {partner['raasbNo']}" if partner["raasbNo"] else "BSE"),
            ("Support", " · ".join(x for x in [partner["email"], partner["phone"]] if x) or "—"),
            ("Compliance officer", partner["complianceOfficer"] or "—"), ("Principal officer", partner["principalOfficer"] or "—"),
            ("Registered address", partner["registeredAddress"] or "—")]
    partner_html = ("<h3>Research analyst (licence holder details)</h3><table class=\"terms-kv\">"
                    + "".join(f"<tr><th>{e(k)}</th><td>{e(str(v))}</td></tr>" for k, v in rows) + "</table>"
                    "<p>The research analyst named above prepares and maintains this model portfolio and its updates, and is registered with "
                    "SEBI as a Research Analyst. The analyst does not handle your funds or securities and does not guarantee returns. "
                    "Registration granted by SEBI, membership of RAASB and certification from NISM in no way guarantee performance of the "
                    "intermediary or provide any assurance of returns to investors.</p>")
    prow = [("Legal name", pd.get("legalName") or "—"), ("Brand", pd.get("brand") or "Omnivest"), ("CIN", pd.get("cin") or "—"),
            ("Registered address", pd.get("registeredAddress") or "—"),
            ("Support", " · ".join(x for x in [pd.get("supportEmail"), pd.get("supportPhone")] if x) or "—"),
            ("Grievance officer", " · ".join(x for x in [pd.get("grievanceOfficer"), pd.get("grievanceEmail")] if x) or "—")]
    platform_html = ("<h3>Platform and merchant of record</h3><table class=\"terms-kv\">"
                     + "".join(f"<tr><th>{e(k)}</th><td>{e(str(v))}</td></tr>" for k, v in prow) + "</table>" + platform)
    doc_html = partner_html + platform_html
    version = f"{TERMS_TEMPLATE_VERSION}-{hashlib.sha256(doc_html.encode('utf-8')).hexdigest()[:12]}"
    return {"portfolio_id": pid, "portfolio_name": listing.get("name"), "partner": partner, "html": doc_html, "version": version,
            "paid": listing.get("subscription") == "Paid", "charter_html": charter}


async def current_consent(db: AsyncIOMotorDatabase, user_id: str, pid: str, version: str) -> Optional[dict]:
    return await db[CONSENTS].find_one({"user_id": user_id, "portfolio_id": pid, "terms_version": version}, {"_id": 0})


async def readiness(db: AsyncIOMotorDatabase, user: dict, pid: str) -> Dict[str, Any]:
    """What is still missing before this investor may pay for this listing."""
    missing: List[str] = []
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "billing": 1}) or {}
    if not billing_complete(fresh):
        missing.append("billing")
    terms = await terms_for(db, pid)
    consent = await current_consent(db, user["id"], pid, terms["version"]) if terms else None
    if not consent:
        missing.append("terms")
    return {"missing": missing, "billing": fresh.get("billing"), "terms_version": terms["version"] if terms else None,
            "consent": {"id": consent["id"], "terms_version": consent["terms_version"], "accepted_at": _iso(consent.get("accepted_at"))} if consent else None}


CONSENT_OTPS = "consent_otps"


async def send_consent_code(db: AsyncIOMotorDatabase, user: dict, phone: str, listing_name: str) -> Dict[str, Any]:
    """Own 6-digit code with the listing named in the SMS (Twilio Messages, TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID).
    Falls back to Twilio Verify's standard template when only Verify is configured; demo mode uses the demo code."""
    if phone_auth.DEMO_MODE:
        return {"demo": True, "channel": "demo"}
    sender = os.environ.get("TWILIO_MESSAGING_SERVICE_SID") or os.environ.get("TWILIO_FROM")
    if not (sender and phone_auth._client):
        r = await phone_auth.issue_otp(phone)
        return {"demo": r.get("demo", False), "channel": "verify"}
    code = f"{secrets.randbelow(900000) + 100000}"
    await db[CONSENT_OTPS].update_one({"user_id": user["id"]}, {"$set": {"user_id": user["id"], "phone": phone, "code_hash": hashlib.sha256(code.encode()).hexdigest(),
                                                                         "expires_at": _now() + timedelta(minutes=10), "attempts": 0, "sent_at": _now()}}, upsert=True)
    body = f"{code} is your OTP to confirm the Terms of Service for {listing_name} on Omnivest. Please read the Terms of Service before you confirm with OTP."
    kwargs = {"messaging_service_sid": sender} if sender.startswith("MG") else {"from_": sender}
    try:
        await run_in_threadpool(lambda: phone_auth._client.messages.create(to=phone, body=body, **kwargs))
    except Exception as ex:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Couldn't send the code: {ex}")
    return {"demo": False, "channel": "sms"}


async def check_consent_code(db: AsyncIOMotorDatabase, user: dict, phone: str, code: str) -> bool:
    if phone_auth.DEMO_MODE:
        return code == phone_auth.DEMO_CODE
    row = await db[CONSENT_OTPS].find_one({"user_id": user["id"]})
    if row and row.get("expires_at") and (row["expires_at"].replace(tzinfo=timezone.utc) if row["expires_at"].tzinfo is None else row["expires_at"]) > _now():
        if int(row.get("attempts") or 0) >= 5:
            return False
        ok = hmac.compare_digest(row.get("code_hash", ""), hashlib.sha256(code.encode()).hexdigest())
        if ok:
            await db[CONSENT_OTPS].delete_one({"user_id": user["id"]})
        else:
            await db[CONSENT_OTPS].update_one({"user_id": user["id"]}, {"$inc": {"attempts": 1}})
        return ok
    return await phone_auth.check_otp(phone, code)


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter()
    require_user = build_current_user_dep(db)

    @router.get("/checkout/states")
    async def states():
        return {"states": STATES}

    @router.get("/me/billing")
    async def get_billing(user: dict = Depends(require_user)):
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "billing": 1}) or {}
        return {"billing": fresh.get("billing") or {}, "complete": billing_complete(fresh)}

    @router.put("/me/billing")
    async def put_billing(payload: dict = Body(...), user: dict = Depends(require_user)):
        b = validate_billing(payload)
        await db.users.update_one({"id": user["id"]}, {"$set": {"billing": b, "billing_updated_at": _now()}})
        return {"billing": b, "complete": True}

    @router.get("/portfolios/{pid}/terms")
    async def get_terms(pid: str):
        t = await terms_for(db, pid)
        if not t:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return t

    @router.get("/checkout/status")
    async def status(portfolio_id: str = Query(...), user: dict = Depends(require_user)):
        return await readiness(db, user, portfolio_id)

    @router.post("/checkout/consent/request")
    async def consent_request(payload: dict = Body(default={}), user: dict = Depends(require_user)):
        """A one-time code to the investor's own mobile is the signature on the terms. The SMS names the listing:
        "<code> is your OTP to confirm the Terms of Service for <listing> on Omnivest. Please read the Terms of Service before you confirm with OTP."
        """
        phone = user.get("phone")
        if not phone:
            raise HTTPException(status_code=422, detail="Your account has no mobile number to send the code to.")
        listing = await db.analyst_portfolios.find_one({"id": (payload.get("portfolio_id") or "").strip()}, {"_id": 0, "name": 1}) or {}
        r = await send_consent_code(db, user, phone, listing.get("name") or "this model portfolio")
        return {"ok": True, "demo": r.get("demo", False), "phone_hint": f"{phone[:3]}•••••{phone[-3:]}", "channel": r.get("channel")}

    @router.post("/checkout/consent/confirm")
    async def consent_confirm(request: Request, payload: dict = Body(...), user: dict = Depends(require_user)):
        pid = (payload.get("portfolio_id") or "").strip()
        code = (payload.get("code") or "").strip()
        version = (payload.get("terms_version") or "").strip()
        terms = await terms_for(db, pid)
        if not terms:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if version != terms["version"]:
            raise HTTPException(status_code=409, detail="The terms changed while you were reading. Please review the latest version.")
        if not re.match(r"^\d{4,10}$", code) or not await check_consent_code(db, user, user.get("phone") or "", code):
            raise HTTPException(status_code=401, detail="That code is not right. Request a new one and try again.")
        existing = await current_consent(db, user["id"], pid, version)
        if existing:
            return {"ok": True, "consent": {"id": existing["id"], "terms_version": version, "accepted_at": _iso(existing.get("accepted_at"))}}
        fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "billing": 1, "name": 1, "phone": 1, "email": 1}) or {}
        c = {"id": str(uuid.uuid4()), "user_id": user["id"], "portfolio_id": pid, "portfolio_name": terms["portfolio_name"],
             "terms_version": version, "terms_html": terms["html"], "partner": terms["partner"],
             "signer": {"name": (fresh.get("billing") or {}).get("pan_name") or fresh.get("name"), "phone": fresh.get("phone"), "email": fresh.get("email"),
                        "pan": (fresh.get("billing") or {}).get("pan")},
             "method": "otp_sms", "ip": (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "") or "").split(",")[0].strip(),
             "user_agent": request.headers.get("user-agent", "")[:300], "accepted_at": _now()}
        await db[CONSENTS].insert_one(dict(c))
        return {"ok": True, "consent": {"id": c["id"], "terms_version": version, "accepted_at": _iso(c["accepted_at"])}}

    @router.get("/me/consents")
    async def my_consents(user: dict = Depends(require_user)):
        rows = await db[CONSENTS].find({"user_id": user["id"]}, {"_id": 0, "terms_html": 0}).sort("accepted_at", -1).to_list(100)
        for r in rows:
            r["accepted_at"] = _iso(r.get("accepted_at"))
        return {"consents": rows}

    return router
