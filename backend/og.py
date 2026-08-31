"""Feature 1 — server-side share previews (crawlers don't run React).

A crawler (WhatsApp/Facebook/LinkedIn/X) that fetches an /api/og link gets a tiny
HTML document with the correct per-page OpenGraph/Twitter tags. Human browsers are
instantly redirected (via JS) to the real SPA route, so the shared link still opens
the actual page.
"""
import html
import re
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

SITE = "Omnivest"
DEFAULT_TITLE = "Omnivest — All your investing, in one place"
DEFAULT_DESC = ("Expert-managed model portfolios, AIFs and advisory — invested from "
                "your own broker account. Soch samajh kar invest kar.")
OG_IMAGE_PATH = "/omnivest-og-1200x630.png?v=2"

# Mirrors frontend src/components/Layout.jsx PAGE_META
PAGE_META = {
    "/": (None, DEFAULT_DESC),
    "/model-portfolios": ("Model Portfolios", "Browse expert-built, SEBI-registered model portfolios and invest from your own broker account."),
    "/about": ("About Us", "Meet the team building Omnivest — making expert-managed investing simple and accessible for every Indian."),
    "/aif": ("Alternative Investment Funds", "Explore curated Alternative Investment Funds (AIFs) on Omnivest."),
    "/advisory": ("Advisory", "Personalised, SEBI-registered investment advisory on Omnivest."),
    "/faq": ("FAQ", "Answers to common questions about investing with Omnivest."),
    "/learn": ("Learn", "Guides and insights to help you invest with confidence."),
    "/managers": ("Basket Managers", "SEBI-registered research analysts and basket managers on Omnivest."),
    "/mutual-funds": ("Mutual Funds", "Diversified baskets of direct mutual funds, built and rebalanced by SEBI-registered managers."),
    "/stocks": ("Stocks", "Curated equity baskets on Omnivest."),
    "/fixed-deposits": ("Fixed Deposits", "Compare and invest in fixed deposits via Omnivest."),
    "/collections": ("Collections", "Themed investment collections on Omnivest."),
    "/explore": ("Explore", "Explore model portfolios and investing ideas on Omnivest."),
    "/calculators": ("Calculators", "SIP and returns calculators to plan your investments."),
    "/partner": ("Become a Partner", "Partner with Omnivest as a SEBI-registered research analyst."),
}


def _title(raw):
    return DEFAULT_TITLE if not raw else f"{raw} | {SITE}"


def _origin(request: Request) -> str:
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


def _page(title: str, desc: str, url: str, image: str) -> HTMLResponse:
    t = html.escape(title)
    d = html.escape(desc)
    u = html.escape(url)
    img = html.escape(image)
    doc = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{t}</title>
<meta name="description" content="{d}"/>
<link rel="canonical" href="{u}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="{SITE}"/>
<meta property="og:title" content="{t}"/>
<meta property="og:description" content="{d}"/>
<meta property="og:url" content="{u}"/>
<meta property="og:image" content="{img}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{t}"/>
<meta name="twitter:description" content="{d}"/>
<meta name="twitter:image" content="{img}"/>
<script>window.location.replace({u!r});</script>
</head><body>
<p>Redirecting to <a href="{u}">{t}</a>…</p>
</body></html>"""
    return HTMLResponse(content=doc, headers={"Cache-Control": "public, max-age=300"})


def build_router(db) -> APIRouter:
    router = APIRouter()
    col = db.analyst_portfolios

    @router.get("/og", response_class=HTMLResponse)
    async def og_preview(request: Request, path: str = "/"):
        origin = _origin(request)
        image = origin + OG_IMAGE_PATH

        # normalise
        if not path.startswith("/"):
            path = "/" + path
        clean = path.split("?")[0].rstrip("/") or "/"

        # dynamic portfolio page
        m = re.match(r"^/model-portfolios/([A-Za-z0-9\-]+)$", clean)
        if m:
            pid = m.group(1)
            doc = await col.find_one(
                {"id": pid, "status": "approved"},
                {"_id": 0, "name": 1, "subtitle": 1, "strategy": 1},
            )
            if doc:
                name = doc.get("name") or "Model Portfolio"
                desc = (doc.get("subtitle") or
                        f"{name} — an expert-managed model portfolio on {SITE}.")
                return _page(_title(name), desc, origin + clean, image)
            # unknown/unapproved portfolio → fall back to portfolios listing preview
            title, desc = PAGE_META["/model-portfolios"]
            return _page(_title(title), desc, origin + "/model-portfolios", image)

        title, desc = PAGE_META.get(clean, (None, DEFAULT_DESC))
        return _page(_title(title), desc, origin + clean, image)

    return router
