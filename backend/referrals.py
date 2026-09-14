"""Share with friends: personal referral links, attribution, counts, and subscription credits.

  code        users.referral_code, made once (initials + 4 random chars, e.g. TS7K2Q); link = /r/<code>
  invited     distinct devices that opened the link (referral_visits, one row per code+sid)
  joined      users.referred_by set when a NEW account signs up within 30 days of opening the link
  invested    users.referral_converted_at set when the referred account places its first order batch
  reward      on conversion, both sides get a subscription credit (credits ledger) if rewards are enabled;
              amounts and the switch live in app_settings {_id: "referrals"} and are admin-editable.
              Credits are redeemed at checkout (next step); balances show in the invite modal already.
Nothing about the friend is shown to the referrer beyond the counts.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

logger = logging.getLogger("referrals")
SETTINGS_ID = "referrals"
DEFAULTS = {"enabled": True, "referrer_amount": 100, "friend_amount": 100, "currency": "INR", "credit_months": 12,
            "note": "Credits apply to subscription fees on Omnivest. They are not cash and cannot be withdrawn."}
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # no 0/O/1/I/L


def _now():
    return datetime.now(timezone.utc)


def make_code(name: str, rnd: Optional[str] = None) -> str:
    """Initials (up to 2 letters) + 4 unambiguous characters."""
    initials = "".join(w[0] for w in (name or "").split() if w and w[0].isalpha())[:2].upper() or "OM"
    tail = rnd or "".join(secrets.choice(ALPHABET) for _ in range(4))
    return f"{initials}{tail}"


def share_text(link: str, name: str = "") -> str:
    who = f"{name.split()[0]} uses" if name else "I use"
    return f"{who} Omnivest for expert-built model portfolios, invested straight from your own broker account. Join with my link: {link}"


def reward_for(settings: dict) -> dict:
    s = {**DEFAULTS, **(settings or {})}
    return {"enabled": bool(s.get("enabled")), "referrer_amount": int(s.get("referrer_amount") or 0), "friend_amount": int(s.get("friend_amount") or 0),
            "currency": s.get("currency") or "INR", "credit_months": int(s.get("credit_months") or 12), "note": s.get("note") or DEFAULTS["note"]}


async def settings(db) -> dict:
    return reward_for(await db.app_settings.find_one({"_id": SETTINGS_ID}) or {})


async def ensure_code(db, user: dict) -> str:
    if user.get("referral_code"):
        return user["referral_code"]
    for _ in range(20):
        code = make_code(user.get("name") or "")
        if not await db.users.find_one({"referral_code": code}, {"_id": 1}):
            await db.users.update_one({"id": user["id"]}, {"$set": {"referral_code": code}})
            return code
    raise HTTPException(status_code=500, detail="Could not make a referral code")


async def attribute_signup(db, new_user_id: str, code: Optional[str]) -> Optional[str]:
    """Called right after a NEW account is created. Returns the referrer's id when the code is valid."""
    if not code:
        return None
    ref = await db.users.find_one({"referral_code": str(code).strip().upper()}, {"_id": 0, "id": 1})
    if not ref or ref["id"] == new_user_id:
        return None
    await db.users.update_one({"id": new_user_id}, {"$set": {"referred_by": ref["id"], "referred_at": _now()}})
    return ref["id"]


async def credit(db, user_id: str, amount: int, reason: str, months: int, ref_user_id: Optional[str] = None, key: Optional[str] = None) -> bool:
    if amount <= 0:
        return False
    doc = {"id": uuid.uuid4().hex[:12], "user_id": user_id, "amount": int(amount), "reason": reason, "ref_user_id": ref_user_id, "key": key,
           "at": _now(), "expires_at": _now() + timedelta(days=30 * months), "redeemed": 0}
    if key:
        res = await db.credits.update_one({"user_id": user_id, "key": key}, {"$setOnInsert": doc}, upsert=True)
        return bool(res.upserted_id)
    await db.credits.insert_one(doc)
    return True


