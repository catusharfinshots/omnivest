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
    "partnerPage": {
        "hero": {
            "badge": "For SEBI-registered research analysts",
            "headline": "Grow your research practice with Omnivest",
            "sub": "List your model portfolios, reach investors across India, and run your practice from one console — with zero platform fees for founding partners.",
            "primaryCta": "Apply as a partner",
            "secondaryCta": "See requirements",
        },
        "benefits": [
            {"title": "Publish model portfolios", "text": "Design baskets with stocks, weights, methodology, rebalancing and a factsheet."},
            {"title": "Reach real investors", "text": "Approved baskets appear live on the Model Portfolios page for every Omnivest investor."},
            {"title": "Keep 100% of your revenue", "text": "Founding partners pay zero platform fees — set your subscription price and keep all of it."},
        ],
        "features": [
            {
                "eyebrow": "Create",
                "title": "Build portfolios investors can trust",
                "bullets": [
                    "Compose baskets of stocks & ETFs with weights, methodology and rebalance schedule",
                    "Live prices and returns from the exchange auto-fill your factsheet",
                    "A guided checklist makes every listing complete before it reaches review",
                ],
            },
            {
                "eyebrow": "Manage",
                "title": "Invest time in research, not operations",
                "bullets": [
                    "One console for your profile, listings, submissions and reviews",
                    "Admin-verified listings go live on the Model Portfolios page automatically",
                    "Track every application and rebalance from a single place",
                ],
            },
            {
                "eyebrow": "Grow",
                "title": "Reach investors across India",
                "bullets": [
                    "Your portfolios appear alongside your name, firm and SEBI registration",
                    "Investors connect their own broker — you never handle their money",
                    "Set your subscription price and keep 100% of it as a founding partner",
                ],
            },
        ],
        "stats": [
            {"value": "0%", "label": "Platform fee for founding partners"},
            {"value": "100%", "label": "Of subscription revenue stays yours"},
            {"value": "10 min", "label": "To complete the application"},
            {"value": "3 days", "label": "Typical verification time"},
        ],
        "oldNew": {
            "heading": "Running a research practice the old way is hard work",
            "sub": "Manual lists, calls, spreadsheets and follow-ups — or one platform that does the operations for you.",
            "oldTitle": "The old way",
            "newTitle": "The Omnivest way",
            "oldSteps": [
                "Portfolio lists over WhatsApp",
                "Manual KYC & onboarding",
                "Rebalance updates on calls",
                "Clients placing orders one by one",
                "Trades tracked in spreadsheets",
                "Reporting buy/sell prices by hand",
            ],
            "newText": "Publish once — verification, listings, rebalance updates, subscriptions and reporting all run on the platform, while investors execute with their own broker.",
        },
        "how": [
            {"title": "Apply", "text": "A 10-minute application with your SEBI, RAASB and NISM details plus three documents."},
            {"title": "Get verified", "text": "We verify your registration and documents — typically within 2–3 working days."},
            {"title": "Publish", "text": "Build portfolios in your analyst console and submit them for review."},
            {"title": "Grow", "text": "Approved portfolios go live to investors; track your applications and listings any time."},
        ],
        "requirements": [
            {"title": "SEBI RA registration", "text": "A valid Research Analyst registration (INH…) in the name you'll publish under."},
            {"title": "RAASB / BSE enlistment", "text": "Your enlistment number with the Research Analyst Administration & Supervisory Body."},
            {"title": "Valid NISM Series-XV", "text": "An unexpired NISM Research Analyst certification (Principal Officer's, for firms)."},
            {"title": "PAN & registered address", "text": "PAN and your registered office address exactly as per SEBI records."},
            {"title": "Three documents", "text": "SEBI certificate, NISM certificate and PAN card — PDF/JPG/PNG, up to 5 MB each."},
            {"title": "For LLPs & companies", "text": "Principal Officer and Compliance Officer names with contact details."},
        ],
        "requirementsTip": "Tip: use your business mobile number — a number already registered as an Omnivest customer account can't hold a partner account.",
        "faqs": [
            {"q": "What does it cost to list on Omnivest?", "a": "Founding partners pay zero platform fees — you keep 100% of your subscription revenue while we build this together. A transparent platform fee will apply to later cohorts, and founding partners will always get preferential terms."},
            {"q": "How do I earn?", "a": "You set your own subscription price for each model portfolio (monthly, quarterly or yearly). Investors subscribe to access your portfolios, and your earnings settle to you — the same model used by leading research platforms in India."},
            {"q": "How long does approval take?", "a": "Typically 2–3 working days. We verify your SEBI registration, RAASB enlistment, NISM certification and documents, and you can track your application status any time with your reference number."},
            {"q": "What happens after I'm approved?", "a": "Log in on the partner page with your registered mobile number to open your analyst console — create portfolios with constituents, weights, methodology and factsheets, submit them for review, and they go live once approved."},
            {"q": "Can I invest on Omnivest with the same number?", "a": "No — partner accounts and customer accounts are kept fully separate. Use a different mobile number if you'd also like to invest as a customer."},
        ],
    },
}

ALLOWED_KEYS = ("hero", "stats", "trust", "testimonials", "footer", "partnerTerms", "partnerPage")


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
