"""Research-analyst listings: analysts manage their own profile & model
portfolios; admins approve them; approved ones are exposed publicly.

Collections:
  - users (analyst_profile stored on the user doc)
  - analyst_portfolios
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, UploadFile, File, Header
from fastapi.responses import Response
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep, decode_token
import performance as perf_engine
from listing_options import load_rules
from richtext import sanitize_html, plain_text
import storage


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Constituent(BaseModel):
    symbol: str = ""
    name: str = ""
    exchange: str = "NSE"
    type: str = "Stock"
    weight: float = 0


class Returns(BaseModel):
    cagr: float = 0
    y1: float = 0
    y3: float = 0
    y5: float = 0


class Factsheet(BaseModel):
    objective: str = ""
    whoShouldInvest: str = ""
    riskFactors: str = ""
    pdfName: str = ""      # metadata only for now (file upload = next phase)


class Plan(BaseModel):
    months: int = 1          # 1 / 3 / 6 / 12
    price: int = 0           # ₹ for the whole duration


class PortfolioIn(BaseModel):
    """Listing 2.0: the partner types only what a machine cannot know. Returns, risk and
    minimum investment are computed by the performance engine; `risk`/`minAmount`/`returns`
    are kept only for backward compatibility and ignored on the investor page."""
    name: str = Field(..., min_length=1, max_length=120)
    subtitle: str = ""
    strategy: str = "thematic"
    tags: List[str] = []
    benchmark: str = "NIFTY 50"
    rationale: str = ""          # rich text (sanitised HTML)
    methodology: str = ""        # rich text (sanitised HTML)
    videoUrl: str = ""           # optional YouTube / Vimeo link
    rebalanceFreq: str = "Quarterly"
    subscription: str = "Free"
    plans: List[Plan] = []       # paid listings: price per duration
    factsheet: Factsheet = Factsheet()
    constituents: List[Constituent] = []
    # legacy / compatibility
    risk: str = "Medium"
    minAmount: int = 5000
    feeAmount: int = 0
    feeCycle: str = "monthly"
    returns: Returns = Returns()


VIDEO_HOSTS = ("youtube.com", "youtu.be", "vimeo.com")


def _normalise(doc: dict) -> dict:
    """Sanitise rich text, derive legacy fee fields from plans, tidy tags."""
    doc["rationale"] = sanitize_html(doc.get("rationale"))
    doc["methodology"] = sanitize_html(doc.get("methodology"))
    doc["tags"] = [t.strip() for t in (doc.get("tags") or []) if isinstance(t, str) and t.strip()][:10]
    doc["videoUrl"] = (doc.get("videoUrl") or "").strip()
    plans = [{"months": int(p.get("months") or 0), "price": int(p.get("price") or 0)} for p in (doc.get("plans") or []) if isinstance(p, dict)]
    plans = sorted({p["months"]: p for p in plans if p["months"] > 0}.values(), key=lambda p: p["months"])
    doc["plans"] = plans
    if doc.get("subscription") == "Paid" and plans:
        cheapest = min(plans, key=lambda p: p["price"] / p["months"] if p["price"] > 0 else 1e12)
        doc["feeAmount"] = cheapest["price"]
        doc["feeCycle"] = {1: "monthly", 3: "quarterly", 6: "half-yearly", 12: "yearly"}.get(cheapest["months"], f"{cheapest['months']}-months")
    elif doc.get("subscription") != "Paid":
        doc["feeAmount"], doc["feeCycle"], doc["plans"] = 0, "monthly", []
    return doc


def _public_view(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _validate_complete(doc: dict, rules: Optional[dict] = None) -> List[str]:
    """Strict completeness check enforced when an analyst submits for approval.
    Drafts are allowed to be incomplete; this only gates the submit step.
    `rules` = admin-editable listing rules (listing_options.load_rules)."""
    from listing_options import RULE_DEFAULTS
    r = {**RULE_DEFAULTS, **(rules or {})}
    e: List[str] = []
    if not (doc.get("name") or "").strip():
        e.append("Portfolio name is required.")
    sub = (doc.get("subtitle") or "").strip()
    if not sub:
        e.append("Subtitle is required.")
    elif len(sub.split()) > r["max_subtitle_words"]:
        e.append(f"Subtitle must be {r['max_subtitle_words']} words or fewer.")
    if len(doc.get("tags") or []) > r["max_tags"]:
        e.append(f"Choose at most {r['max_tags']} style tags.")
    if doc.get("subscription") == "Paid":
        plans = [p for p in (doc.get("plans") or []) if (p.get("price") or 0) > 0]
        if not plans:
            e.append("Paid listings need at least one plan with a price.")
        for p in plans:
            if p.get("months") not in r["plan_durations"]:
                e.append(f"Plan duration {p.get('months')} months is not offered (allowed: {', '.join(str(x) for x in r['plan_durations'])}).")
            if p.get("price", 0) < r["min_plan_price"]:
                e.append(f"Plan price must be at least ₹{r['min_plan_price']}.")
    v = (doc.get("videoUrl") or "").strip()
    if v and (not r["allow_video"] or not v.startswith("http") or not any(h in v for h in VIDEO_HOSTS)):
        e.append("Intro video must be a YouTube or Vimeo link." if r["allow_video"] else "Intro videos are not enabled.")
    if not plain_text(doc.get("rationale")):
        e.append("Investment rationale is required.")
    if not plain_text(doc.get("methodology")):
        e.append("Methodology is required.")
    fs = doc.get("factsheet") or {}
    for k, label in (("objective", "objective"), ("whoShouldInvest", "who should invest"), ("riskFactors", "risk factors")):
        if not (fs.get(k) or "").strip():
            e.append(f"Factsheet {label} is required.")
    if r["factsheet_pdf_required"] and not doc.get("factsheet_pdf"):
        e.append("Factsheet PDF is required.")
    cons = doc.get("constituents") or []
    if len(cons) < r["min_constituents"]:
        e.append(f"Add at least {r['min_constituents']} constituents.")
    if len(cons) > r["max_constituents"]:
        e.append(f"At most {r['max_constituents']} constituents are allowed.")
    for i, c in enumerate(cons, 1):
        if not (c.get("symbol") or "").strip() or not (c.get("name") or "").strip():
            e.append(f"Constituent {i}: symbol and name are required.")
        if not (c.get("weight") or 0) > 0:
            e.append(f"Constituent {i}: weight must be greater than 0.")
        elif (c.get("weight") or 0) > r["max_weight_pct"]:
            e.append(f"{c.get('symbol') or f'Constituent {i}'}: weight {c.get('weight')}% exceeds the {r['max_weight_pct']}% cap per stock.")
    total = round(sum((c.get("weight") or 0) for c in cons))
    if cons and total != 100:
        e.append(f"Total allocation must equal exactly 100% (currently {total}%).")
    return e


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["analyst"])
    require_analyst = build_current_user_dep(db, ["analyst"])
    require_admin = build_current_user_dep(db, ["admin"])

    col = db.analyst_portfolios

    # ---------- Analyst: profile ----------
    @router.get("/analyst/profile")
    async def get_profile(user: dict = Depends(require_analyst)):
        prof = user.get("analyst_profile") or {
            "displayName": user.get("name", ""),
            "sebiReg": "",
            "philosophy": "",
            "description": "",
            "logo": (user.get("name", "AN")[:2]).upper(),
        }
        return {"profile": prof}

    @router.put("/analyst/profile")
    async def update_profile(payload: dict = Body(...), user: dict = Depends(require_analyst)):
        allowed = {k: payload.get(k, "") for k in ("displayName", "sebiReg", "philosophy", "description", "logo")}
        await db.users.update_one({"id": user["id"]}, {"$set": {"analyst_profile": allowed}})
        return {"profile": allowed}

    # ---------- Analyst: portfolios ----------
    @router.get("/analyst/portfolios")
    async def my_portfolios(user: dict = Depends(require_analyst)):
        docs = await col.find({"owner_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        return {"portfolios": docs}

    @router.post("/analyst/portfolios")
    async def create_portfolio(payload: PortfolioIn, user: dict = Depends(require_analyst)):
        prof = user.get("analyst_profile") or {}
        doc = _normalise(payload.dict())
        doc.update({
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "owner_name": prof.get("displayName") or user.get("name", ""),
            "status": "draft",
            "review_note": "",
            "created_at": _now(),
            "updated_at": _now(),
        })
        await col.insert_one(dict(doc))
        return {"portfolio": _public_view(doc)}

    @router.put("/analyst/portfolios/{pid}")
    async def update_portfolio(pid: str, payload: PortfolioIn, user: dict = Depends(require_analyst)):
        existing = await col.find_one({"id": pid, "owner_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        doc = _normalise(payload.dict())
        # editing an approved/pending item sends it back to draft (needs re-submit)
        doc["status"] = "draft"
        doc["updated_at"] = _now()
        doc["changes_requested"] = False
        if existing.get("status") == "approved":
            doc["was_live"] = True   # a live listing being rebalanced/edited: keep launch data, re-review
        # Rebalance history: once a listing has launched, a change in constituents
        # or weights is recorded as a new version (drives the rebalance timeline
        # and keeps the computed NAV series continuous).
        def _w(cons):
            return {(c.get("symbol") or "").upper(): float(c.get("weight") or 0) for c in (cons or []) if c.get("symbol")}
        if existing.get("launch_date") and _w(existing.get("constituents")) != _w(doc.get("constituents")):
            versions = existing.get("versions") or [{"effective_date": existing["launch_date"], "constituents": existing.get("constituents") or []}]
            versions.append({"effective_date": perf_engine.ist_today().isoformat(), "constituents": doc.get("constituents") or []})
            doc["versions"] = versions
        await col.update_one({"id": pid}, {"$set": doc})
        merged = await col.find_one({"id": pid}, {"_id": 0})
        return {"portfolio": merged}

    @router.post("/analyst/portfolios/{pid}/submit")
    async def submit_portfolio(pid: str, user: dict = Depends(require_analyst)):
        existing = await col.find_one({"id": pid, "owner_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        problems = _validate_complete(existing, await load_rules(db))
        if problems:
            raise HTTPException(status_code=422, detail={"message": "Portfolio is incomplete", "errors": problems})
        await col.update_one({"id": pid}, {"$set": {"status": "pending", "review_note": "", "changes_requested": False, "updated_at": _now()}})
        return {"ok": True, "status": "pending"}

    @router.get("/analyst/portfolios/{pid}/readiness")
    async def readiness(pid: str, user: dict = Depends(require_analyst)):
        """What is still missing before submit (same rules as the submit gate)."""
        existing = await col.find_one({"id": pid, "owner_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        rules = await load_rules(db)
        return {"missing": _validate_complete(existing, rules), "rules": rules}

    @router.delete("/analyst/portfolios/{pid}")
    async def delete_portfolio(pid: str, user: dict = Depends(require_analyst)):
        res = await col.delete_one({"id": pid, "owner_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return {"ok": True}

    # ---------- Factsheet PDF ----------
    @router.post("/analyst/portfolios/{pid}/factsheet")
    async def upload_factsheet(pid: str, file: UploadFile = File(...), user: dict = Depends(require_analyst)):
        existing = await col.find_one({"id": pid, "owner_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if (file.content_type or "") != "application/pdf" and not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status_code=422, detail="Please upload a PDF file.")
        data = await file.read()
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="PDF must be 10 MB or smaller.")
        path = f"{storage.APP_NAME}/factsheets/{user['id']}/{uuid.uuid4()}.pdf"
        try:
            result = storage.put_object(path, data, "application/pdf")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
        meta = {
            "storage_path": result["path"],
            "filename": file.filename or "factsheet.pdf",
            "size": result.get("size", len(data)),
            "uploaded_at": _now(),
        }
        await col.update_one({"id": pid}, {"$set": {"factsheet_pdf": meta, "updated_at": _now()}})
        return {"factsheet_pdf": meta}

    @router.delete("/analyst/portfolios/{pid}/factsheet")
    async def delete_factsheet(pid: str, user: dict = Depends(require_analyst)):
        res = await col.update_one(
            {"id": pid, "owner_id": user["id"]}, {"$set": {"factsheet_pdf": None, "updated_at": _now()}}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return {"ok": True}

    @router.get("/portfolios/{pid}/factsheet")
    async def download_factsheet(pid: str, authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
        doc = await col.find_one({"id": pid})
        if not doc or not doc.get("factsheet_pdf"):
            raise HTTPException(status_code=404, detail="Factsheet not found")
        # Approved factsheets are public; drafts require owner/admin.
        if doc.get("status") != "approved":
            token = None
            if authorization and authorization.startswith("Bearer "):
                token = authorization.split(" ", 1)[1].strip()
            elif auth:
                token = auth
            if not token:
                raise HTTPException(status_code=401, detail="Not authenticated")
            payload = decode_token(token)
            requester = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0})
            if not requester or (requester.get("role") != "admin" and requester["id"] != doc.get("owner_id")):
                raise HTTPException(status_code=403, detail="Not allowed")
        meta = doc["factsheet_pdf"]
        try:
            data, _ct = storage.get_object(meta["storage_path"])
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Download failed: {e}")
        fname = meta.get("filename", "factsheet.pdf")
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{fname}"'})

    # ---------- Admin: review ----------
    @router.get("/admin/portfolios")
    async def all_portfolios(status: Optional[str] = Query(default=None), user: dict = Depends(require_admin)):
        """Drafts are the partner's private work and never reach the admin console:
        only submitted (pending), approved and rejected listings are listed."""
        q = {"status": {"$in": ["pending", "approved", "rejected", "paused"]}}
        if status in ("pending", "approved", "rejected", "paused"):
            q = {"status": status}
        docs = await col.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        counts = {k: 0 for k in ("pending", "approved", "rejected", "paused")}
        async for row in col.aggregate([{"$match": {"status": {"$in": list(counts)}}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
            counts[row["_id"]] = row["n"]
        return {"portfolios": docs, "counts": counts}

    @router.post("/admin/portfolios/{pid}/review")
    async def review_portfolio(pid: str, background: BackgroundTasks, payload: dict = Body(...), user: dict = Depends(require_admin)):
        action = (payload.get("action") or "").lower()
        if action not in ("approve", "reject", "request_changes"):
            raise HTTPException(status_code=422, detail="action must be 'approve', 'reject' or 'request_changes'")
        note = (payload.get("note") or "").strip()
        if action in ("reject", "request_changes") and len(note) < 5:
            raise HTTPException(status_code=422, detail="Add a note for the partner (at least 5 characters) — they see it in their console.")
        new_status = {"approve": "approved", "reject": "rejected", "request_changes": "draft"}[action]
        update = {
            "status": new_status,
            "review_note": note,
            "changes_requested": action == "request_changes",
            "reviewed_at": _now(),
            "updated_at": _now(),
        }
        existing = await col.find_one({"id": pid}, {"_id": 0, "id": 1, "launch_date": 1, "status": 1})
        if existing is None or existing.get("status") == "draft":
            # drafts are invisible to admin; approval is only possible via the partner's submit gate
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if action in ("approve", "request_changes") and existing.get("status") != "pending":
            raise HTTPException(status_code=409, detail="Only submitted (pending) listings can be approved or sent back.")
        # First approval = launch day. Constituents are "bought" at the last NSE
        # close available right now (weekend / pre-close approvals roll back to
        # the previous trading day) and the computed track record starts there.
        if new_status == "approved" and not existing.get("launch_date"):
            update["launch_date"] = perf_engine.ist_today().isoformat()
            update["launch_price_date"] = perf_engine.last_close_date().isoformat()
        await col.update_one({"id": pid}, {"$set": update})
        if new_status == "approved" and perf_engine.ENGINE is not None:
            background.add_task(perf_engine.ENGINE.refresh_bg, pid)
        return {"ok": True, "status": new_status, "launch_date": update.get("launch_date") or existing.get("launch_date"),
                "launch_price_date": update.get("launch_price_date")}

    @router.post("/admin/portfolios/{pid}/feature")
    async def feature_portfolio(pid: str, payload: dict = Body(default={}), user: dict = Depends(require_admin)):
        """Pin a live listing to the top of the explore page."""
        doc = await col.find_one({"id": pid, "status": {"$ne": "draft"}}, {"_id": 0, "id": 1, "status": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        featured = bool(payload.get("featured", True))
        await col.update_one({"id": pid}, {"$set": {"featured": featured, "featured_at": _now() if featured else None}})
        return {"ok": True, "featured": featured}

    @router.post("/admin/portfolios/{pid}/pause")
    async def pause_portfolio(pid: str, payload: dict = Body(default={}), user: dict = Depends(require_admin)):
        """Take a live listing off the site with a reason the partner can read. Track record is kept."""
        doc = await col.find_one({"id": pid}, {"_id": 0, "id": 1, "status": 1, "name": 1})
        if not doc or doc["status"] not in ("approved", "paused"):
            raise HTTPException(status_code=404, detail="Only live listings can be paused")
        reason = (payload.get("reason") or "").strip()
        if len(reason) < 5:
            raise HTTPException(status_code=422, detail="Give the partner a reason (at least 5 characters).")
        await col.update_one({"id": pid}, {"$set": {"status": "paused", "review_note": reason, "paused_at": _now(), "updated_at": _now(), "featured": False}})
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "listing_paused", "portfolio_id": pid, "portfolio_name": doc.get("name"),
                                       "reason": reason, "admin": user.get("email"), "at": _now()})
        return {"ok": True, "status": "paused"}

    @router.post("/admin/portfolios/{pid}/resume")
    async def resume_portfolio(pid: str, user: dict = Depends(require_admin)):
        doc = await col.find_one({"id": pid, "status": "paused"}, {"_id": 0, "id": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Listing is not paused")
        await col.update_one({"id": pid}, {"$set": {"status": "approved", "review_note": "", "updated_at": _now()}})
        return {"ok": True, "status": "approved"}

    async def _is_admin(authorization: Optional[str]) -> bool:
        if not authorization or not authorization.lower().startswith("bearer "):
            return False
        try:
            payload = decode_token(authorization.split(" ", 1)[1])
            u = await db.users.find_one({"id": payload.get("sub")}, {"_id": 0, "role": 1})
            return bool(u and u.get("role") == "admin")
        except Exception:  # noqa: BLE001
            return False

    # ---------- Public ----------
    @router.get("/portfolios")
    async def public_portfolios(background: BackgroundTasks):
        docs = await col.find({"status": "approved"}, {"_id": 0, "owner_id": 0, "review_note": 0}).sort([("featured", -1), ("updated_at", -1)]).to_list(1000)
        # computed performance summary per card (auto-refreshed in the background when stale)
        if docs and perf_engine.ENGINE is not None:
            summaries = await perf_engine.ENGINE.summaries([d["id"] for d in docs], background)
            for d in docs:
                d["computed"] = summaries.get(d["id"])
        return {"portfolios": docs}

    @router.get("/portfolios/{pid}")
    async def public_portfolio(pid: str, authorization: Optional[str] = Header(None)):
        """Approved listings are public. Admins may preview a submitted (pending/paused/rejected)
        listing exactly as investors would see it; drafts stay private to the partner."""
        doc = await col.find_one({"id": pid}, {"_id": 0})
        if not doc or doc.get("status") == "draft":
            raise HTTPException(status_code=404, detail="Portfolio not found")
        if doc.get("status") != "approved":
            if not await _is_admin(authorization):
                raise HTTPException(status_code=404, detail="Portfolio not found")
            doc["preview"] = True
        owner_id = doc.pop("owner_id", None)
        doc.pop("review_note", None)
        # manager card: approved-partner record merged with the analyst's own profile
        mgr = await db.managers.find_one({"user_id": owner_id, "active": True}, {"_id": 0}) if owner_id else None
        usr = await db.users.find_one({"id": owner_id}, {"_id": 0, "analyst_profile": 1, "name": 1}) if owner_id else None
        prof = (usr or {}).get("analyst_profile") or {}
        live_count = await col.count_documents({"owner_id": owner_id, "status": "approved"}) if owner_id else 0
        doc["manager"] = {
            "id": (mgr or {}).get("id"),
            "name": prof.get("displayName") or (mgr or {}).get("name") or doc.get("owner_name") or (usr or {}).get("name"),
            "firm": (mgr or {}).get("firm", ""),
            "logo": prof.get("logo") or (mgr or {}).get("logo") or (doc.get("owner_name") or "RA")[:2].upper(),
            "sebiReg": prof.get("sebiReg") or (mgr or {}).get("sebi_reg", ""),
            "philosophy": prof.get("philosophy") or (mgr or {}).get("philosophy", ""),
            "description": prof.get("description") or (mgr or {}).get("description", ""),
            "experienceYears": (mgr or {}).get("experience_years", ""),
            "website": (mgr or {}).get("website", ""),
            "listings": live_count,
        }
        return {"portfolio": doc}

    return router