async def pending_welcome(db, user_id: str) -> int:
    """The friend's one-time credit that has not been earned yet. Locked with Tushar on 14 Sep 2026: a referred account
    converts on its first paid subscription OR its first placed order, whichever comes first, once. On the paid path the
    welcome amount is applied to that very first checkout, so this is what the checkout may deduct before conversion."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "referred_by": 1, "referral_converted_at": 1})
    if not u or not u.get("referred_by") or u.get("referral_converted_at"):
        return 0
    s = await settings(db)
    return int(s["friend_amount"]) if s["enabled"] else 0


async def convert(db, user_id: str, source: str = "order") -> None:
    """The referred account did its first qualifying thing (`source` = "order" placed at the broker, or "subscription"
    paid): mark it, credit both sides, tell the referrer. Idempotent, one reward per friend.
    Partners (analysts) never subscribe, so a partner referrer gets the count and the notification but no credit."""
    try:
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "name": 1, "referred_by": 1, "referral_converted_at": 1})
        if not u or not u.get("referred_by") or u.get("referral_converted_at"):
            return
        res = await db.users.update_one({"id": user_id, "referral_converted_at": {"$exists": False}}, {"$set": {"referral_converted_at": _now(), "referral_converted_via": source}})
        if not res.modified_count:
            return
        s = await settings(db)
        ref = await db.users.find_one({"id": u["referred_by"]}, {"_id": 0, "role": 1}) or {}
        referrer_paid = s["enabled"] and s["referrer_amount"] > 0 and ref.get("role") != "analyst"
        if s["enabled"]:
            if referrer_paid:
                await credit(db, u["referred_by"], s["referrer_amount"], "A friend you invited subscribed" if source == "subscription" else "A friend you invited started investing",
                             s["credit_months"], user_id, key=f"ref:{user_id}:referrer")
            await credit(db, user_id, s["friend_amount"], "Welcome credit for joining through a friend", s["credit_months"], u["referred_by"], key=f"ref:{user_id}:friend")
        import notifications as notif
        did = "subscribed to a paid portfolio" if source == "subscription" else "placed their first order"
        body = f"Someone you invited {did}." + (f" ₹{s['referrer_amount']} subscription credit added." if referrer_paid else "")
        await notif.push(db, u["referred_by"], "account", "referral", "Your invite paid off", body, "/dashboard?invite=1", key=f"ref:{user_id}:converted")
    except Exception as e:  # noqa: BLE001
        logger.warning("referral convert failed for %s: %s", user_id, str(e)[:120])


async def redeem(db, user_id: str, amount_rs: int, key: str) -> int:
    """Consume up to `amount_rs` of live credit, oldest expiry first. Idempotent per `key` (one order = one redemption).
    Returns the amount actually redeemed."""
    amount_rs = int(amount_rs or 0)
    if amount_rs <= 0:
        return 0
    claim = await db.credit_redemptions.update_one({"user_id": user_id, "key": key}, {"$setOnInsert": {"user_id": user_id, "key": key, "amount": 0, "at": _now()}}, upsert=True)
    if not claim.upserted_id:
        prev = await db.credit_redemptions.find_one({"user_id": user_id, "key": key}, {"_id": 0, "amount": 1})
        return int((prev or {}).get("amount") or 0)
    now, left, used = _now(), amount_rs, 0
    rows = await db.credits.find({"user_id": user_id}, {"_id": 1, "amount": 1, "redeemed": 1, "expires_at": 1}).sort("expires_at", 1).to_list(500)
    for r in rows:
        exp = r.get("expires_at")
        if exp and (exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)) <= now:
            continue
        avail = int(r.get("amount") or 0) - int(r.get("redeemed") or 0)
        if avail <= 0 or left <= 0:
            continue
        take = min(avail, left)
        await db.credits.update_one({"_id": r["_id"]}, {"$inc": {"redeemed": take}})
        left -= take; used += take
    await db.credit_redemptions.update_one({"user_id": user_id, "key": key}, {"$set": {"amount": used}})
    return used


async def balance(db, user_id: str) -> dict:
    rows = await db.credits.find({"user_id": user_id}, {"_id": 0}).sort("at", -1).to_list(200)
    now = _now()
    live = [r for r in rows if (r.get("expires_at") and (r["expires_at"] if r["expires_at"].tzinfo else r["expires_at"].replace(tzinfo=timezone.utc)) > now)]
    bal = sum(int(r.get("amount") or 0) - int(r.get("redeemed") or 0) for r in live)
    return {"balance": max(0, bal), "ledger": [{"amount": r["amount"], "reason": r.get("reason"), "at": (r["at"] if r["at"].tzinfo else r["at"].replace(tzinfo=timezone.utc)).isoformat(), "expires_at": (r["expires_at"] if r["expires_at"].tzinfo else r["expires_at"].replace(tzinfo=timezone.utc)).isoformat() if r.get("expires_at") else None} for r in rows[:20]]}


async def statement(db, user_id: str) -> dict:
    """Everything the investor needs to see about their credit: balance, when it expires, what is still waiting,
    and a history of what was earned from whom and what was used on which plan."""
    now = _now()
    aw = lambda d: d if d.tzinfo else d.replace(tzinfo=timezone.utc)  # noqa: E731
    rows = await db.credits.find({"user_id": user_id}, {"_id": 0}).sort("at", -1).to_list(200)
    live = [r for r in rows if r.get("expires_at") and aw(r["expires_at"]) > now and int(r.get("amount") or 0) - int(r.get("redeemed") or 0) > 0]
    balance = sum(int(r["amount"]) - int(r.get("redeemed") or 0) for r in live)
    expires_at = min(aw(r["expires_at"]) for r in live) if live else None
    welcome = await pending_welcome(db, user_id)
    s = await settings(db)
    me = await db.users.find_one({"id": user_id}, {"_id": 0, "referred_by": 1}) or {}
    ids = {r["ref_user_id"] for r in rows if r.get("ref_user_id")} | ({me["referred_by"]} if me.get("referred_by") else set())
    names = {u["id"]: (u.get("name") or "").split(" ")[0] for u in await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200)} if ids else {}
    entries = []
    for r in rows:
        who = names.get(r.get("ref_user_id")) or "a friend"
        key = r.get("key") or ""
        if key.endswith(":friend"):
            title, sub = "Welcome credit", f"You joined through {who}'s link"
        elif key.endswith(":referrer"):
            title, sub = f"{who} {'subscribed' if 'subscribed' in (r.get('reason') or '') else 'started investing'}", "Your invite"
        else:
            title, sub = r.get("reason") or "Credit", ""
        expired = bool(r.get("expires_at")) and aw(r["expires_at"]) <= now and int(r["amount"]) - int(r.get("redeemed") or 0) > 0
        entries.append({"kind": "earned", "amount": int(r["amount"]), "title": title, "sub": sub + (" · expired" if expired else ""), "at": aw(r["at"]).isoformat(),
                        "expires_at": aw(r["expires_at"]).isoformat() if r.get("expires_at") else None, "expired": expired})
    used = await db.credit_redemptions.find({"user_id": user_id, "amount": {"$gt": 0}}, {"_id": 0}).sort("at", -1).to_list(200)
    order_ids = [u["key"][6:] for u in used if (u.get("key") or "").startswith("order:")]
    orders = {o["id"]: o for o in await db.payment_orders.find({"id": {"$in": order_ids}}, {"_id": 0, "id": 1, "portfolio_name": 1, "plan_months": 1}).to_list(200)} if order_ids else {}
    for u in used:
        o = orders.get((u.get("key") or "")[6:], {})
        entries.append({"kind": "used", "amount": -int(u["amount"]), "title": f"Used on {o.get('portfolio_name') or 'a subscription'}",
                        "sub": f"{o.get('plan_months')}-month plan" if o.get("plan_months") else "", "at": aw(u["at"]).isoformat(), "expires_at": None, "expired": False})
    entries.sort(key=lambda e: e["at"], reverse=True)
    return {"balance": balance, "welcome": welcome, "available": balance + welcome, "expires_at": expires_at.isoformat() if expires_at else None,
            "referrer_name": names.get(me.get("referred_by")) if me.get("referred_by") else None, "reward": s, "entries": entries}


def qr_svg(link: str) -> str:
    try:
        import segno
        return segno.make(link, error="m").svg_inline(scale=4, border=1, dark="#0F1729", light=None)
    except Exception as e:  # noqa: BLE001
        logger.info("qr unavailable: %s", str(e)[:80])
        return ""


def build_router(db: AsyncIOMotorDatabase, site_url: str = "https://omnivest.in") -> APIRouter:
    router = APIRouter(tags=["referrals"])
    require_user = build_current_user_dep(db)
    require_admin = build_current_user_dep(db, ["admin"])

    @router.get("/referrals/me")
    async def me(user: dict = Depends(require_user)):
        code = await ensure_code(db, user)
        link = f"{site_url}/r/{code}"
        invited = await db.referral_visits.count_documents({"code": code})
        joined_ids = [u["id"] for u in await db.users.find({"referred_by": user["id"]}, {"_id": 0, "id": 1, "referral_converted_at": 1}).to_list(1000)]
        invested = await db.users.count_documents({"referred_by": user["id"], "referral_converted_at": {"$exists": True}})
        return {"code": code, "link": link, "share_text": share_text(link, user.get("name") or ""), "qr_svg": qr_svg(link),
                "counts": {"invited": max(invited, len(joined_ids)), "joined": len(joined_ids), "invested": invested},
                "reward": await settings(db), "credits": await balance(db, user["id"])}

    @router.get("/referrals/credits")
    async def credits(user: dict = Depends(require_user)):
        return await statement(db, user["id"])

    @router.post("/referrals/visit")
    async def visit(payload: dict = Body(...)):
        code, sid = str(payload.get("code") or "").strip().upper(), str(payload.get("sid") or "")[:80]
        if not code or not sid:
            return {"ok": False}
        ref = await db.users.find_one({"referral_code": code}, {"_id": 0, "id": 1, "name": 1})
        if not ref:
            return {"ok": False, "valid": False}
        await db.referral_visits.update_one({"code": code, "sid": sid}, {"$setOnInsert": {"code": code, "sid": sid, "at": _now(), "referrer_id": ref["id"]}}, upsert=True)
        first = (ref.get("name") or "").split(" ")[0]
        return {"ok": True, "valid": True, "referrer_first_name": first, "reward": await settings(db)}

    @router.get("/admin/referrals/settings")
    async def get_settings(admin: dict = Depends(require_admin)):
        return await settings(db)

    @router.put("/admin/referrals/settings")
    async def put_settings(payload: dict = Body(...), admin: dict = Depends(require_admin)):
        upd = {k: payload[k] for k in ("enabled", "referrer_amount", "friend_amount", "credit_months", "note") if k in payload}
        for k in ("referrer_amount", "friend_amount", "credit_months"):
            if k in upd:
                upd[k] = max(0, int(upd[k] or 0))
        await db.app_settings.update_one({"_id": SETTINGS_ID}, {"$set": {**upd, "updated_at": _now(), "updated_by": admin["id"]}}, upsert=True)
        return await settings(db)

    @router.get("/admin/referrals")
    async def table(admin: dict = Depends(require_admin), limit: int = Query(200, ge=1, le=1000)):
        refs = await db.users.find({"referral_code": {"$exists": True}}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "role": 1, "referral_code": 1}).to_list(limit)
        out = []
        for r in refs:
            joined = await db.users.find({"referred_by": r["id"]}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1, "referred_at": 1, "referral_converted_at": 1, "referral_converted_via": 1}).to_list(500)
            out.append({"referrer": {"id": r["id"], "name": r.get("name"), "phone": r.get("phone"), "email": r.get("email"), "role": r.get("role"), "code": r["referral_code"]},
                        "invited": await db.referral_visits.count_documents({"code": r["referral_code"]}), "joined": len(joined),
                        "invested": sum(1 for j in joined if j.get("referral_converted_at")),
                        "friends": [{"name": j.get("name") or "—", "phone": j.get("phone"), "email": j.get("email"), "via": j.get("referral_converted_via"),
                                     "joined_at": j["referred_at"].isoformat() if isinstance(j.get("referred_at"), datetime) else None,
                                     "invested_at": j["referral_converted_at"].isoformat() if isinstance(j.get("referral_converted_at"), datetime) else None} for j in joined]})
        out.sort(key=lambda x: (-x["invested"], -x["joined"], -x["invited"]))
        credits_total = await db.credits.aggregate([{"$group": {"_id": None, "issued": {"$sum": "$amount"}, "redeemed": {"$sum": "$redeemed"}}}]).to_list(1)
        return {"rows": out, "credits": (credits_total[0] if credits_total else {"issued": 0, "redeemed": 0}), "settings": await settings(db)}

    return router
