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

CHARTER_HTML = '<h3>Investor Charter in respect of Research Analysts (SEBI, Annexure A)</h3><p><b>Vision:</b> Invest with knowledge and safety. <b>Mission:</b> Every investor should be able to invest in the right investment products based on their needs, manage and monitor them to meet their goals, access reports and enjoy financial wellness.</p><h4>Business transacted by the Research Analyst with investors</h4><ul><li>Publish research reports based on the research activities of the RA.</li><li>Provide an independent, unbiased view on securities.</li><li>Offer unbiased recommendations, disclosing financial interests in recommended securities.</li><li>Provide research recommendations based on analysis of publicly available information and known observations.</li><li>Conduct audit annually.</li><li>Ensure all advertisements adhere to the Advertisement Code for Research Analysts.</li><li>Maintain records of interactions with all clients, including prospective clients, where any conversation related to the research services has taken place.</li></ul><h4>Services provided to investors</h4><ul><li>Onboarding: sharing of terms and conditions of research services; completing KYC of fee-paying clients.</li><li>Disclosure: information material for an informed decision, including business activity, disciplinary history, terms and conditions, details of associates, risks and conflicts of interest; the extent of use of Artificial Intelligence tools; conflicts of any third-party research distributed; conflicts between research services and other activities.</li><li>Distribute research reports and recommendations to clients without discrimination.</li><li>Maintain confidentiality of research until it is in the public domain; respect data-privacy rights of clients.</li><li>Disclose and adhere to timelines for services; give clear guidance and caution notices for complex and high-risk products.</li><li>Treat all clients with honesty and integrity; keep client information confidential unless legally required or specifically consented.</li></ul><h4>Grievance redressal</h4><p>Approach the Research Analyst first; the RA shall strive to redress the grievance immediately, but not later than 21 days of receipt. Complaints may also be filed on SEBI SCORES 2.0 (<a href="https://scores.sebi.gov.in" target="_blank" rel="noreferrer">scores.sebi.gov.in</a>) with two-level review (RAASB, then SEBI), or by email to the designated RAASB address. If unsatisfied, investors may use the SMART ODR platform for online conciliation or arbitration. Physical complaints: Office of Investor Assistance and Education, SEBI Bhavan, Plot No. C4-A, G Block, Bandra-Kurla Complex, Bandra (E), Mumbai 400051.</p><h4>Rights of investors</h4><ul><li>Privacy and confidentiality; transparent practices; fair and equitable treatment; adequate information.</li><li>Initial and continuing disclosure, including all statutory and regulatory disclosures; fair and true advertisement.</li><li>Awareness of service parameters and turnaround times; to be heard and receive satisfactory, timely grievance redressal.</li><li>To exit from a product or service in accordance with the agreed terms; clear guidance and caution notices for complex and high-risk products.</li><li>Additional rights for vulnerable consumers, including access to services in a suitable manner if differently abled; to provide feedback; protection against coercive, unfair and one-sided clauses.</li></ul><h4>Responsibilities of investors</h4><ul><li>Deal only with SEBI-registered Research Analysts and check the registration certificate and number on the SEBI website.</li><li>Read the disclosures in research reports before investing.</li><li>Pay the Research Analyst through banking channels only and keep duly signed receipts mentioning the details of the payment.</li><li>Read the terms and conditions of the research service before subscribing; keep your contact details updated; raise grievances promptly.</li><li>Do not fall for guaranteed-return claims, luring advertisements or unregistered entities; do not share login or payment credentials.</li></ul>'

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
    "platformDetails": {
        "legalName": "Omnivest Technologies", "brand": "Omnivest", "cin": "", "registeredAddress": "",
        "supportEmail": "support@omnivest.in", "supportPhone": "", "grievanceOfficer": "", "grievanceEmail": "support@omnivest.in",
    },
    "investorCharter": CHARTER_HTML,
    "subscriptionTerms": (
        "<h3>Omnivest platform terms for paid model portfolios</h3>"
        "<p>Omnivest Technologies (“Omnivest”) operates omnivest.in, a platform where SEBI-registered research analysts "
        "(“Partners”) publish model portfolios. When you subscribe to a paid model portfolio, Omnivest collects the "
        "subscription fee on its own account and grants you access to that portfolio’s constituents, weights, factsheet and "
        "updates for the plan period.</p>"
        "<ul><li>Research is prepared by the Partner named above, who is solely responsible for it. Omnivest does not provide "
        "investment advice and does not execute trades on your behalf; orders are placed by you through your own broker.</li>"
        "<li>Fees are non-refundable once access is granted, except where required by law or where Omnivest withdraws a portfolio "
        "within seven days of your payment, in which case the unused portion is refunded.</li>"
        "<li>Investments in securities are subject to market risk. Past performance, including the computed track record shown on "
        "Omnivest, is not indicative of future returns.</li>"
        "<li>Your PAN, name and date of birth are collected for invoicing and to maintain the client records the Partner is required "
        "to keep under the SEBI (Research Analysts) Regulations. They are shared with the Partner for that purpose only.</li>"
        "<li>Grievances: write to support@omnivest.in. Unresolved complaints may be escalated to SEBI SCORES.</li></ul>"
    ),
    "performanceDisclaimer": (
        "Performance is computed by Omnivest from NSE closing prices, starting on the day the portfolio was approved. "
        "Figures are price returns: bonus and split adjusted, but dividends, brokerage, taxes and slippage are excluded. "
        "Past performance is not indicative of future returns. Investments in securities are subject to market risk."
    ),
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

ALLOWED_KEYS = ("hero", "stats", "trust", "testimonials", "footer", "partnerTerms", "partnerPage", "performanceDisclaimer", "subscriptionTerms",
                "platformDetails", "investorCharter")


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
