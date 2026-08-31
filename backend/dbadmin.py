"""Admin-only, read-only database viewer.

Lists collections with counts and returns paginated documents with sensitive
fields redacted. Admin-authenticated; safe for use on the live site.
"""
from __future__ import annotations

import re
import csv
import io
import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

# Collections are auto-discovered from the database. Only Mongo/internal system
# collections are excluded (never the app's own data).
EXCLUDED = {"system.indexes", "system.views", "system.profile", "system.js"}

# Clearing this collection from the UI is blocked entirely.
CLEAR_BLOCKED = {"broker_orders"}

# Clearing these requires the admin to type the collection name to confirm.
CLEAR_REQUIRE_CONFIRM = {"users", "partner_applications", "managers", "analyst_portfolios"}

# Field names (case-insensitive substring match) whose values are redacted:
# password hashes, api secrets, access/request tokens (kite_sessions,
# broker_connections) and OTP codes.
SENSITIVE = ("password", "hash", "secret", "token", "code", "otp")


def _is_excluded(name: str) -> bool:
    return name in EXCLUDED or name.startswith("system.")


async def _list_allowed(db) -> list:
    names = await db.list_collection_names()
    return [n for n in names if not _is_excluded(n)]


def _redact(value):
    if isinstance(value, dict):
        return {k: ("••• redacted •••" if any(s in k.lower() for s in SENSITIVE) else _redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(v) for v in value]
    return value


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/admin/db", tags=["db-admin"])
    require_admin = build_current_user_dep(db, ["admin"])

    @router.get("/collections")
    async def collections(_: dict = Depends(require_admin)):
        out = []
        for name in sorted(await _list_allowed(db)):
            out.append({"name": name, "count": await db[name].estimated_document_count()})
        return {"collections": out}

    @router.get("/{collection}")
    async def documents(
        collection: str,
        skip: int = Query(0, ge=0),
        limit: int = Query(25, ge=1, le=100),
        q: Optional[str] = Query(None),
        _: dict = Depends(require_admin),
    ):
        if collection not in await _list_allowed(db):
            raise HTTPException(status_code=404, detail="Collection not available")
        query = {}
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            query = {"$or": [{f: rx} for f in ("email", "name", "type", "status", "id", "owner_name", "tradingsymbol", "symbol", "firm", "question")]}
        total = await db[collection].count_documents(query)
        cursor = db[collection].find(query, {"_id": 0})
        try:
            cursor = cursor.sort("created_at", -1)
        except Exception:  # noqa: BLE001
            pass
        docs = await cursor.skip(skip).limit(limit).to_list(limit)
        return {"collection": collection, "total": total, "skip": skip, "limit": limit, "documents": [_redact(d) for d in docs]}

    @router.get("/{collection}/export")
    async def export_csv(collection: str, _: dict = Depends(require_admin)):
        if collection not in await _list_allowed(db):
            raise HTTPException(status_code=404, detail="Collection not available")
        docs = await db[collection].find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
        docs = [_redact(d) for d in docs]
        # union of keys, stable order (first-seen)
        headers: list[str] = []
        for d in docs:
            for k in d.keys():
                if k not in headers:
                    headers.append(k)
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(headers or ["(empty)"])
        for d in docs:
            row = []
            for k in headers:
                v = d.get(k, "")
                row.append(json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)
            writer.writerow(row)
        return Response(
            content=buf.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{collection}.csv"'},
        )

    @router.delete("/{collection}/{doc_id}")
    async def delete_document(collection: str, doc_id: str, _: dict = Depends(require_admin)):
        if collection not in await _list_allowed(db):
            raise HTTPException(status_code=404, detail="Collection not available")
        doc = await db[collection].find_one({"id": doc_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Record not found")
        if collection == "users" and doc.get("role") == "admin":
            raise HTTPException(status_code=403, detail="Admin accounts are protected and cannot be deleted here.")
        await db[collection].delete_one({"id": doc_id})
        return {"ok": True}

    @router.post("/{collection}/clear")
    async def clear_collection(collection: str, payload: dict = Body(default={}), _: dict = Depends(require_admin)):
        if collection not in await _list_allowed(db):
            raise HTTPException(status_code=404, detail="Collection not available")
        if collection in CLEAR_BLOCKED:
            raise HTTPException(status_code=403, detail="This collection cannot be cleared from the admin console.")
        if collection in CLEAR_REQUIRE_CONFIRM and (payload or {}).get("confirm") != collection:
            raise HTTPException(status_code=400, detail=f'Type "{collection}" to confirm clearing this collection.')
        if collection == "users":
            # never wipe admin accounts
            res = await db.users.delete_many({"role": {"$ne": "admin"}})
        else:
            res = await db[collection].delete_many({})
        return {"ok": True, "deleted": res.deleted_count}

    return router
