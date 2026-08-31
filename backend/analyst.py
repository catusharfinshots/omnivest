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

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File, Header
from fastapi.responses import Response
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep, decode_token
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


class PortfolioIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    subtitle: str = ""
    strategy: str = "thematic"
    risk: str = "Medium"
    minAmount: int = 5000
    subscription: str = "Free"
    feeAmount: int = 0
    feeCycle: str = "monthly"
    methodology: str = ""
    rebalanceFreq: str = "Quarterly"
    constituents: List[Constituent] = []
    returns: Returns = Returns()
    factsheet: Factsheet = Factsheet()


def _public_view(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


def _validate_complete(doc: dict) -> List[str]:
    """Strict completeness check enforced when an analyst submits for approval.
    Drafts are allowed to be incomplete; this only gates the submit step."""
    e: List[str] = []
    if not (doc.get("name") or "").strip():
        e.append("Portfolio name is required.")
    sub = (doc.get("subtitle") or "").strip()
    if not sub:
        e.append("Subtitle is required.")
    elif len(sub.split()) > 30:
        e.append("Subtitle must be 30 words or fewer.")
    if not (doc.get("minAmount") or 0) > 0:
        e.append("Minimum investment must be greater than 0.")
    if doc.get("subscription") == "Paid" and not (doc.get("feeAmount") or 0) > 0:
        e.append("Fee amount is required for paid subscriptions.")
    if not (doc.get("methodology") or "").strip():
        e.append("Methodology is required.")
    fs = doc.get("factsheet") or {}
    for k, label in (("objective", "objective"), ("whoShouldInvest", "who should invest"), ("riskFactors", "risk factors")):
        if not (fs.get(k) or "").strip():
            e.append(f"Factsheet {label} is required.")
    if not doc.get("factsheet_pdf"):
        e.append("Factsheet PDF is required.")
    cons = doc.get("constituents") or []
    if not cons:
        e.append("Add at least one constituent.")
    for i, c in enumerate(cons, 1):
        if not (c.get("symbol") or "").strip() or not (c.get("name") or "").strip():
            e.append(f"Constituent {i}: symbol and name are required.")
        if not (c.get("weight") or 0) > 0:
            e.append(f"Constituent {i}: weight must be greater than 0.")
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
        doc = payload.dict()
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
        doc = payload.dict()
        # editing an approved/pending item sends it back to draft (needs re-submit)
        doc["status"] = "draft"
        doc["updated_at"] = _now()
        await col.update_one({"id": pid}, {"$set": doc})
        merged = await col.find_one({"id": pid}, {"_id": 0})
        return {"portfolio": merged}

    @router.post("/analyst/portfolios/{pid}/submit")
    async def submit_portfolio(pid: str, user: dict = Depends(require_analyst)):
        existing = await col.find_one({"id": pid, "owner_id": user["id"]})
        if not existing:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        problems = _validate_complete(existing)
        if problems:
            raise HTTPException(status_code=422, detail={"message": "Portfolio is incomplete", "errors": problems})
        await col.update_one({"id": pid}, {"$set": {"status": "pending", "review_note": "", "updated_at": _now()}})
        return {"ok": True, "status": "pending"}

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
        q = {}
        if status:
            q["status"] = status
        docs = await col.find(q, {"_id": 0}).sort("updated_at", -1).to_list(1000)
        return {"portfolios": docs}

    @router.post("/admin/portfolios/{pid}/review")
    async def review_portfolio(pid: str, payload: dict = Body(...), user: dict = Depends(require_admin)):
        action = (payload.get("action") or "").lower()
        if action not in ("approve", "reject"):
            raise HTTPException(status_code=422, detail="action must be 'approve' or 'reject'")
        new_status = "approved" if action == "approve" else "rejected"
        res = await col.update_one({"id": pid}, {"$set": {
            "status": new_status,
            "review_note": payload.get("note", ""),
            "reviewed_at": _now(),
            "updated_at": _now(),
        }})
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return {"ok": True, "status": new_status}

    # ---------- Public ----------
    @router.get("/portfolios")
    async def public_portfolios():
        docs = await col.find({"status": "approved"}, {"_id": 0, "owner_id": 0, "review_note": 0}).sort("updated_at", -1).to_list(1000)
        return {"portfolios": docs}

    @router.get("/portfolios/{pid}")
    async def public_portfolio(pid: str):
        doc = await col.find_one({"id": pid, "status": "approved"}, {"_id": 0, "owner_id": 0, "review_note": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return {"portfolio": doc}

    return router
