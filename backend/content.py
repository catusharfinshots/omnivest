"""Editable website content (admin-managed).

A single document (key='home') stores the marketing content the platform owner
can edit from the admin console. Public GET falls back to sensible defaults so
the site always renders even before anything is published.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

DEFAULT_CONTENT = {
    "hero": {
        "headline": "Challenging",
        "highlight": "volatility",
        "sub": "Money at work — expert-managed model portfolios, alternative investment funds and SEBI-registered advisory, all in one place.",
        "primaryCta": "Get started",
        "secondaryCta": "Explore portfolios",
    },
    "stats": {"rating": "4.6/5", "investors": "1 lakh+", "managed": "₹100 Cr+"},
    "trust": [
        {"title": "No new accounts", "text": "Hold your stocks & ETFs in your existing demat account — no separate account needed."},
        {"title": "Invest without lock-ins", "text": "Exit your investments whenever you like. Model portfolios can be liquidated anytime."},
        {"title": "Secure by design", "text": "Financial-grade security with encryption in transit and at rest, built for trust."},
        {"title": "Regulated products only", "text": "Products & services regulated by SEBI & RBI, from licensed providers & platforms."},
    ],
    "testimonials": [
        {"name": "Saurabh", "tag": "Reviewed on Play Store", "quote": "One of the best finance products in recent times. The UI is clean and investing is effortless."},
        {"name": "Nithin", "tag": "Posted on X", "quote": "The best investment-tech experience I’ve used in India today. Genuinely well built."},
        {"name": "Asma", "tag": "Reviewed on Play Store", "quote": "Best app for investing with multiple choices of portfolios and clear methodology."},
        {"name": "Tanmay", "tag": "Posted on X", "quote": "Fallen in love with Omnivest — such a smooth, smooth product from end to end."},
        {"name": "Ravi", "tag": "Reviewed on Play Store", "quote": "A smart app blending tech and finance — I can track and invest in one place."},
        {"name": "Jonathan", "tag": "Reviewed on App Store", "quote": "Excellent platform for beginners, especially those who don’t have time to analyse."},
    ],
    "footer": {
        "contactEmail": "support@omnivest.in",
        "subscribeHeading": "Get market insights & product updates in your inbox",
        "socials": {"facebook": "", "x": "", "youtube": "", "linkedin": "", "instagram": ""},
    },
    "partnerTerms": {
        "title": "Partner Terms & Conditions",
        "body": (
            "These Partner Terms & Conditions govern your application to become a research "
            "analyst partner on Omnivest.\n\n"
            "1. Eligibility — You must be a SEBI-registered research analyst and provide a valid "
            "registration number.\n"
            "2. Accuracy — All information you submit must be true and current.\n"
            "3. Review — Omnivest reviews every application and may approve or reject at its discretion.\n"
            "4. Conduct — Once approved, you agree to publish only compliant, good-faith model portfolios.\n"
            "5. Data — We process your details per our Privacy Policy solely to evaluate and manage your partnership.\n\n"
            "By submitting the application you confirm you have read and agree to these terms. "
            "(This is placeholder content — edit it from the admin console.)"
        ),
    },
}

ALLOWED_KEYS = ("hero", "stats", "trust", "testimonials", "footer", "partnerTerms")


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(prefix="/content", tags=["content"])
    require_admin = build_current_user_dep(db, ["admin"])

    async def _current():
        doc = await db.site_content.find_one({"key": "home"}, {"_id": 0, "key": 0, "updated_at": 0})
        return {**DEFAULT_CONTENT, **(doc or {})}

    @router.get("")
    async def get_content():
        return await _current()

    @router.put("")
    async def update_content(payload: dict = Body(...), user: dict = Depends(require_admin)):
        update = {k: payload[k] for k in ALLOWED_KEYS if k in payload}
        update["key"] = "home"
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.site_content.update_one({"key": "home"}, {"$set": update}, upsert=True)
        return await _current()

    return router
