"""Learn (the Omnivest blog): posts written by the admin, read by everyone.

Collection  learn_posts  {id, slug, title, category, excerpt, body(html, sanitised), status draft|published,
                          cover_asset (learn_covers.id or None), related_portfolio_id, read_min,
                          published_at, created_at, updated_at, views}
            learn_covers {id, post_id, mime, size, data, uploaded_at}

Public   GET /learn/posts                published, newest first (no body)
         GET /learn/posts/{slug}         one published post + related listing card + three more reads
         GET /learn/cover/{asset}        the uploaded cover image
Admin    GET/POST /admin/learn, PUT/DELETE /admin/learn/{id}, POST/DELETE /admin/learn/{id}/cover
Share    og.py renders /learn/<slug> with the post's own card (see og_learn_page / og_learn_image).

Built 16 Sep 2026 after Tushar asked where to post his first blog: the six Learn articles were placeholders
hardcoded in the frontend. They are imported once as DRAFTS so he can rewrite, publish or delete them.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from auth import build_current_user_dep
from richtext import sanitize_article

CATEGORIES = ["Basics", "How it works", "Strategy", "Markets", "Product"]
ALLOWED_MIME = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
MAX_BYTES = 3 * 1024 * 1024
PUBLIC_FIELDS = {"_id": 0, "id": 1, "slug": 1, "title": 1, "category": 1, "excerpt": 1, "cover_asset": 1, "read_min": 1, "published_at": 1, "related_portfolio_id": 1}

STARTERS = [  # the former placeholders, now editable drafts
    ("What is a curated basket, really?", "Basics", "A basket is a portfolio built around one idea. Here is how it works."),
    ("How rebalancing keeps your portfolio on strategy", "How it works", "When the manager updates weights, you apply it in one tap."),
    ("SIP vs lumpsum: which one wins over 10 years?", "Strategy", "The evidence is more nuanced than most people think."),
    ("How to read a basket factsheet like a pro", "Basics", "What each metric tells you and what it hides."),
    ("Goal-based investing 101", "Strategy", "From house down payment to retirement, tie every rupee to a goal."),
    ("Risk vs volatility: they are not the same", "Basics", "Understanding what actually threatens your capital."),
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d) -> Optional[str]:
    if isinstance(d, datetime):
        return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()
    return d


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s[:80] or "post"


def read_minutes(html_body: str) -> int:
    words = len(re.sub(r"<[^>]+>", " ", html_body or "").split())
    return max(1, round(words / 200)) if words else 1


def public(doc: dict) -> dict:
    return {**{k: doc.get(k) for k in PUBLIC_FIELDS if k != "_id"}, "published_at": _iso(doc.get("published_at")),
            "cover_url": f"/api/learn/cover/{doc['cover_asset']}" if doc.get("cover_asset") else None}


class PostIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=140)
    slug: Optional[str] = Field(None, max_length=80)
    category: str = Field("Basics", max_length=40)
    excerpt: str = Field("", max_length=240)
    body: str = ""
    related_portfolio_id: Optional[str] = None
    status: str = Field("draft", pattern="^(draft|published)$")


async def latest(db: AsyncIOMotorDatabase, limit: int = 3) -> list:
    rows = await db.learn_posts.find({"status": "published"}, PUBLIC_FIELDS).sort("published_at", -1).to_list(limit)
    return [public(r) for r in rows]


async def by_slug(db: AsyncIOMotorDatabase, slug: str) -> Optional[dict]:
    return await db.learn_posts.find_one({"slug": slug, "status": "published"}, {"_id": 0})


async def ensure_starters(db: AsyncIOMotorDatabase) -> None:
    if await db.learn_posts.count_documents({}) == 0:
        now = _now()
        await db.learn_posts.insert_many([{"id": str(uuid.uuid4()), "slug": slugify(t), "title": t, "category": c, "excerpt": e, "body": "",
                                           "status": "draft", "cover_asset": None, "related_portfolio_id": None, "read_min": 1,
                                           "published_at": None, "created_at": now, "updated_at": now, "views": 0, "starter": True} for t, c, e in STARTERS])


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["learn"])
    require_admin = build_current_user_dep(db, ["admin"])
    posts, covers, portfolios = db.learn_posts, db.learn_covers, db.analyst_portfolios

    async def _related(pid: Optional[str]) -> Optional[dict]:
        if not pid:
            return None
        doc = await portfolios.find_one({"id": pid, "status": "approved"}, {"_id": 0, "id": 1, "name": 1, "subtitle": 1, "owner_name": 1, "subscription": 1, "cover": 1})
        if not doc:
            return None
        from covers import public_cover
        return {"id": doc["id"], "name": doc.get("name"), "subtitle": doc.get("subtitle"), "owner_name": doc.get("owner_name"),
                "subscription": doc.get("subscription"), "cover": public_cover(doc)}

    async def _unique_slug(base: str, exclude_id: Optional[str] = None) -> str:
        slug, n = base, 2
        while await posts.find_one({"slug": slug, **({"id": {"$ne": exclude_id}} if exclude_id else {})}, {"_id": 1}):
            slug, n = f"{base}-{n}", n + 1
        return slug

    # ---------- public ----------
    @router.get("/learn/posts")
    async def list_posts(category: Optional[str] = None, portfolio: Optional[str] = None, limit: int = 60):
        q = {"status": "published", **({"category": category} if category else {}), **({"related_portfolio_id": portfolio} if portfolio else {})}
        rows = await posts.find(q, PUBLIC_FIELDS).sort("published_at", -1).to_list(min(max(limit, 1), 200))
        cats = sorted({r["category"] for r in await posts.find({"status": "published"}, {"_id": 0, "category": 1}).to_list(500) if r.get("category")})
        return {"posts": [public(r) for r in rows], "categories": cats}

    @router.get("/learn/posts/{slug}")
    async def get_post(slug: str):
        doc = await by_slug(db, slug)
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        await posts.update_one({"id": doc["id"]}, {"$inc": {"views": 1}})
        more = await posts.find({"status": "published", "id": {"$ne": doc["id"]}}, PUBLIC_FIELDS).sort("published_at", -1).to_list(3)
        return {"post": {**public(doc), "body": doc.get("body") or ""}, "related": await _related(doc.get("related_portfolio_id")), "more": [public(m) for m in more]}

    @router.get("/learn/asset/{asset}")
    async def asset(asset: str):
        row = await db.learn_assets.find_one({"id": asset}, {"_id": 0, "mime": 1, "data": 1})
        if not row:
            return Response(status_code=404)
        return Response(content=row["data"], media_type=row["mime"], headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @router.get("/learn/cover/{asset}")
    async def cover(asset: str):
        row = await covers.find_one({"id": asset}, {"_id": 0, "mime": 1, "data": 1})
        if not row:
            return Response(status_code=404)
        return Response(content=row["data"], media_type=row["mime"], headers={"Cache-Control": "public, max-age=86400"})

    # ---------- admin ----------
    @router.get("/admin/learn")
    async def admin_list(_: dict = Depends(require_admin)):
        await ensure_starters(db)
        rows = await posts.find({}, {"_id": 0, "body": 0}).sort([("status", 1), ("updated_at", -1)]).to_list(500)
        for r in rows:
            for k in ("published_at", "created_at", "updated_at"):
                r[k] = _iso(r.get(k))
            r["cover_url"] = f"/api/learn/cover/{r['cover_asset']}" if r.get("cover_asset") else None
        return {"posts": rows, "categories": CATEGORIES}

    @router.get("/admin/learn/{post_id}")
    async def admin_get(post_id: str, _: dict = Depends(require_admin)):
        doc = await posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        for k in ("published_at", "created_at", "updated_at"):
            doc[k] = _iso(doc.get(k))
        doc["cover_url"] = f"/api/learn/cover/{doc['cover_asset']}" if doc.get("cover_asset") else None
        return {"post": doc}

    def _fields(payload: PostIn) -> dict:
        body = sanitize_article(payload.body or "")
        return {"title": payload.title.strip(), "category": payload.category.strip() or "Basics", "excerpt": payload.excerpt.strip(),
                "body": body, "read_min": read_minutes(body), "related_portfolio_id": (payload.related_portfolio_id or None), "status": payload.status}

    @router.post("/admin/learn")
    async def admin_create(payload: PostIn, _: dict = Depends(require_admin)):
        now = _now()
        f = _fields(payload)
        doc = {"id": str(uuid.uuid4()), "slug": await _unique_slug(slugify(payload.slug or payload.title)), **f, "cover_asset": None,
               "published_at": now if f["status"] == "published" else None, "created_at": now, "updated_at": now, "views": 0}
        await posts.insert_one(dict(doc))
        return {"post": {**doc, "published_at": _iso(doc["published_at"]), "created_at": _iso(now), "updated_at": _iso(now), "cover_url": None}}

    @router.put("/admin/learn/{post_id}")
    async def admin_update(post_id: str, payload: PostIn, _: dict = Depends(require_admin)):
        doc = await posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        f = _fields(payload)
        if f["status"] == "published" and not doc.get("published_at"):
            f["published_at"] = _now()          # first publish stamps the date; unpublish keeps it for re-publish ordering
        if payload.slug and slugify(payload.slug) != doc["slug"]:
            f["slug"] = await _unique_slug(slugify(payload.slug), exclude_id=post_id)
        f["updated_at"] = _now()
        f.pop("starter", None)
        await posts.update_one({"id": post_id}, {"$set": f, "$unset": {"starter": ""}})
        return await admin_get(post_id, _)

    @router.delete("/admin/learn/{post_id}")
    async def admin_delete(post_id: str, _: dict = Depends(require_admin)):
        doc = await posts.find_one({"id": post_id}, {"_id": 0, "cover_asset": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        await posts.delete_one({"id": post_id})
        await covers.delete_many({"post_id": post_id})
        await db.learn_assets.delete_many({"post_id": post_id})
        return {"ok": True}

    @router.post("/admin/learn/{post_id}/cover")
    async def admin_cover(post_id: str, file: UploadFile = File(...), _: dict = Depends(require_admin)):
        doc = await posts.find_one({"id": post_id}, {"_id": 0, "id": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        mime = (file.content_type or "").lower()
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=422, detail="Use a PNG, JPG or WebP image.")
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Image must be 3 MB or smaller.")
        if len(data) < 100:
            raise HTTPException(status_code=422, detail="That file looks empty.")
        asset = str(uuid.uuid4())
        await covers.delete_many({"post_id": post_id})
        await covers.insert_one({"id": asset, "post_id": post_id, "mime": mime, "size": len(data), "data": data, "uploaded_at": _now()})
        await posts.update_one({"id": post_id}, {"$set": {"cover_asset": asset, "updated_at": _now()}})
        return {"cover_url": f"/api/learn/cover/{asset}", "cover_asset": asset}

    async def _store_asset(post_id: str, file: UploadFile) -> dict:
        mime = (file.content_type or "").lower()
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=422, detail=f"{file.filename}: use PNG, JPG or WebP.")
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail=f"{file.filename}: images must be 3 MB or smaller.")
        if len(data) < 100:
            raise HTTPException(status_code=422, detail=f"{file.filename} looks empty.")
        aid = str(uuid.uuid4())
        await db.learn_assets.insert_one({"id": aid, "post_id": post_id, "mime": mime, "size": len(data), "data": data, "filename": file.filename or "", "uploaded_at": _now()})
        return {"id": aid, "filename": file.filename or "", "url": f"/api/learn/asset/{aid}"}

    @router.post("/admin/learn/{post_id}/assets")
    async def admin_assets(post_id: str, files: list[UploadFile] = File(...), _: dict = Depends(require_admin)):
        """Images placed inside the body. Returns their served URLs; the editor inserts a figure per image."""
        if not await posts.find_one({"id": post_id}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="Post not found")
        return {"assets": [await _store_asset(post_id, f) for f in files[:20]]}

    @router.post("/admin/learn/{post_id}/import")
    async def admin_import(post_id: str, md: UploadFile = File(...), images: list[UploadFile] = File(default=[]), _: dict = Depends(require_admin)):
        """A Markdown article plus its images in one go. Title, summary, cover and body are filled from the file;
        image references are matched to the uploaded files by filename; unmatched ones are reported back."""
        import mdimport
        doc = await posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Post not found")
        text = (await md.read()).decode("utf-8", "replace")
        if len(text) > 200_000:
            raise HTTPException(status_code=413, detail="That file is too large for one post.")
        assets: dict = {}
        stored = []
        for f in images[:20]:
            a = await _store_asset(post_id, f)
            stored.append(a)
            assets[(f.filename or "").split("/")[-1]] = a["url"]
        res = mdimport.convert(text, assets)
        body = sanitize_article(res["html"])
        upd = {"body": body, "read_min": read_minutes(body), "updated_at": _now()}
        untouched = doc.get("starter") or not (doc.get("title") or "").strip() or not (doc.get("body") or "").strip()   # nothing written yet: the file names the post
        if res["title"] and untouched:
            upd["title"] = res["title"][:140]
            upd["slug"] = await _unique_slug(slugify(res["title"]), exclude_id=post_id)
        if res["excerpt"] and not (doc.get("excerpt") or "").strip():
            upd["excerpt"] = res["excerpt"][:240]
        cover_set = False
        if res["cover_name"] and not doc.get("cover_asset"):
            hero = next((s for s in stored if s["filename"].split("/")[-1] == res["cover_name"]), None)
            if hero:
                row = await db.learn_assets.find_one({"id": hero["id"]}, {"_id": 0, "mime": 1, "data": 1})
                cid = str(uuid.uuid4())
                await covers.delete_many({"post_id": post_id})
                await covers.insert_one({"id": cid, "post_id": post_id, "mime": row["mime"], "size": len(row["data"]), "data": row["data"], "uploaded_at": _now()})
                upd["cover_asset"] = cid
                cover_set = True
                # the hero now sits above the article as its cover; do not show it a second time in the body
                body = re.sub(r"<figure>\s*<img[^>]*src=\"" + re.escape(hero["url"]) + r"\"[^>]*>(?:\s*<figcaption>.*?</figcaption>)?\s*</figure>\s*(?:<hr\s*/?>)?", "", body, count=1, flags=re.S)
                upd["body"], upd["read_min"] = body, read_minutes(body)
        await posts.update_one({"id": post_id}, {"$set": upd, "$unset": {"starter": ""}})
        out = await admin_get(post_id, _)
        out["import"] = {"images_attached": len(stored), "missing_images": res["missing_images"], "cover_set": cover_set, "title_set": "title" in upd, "excerpt_set": "excerpt" in upd}
        return out

    @router.delete("/admin/learn/{post_id}/cover")
    async def admin_cover_delete(post_id: str, _: dict = Depends(require_admin)):
        await covers.delete_many({"post_id": post_id})
        await posts.update_one({"id": post_id}, {"$set": {"cover_asset": None, "updated_at": _now()}})
        return {"ok": True}

    return router
