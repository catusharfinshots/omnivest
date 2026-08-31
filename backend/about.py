"""About Us page content (admin-managed singleton) + image uploads.

A single document (key='about') stores every editable piece of the /about page:
hero, our-story + stats, meet-the-team intro, founders, team members, team
stats, investors (logos + people), the three "Get in touch" contact cards, and
per-section visibility toggles. Public GET falls back to sensible Omnivest
defaults so the page always renders. Photos/logos are uploaded to Emergent
Object Storage and served back via a public media endpoint.
"""
from __future__ import annotations

import uuid
import mimetypes
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep
import storage


DEFAULT_ABOUT = {
    "hero": {
        "headline": "Changing how India invests",
        "body": [
            "Omnivest is on a mission to make expert-managed investing simple, transparent and accessible to every Indian.",
            "We bring model portfolios, alternative investment funds and SEBI-registered advisory together in one place — so your money is always at work.",
        ],
        "bgColor": "#6C2BD9",
    },
    "story": {
        "heading": "Our Story",
        "intro": "We started Omnivest with a simple belief: everyone deserves access to the kind of professional, research-driven investing that was once reserved for the few.",
        "stats": [
            {"label": "Launched in", "value": "2024"},
            {"label": "Team", "value": "25+"},
            {"label": "Amount transacted", "value": "₹100 Cr+"},
            {"label": "Curated portfolios", "value": "40+"},
        ],
    },
    "teamIntro": {
        "heading": "Meet the Team",
        "paragraphs": [
            "We're a team of investors, engineers and designers obsessed with building the most trustworthy investing experience in India.",
            "Backed by SEBI-registered research analysts, we combine deep market expertise with modern product design.",
        ],
    },
    "founders": [
        {
            "id": str(uuid.uuid4()),
            "name": "Tushar Sukhija",
            "role": "Founder & CEO",
            "photoUrl": "",
            "shortBio": "Chartered Accountant and capital-markets obsessive who has spent a decade turning numbers into strategy for high-growth SaaS. Building Omnivest to make expert-grade investing accessible to everyone.",
            "fullBio": "Tushar is a Chartered Accountant and finance leader who loves what most people avoid — sitting with the numbers until they tell the real story. Over the last decade he has helped SaaS and technology companies scale through fundraising, M&A, and data-driven financial strategy, working with founders, boards and investors across India, the US and the EU. He headed finance at Spyne.AI (Accel & Vertex-backed), reporting to the founder across fundraising, investor relations, M&A, pricing and cross-border compliance. Earlier, at RateGain, he helped scale ARR from ₹150 Cr to ₹1,200 Cr, supported IPO readiness, and built investor-grade SaaS dashboards. A self-confessed number cruncher, he built Omnivest to put disciplined, research-led investing into everyone's hands.",
            "linkedinUrl": "",
        },
    ],
    "team": [
        {
            "id": str(uuid.uuid4()),
            "name": "Rohan Iyer",
            "role": "Head of Research",
            "photoUrl": "",
            "shortBio": "SEBI-registered research analyst leading portfolio construction.",
            "fullBio": "Rohan leads Omnivest's research desk, designing and reviewing every model portfolio that goes live on the platform. He brings a disciplined, factor-driven approach to portfolio construction and rebalancing.",
            "linkedinUrl": "",
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Sara Kapoor",
            "role": "Head of Design",
            "photoUrl": "",
            "shortBio": "Designing calm, trustworthy experiences for money at work.",
            "fullBio": "Sara owns the end-to-end experience at Omnivest, from the first tap to the final trade. She's focused on making complex investing decisions feel simple, transparent and reassuring.",
            "linkedinUrl": "",
        },
    ],
    "teamStats": [
        {"label": "Research Analysts", "value": "6"},
        {"label": "Total Team Strength", "value": "25+"},
    ],
    "investors": {
        "enabled": False,
        "heading": "Our Investors",
        "intro": "Backed by investors who believe in the future of Indian investing.",
        "logos": [],
        "people": [],
    },
    "contacts": [
        {"id": str(uuid.uuid4()), "title": "For individuals", "text": "Questions about investing on Omnivest? We're here to help.", "email": "support@omnivest.in", "link": ""},
        {"id": str(uuid.uuid4()), "title": "Jobs & careers", "text": "Want to build the future of investing with us?", "email": "careers@omnivest.in", "link": ""},
        {"id": str(uuid.uuid4()), "title": "Press & media", "text": "For press enquiries and media kits, reach out here.", "email": "press@omnivest.in", "link": ""},
    ],
    "visibility": {
        "story": True,
        "teamIntro": True,
        "founders": True,
        "team": True,
        "investors": False,
        "contacts": True,
    },
}

ALLOWED_KEYS = ("hero", "story", "teamIntro", "founders", "team", "teamStats", "investors", "contacts", "visibility")

_ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"}
_MEDIA_PREFIX = f"{storage.APP_NAME}/about"


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/about", tags=["about"])
    require_admin = build_current_user_dep(db, ["admin"])

    async def _current():
        doc = await db.site_content.find_one({"key": "about"}, {"_id": 0, "key": 0, "updated_at": 0})
        return {**DEFAULT_ABOUT, **(doc or {})}

    @router.get("")
    async def get_about():
        return await _current()

    @router.put("")
    async def update_about(payload: dict = Body(...), _: dict = Depends(require_admin)):
        update = {k: payload[k] for k in ALLOWED_KEYS if k in payload}
        update["key"] = "about"
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.site_content.update_one({"key": "about"}, {"$set": update}, upsert=True)
        return await _current()

    @router.post("/upload")
    async def upload_image(file: UploadFile = File(...), _: dict = Depends(require_admin)):
        content_type = (file.content_type or "").lower()
        if content_type not in _ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=422, detail="Please upload an image (PNG, JPG, WEBP, GIF or SVG).")
        data = await file.read()
        if len(data) > 8 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller.")
        ext = mimetypes.guess_extension(content_type) or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        path = f"{_MEDIA_PREFIX}/{filename}"
        try:
            storage.put_object(path, data, content_type)
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
        return {"filename": filename, "url": f"/api/about/media/{filename}"}

    @router.get("/media/{filename}")
    async def get_media(filename: str):
        # Only serve from the about/ prefix; reject path traversal.
        if "/" in filename or ".." in filename:
            raise HTTPException(status_code=400, detail="Invalid file")
        try:
            data, ct = storage.get_object(f"{_MEDIA_PREFIX}/{filename}")
        except Exception:
            raise HTTPException(status_code=404, detail="Image not found")
        return Response(content=data, media_type=ct or "application/octet-stream",
                        headers={"Cache-Control": "public, max-age=86400"})

    return router
