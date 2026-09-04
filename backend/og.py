"""Share previews (crawlers don't run React).

A crawler (WhatsApp/Facebook/LinkedIn/X) that fetches an /api/og link gets a tiny
HTML document with the correct per-page OpenGraph/Twitter tags. Human browsers are
instantly redirected (via JS) to the real SPA route, so the shared link still opens
the actual page.

Listings get:
  * a short link  /s/<8-char code>  (Render rewrites /s/* → /api/og/s/*)
  * a generated 1200x630 share card  /api/og/image/<id>.png  (cover art / uploaded
    image + name, pitch, manager, tags, key stats) — never the generic brand image.

All absolute URLs use PUBLIC_ORIGIN (https://omnivest.in on Render): behind the
static-site rewrite the backend sees its own hostname, which is the wrong origin.
"""
from __future__ import annotations

import hashlib
import html
import io
import math
import os
import re
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, Response

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
    "/partner/apply": ("Partner Application", "Apply as a SEBI-registered research analyst partner on Omnivest."),
}

# Omnivest palettes (mirrors frontend CoverArt.jsx)
PALETTES = {
    "violet": ("#6C2BD9", "#A855F7"), "indigo": ("#3730A3", "#6366F1"), "sky": ("#0369A1", "#38BDF8"), "teal": ("#0F766E", "#2DD4BF"),
    "emerald": ("#047857", "#34D399"), "amber": ("#B45309", "#FBBF24"), "rose": ("#BE123C", "#FB7185"), "slate": ("#1E293B", "#64748B"),
}


def _title(raw):
    return DEFAULT_TITLE if not raw else f"{raw} | {SITE}"


def _origin(request: Request) -> str:
    """Public origin for absolute URLs. On Render the backend sits behind the static
    site's rewrite and sees its own hostname, so the public host must be configured."""
    configured = (os.environ.get("PUBLIC_ORIGIN") or "").strip().rstrip("/")
    if configured:
        return configured
    if os.environ.get("RENDER"):
        return "https://omnivest.in"
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


def _page(title: str, desc: str, url: str, image: str, kind: str = "website") -> HTMLResponse:
    t, d, u, img = html.escape(title), html.escape(desc), html.escape(url), html.escape(image)
    doc = f"""<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>{t}</title>
<meta name="description" content="{d}"/>
<link rel="canonical" href="{u}"/>
<meta property="og:type" content="{kind}"/>
<meta property="og:site_name" content="{SITE}"/>
<meta property="og:title" content="{t}"/>
<meta property="og:description" content="{d}"/>
<meta property="og:url" content="{u}"/>
<meta property="og:image" content="{img}"/>
<meta property="og:image:secure_url" content="{img}"/>
<meta property="og:image:type" content="image/png"/>
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


def short_code(pid: str) -> str:
    return (pid or "").replace("-", "")[:8].lower()


def _version(doc: dict) -> str:
    cov = doc.get("cover") or {}
    key = "|".join(str(doc.get(k) or "") for k in ("name", "subtitle", "owner_name", "updated_at", "launch_date")) + "|" + str(cov.get("kind")) + str(cov.get("theme")) + str(cov.get("palette")) + str(cov.get("asset"))
    return hashlib.md5(key.encode()).hexdigest()[:8]


# ----------------------------------------------------------------------------
# Share card (1200x630) — rendered with Pillow; fonts = Pillow's bundled TrueType.
# ----------------------------------------------------------------------------
def _hex(c: str):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _wrap(draw, text, font, max_w, max_lines):
    words, lines, cur = (text or "").split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
        if len(lines) == max_lines:
            break
    if cur and len(lines) < max_lines:
        lines.append(cur)
    if len(lines) == max_lines and (len(words) > sum(len(l.split()) for l in lines)):
        last = lines[-1]
        while last and draw.textlength(last + "…", font=font) > max_w:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def render_card(doc: dict, manager: str, stats: list, cover_bytes: Optional[bytes] = None) -> bytes:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont

    W, H = 1200, 630
    pal = PALETTES.get((doc.get("cover") or {}).get("palette") or "violet", PALETTES["violet"])
    c0, c1 = _hex(pal[0]), _hex(pal[1])
    img = Image.new("RGB", (W, H), (247, 244, 251))
    d = ImageDraw.Draw(img)
    # soft brand wash top-right
    glow = Image.new("RGB", (W, H), (247, 244, 251))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((760, -260, 1500, 420), fill=_lerp((247, 244, 251), c1, 0.28))
    gd.ellipse((-200, 380, 420, 900), fill=_lerp((247, 244, 251), c0, 0.10))
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img.paste(glow)
    d = ImageDraw.Draw(img)

    f_brand = ImageFont.load_default(size=30)
    f_title = ImageFont.load_default(size=64)
    f_sub = ImageFont.load_default(size=30)
    f_meta = ImageFont.load_default(size=24)
    f_stat_v = ImageFont.load_default(size=36)
    f_stat_l = ImageFont.load_default(size=18)
    f_chip = ImageFont.load_default(size=20)

    # brand mark
    d.rounded_rectangle((64, 56, 108, 100), radius=12, fill=c0)
    d.ellipse((76, 68, 96, 88), outline=(255, 255, 255), width=4)
    d.text((122, 60), "Omnivest", font=f_brand, fill=(26, 16, 48))
    d.text((122 + d.textlength("Omnivest", font=f_brand) + 14, 66), "MODEL PORTFOLIO", font=f_stat_l, fill=(108, 43, 217))

    # cover tile (right)
    tile, tx, ty = 300, W - 64 - 300, 150
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((tx + 6, ty + 18, tx + tile + 6, ty + tile + 18), radius=48, fill=(108, 43, 217, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    img.paste(shadow, (0, 0), shadow)
    d = ImageDraw.Draw(img)
    tile_img = None
    if cover_bytes:
        try:
            ci = Image.open(io.BytesIO(cover_bytes)).convert("RGB")
            s = max(tile / ci.width, tile / ci.height)
            ci = ci.resize((max(1, int(ci.width * s)), max(1, int(ci.height * s))))
            left, top = (ci.width - tile) // 2, (ci.height - tile) // 2
            tile_img = ci.crop((left, top, left + tile, top + tile))
        except Exception:  # noqa: BLE001
            tile_img = None
    if tile_img is None:
        tile_img = Image.new("RGB", (tile, tile), c0)
        td = ImageDraw.Draw(tile_img)
        for y in range(tile):
            td.line((0, y, tile, y), fill=_lerp(c0, c1, y / tile))
        td.ellipse((tile * 0.55, -tile * 0.25, tile * 1.35, tile * 0.55), fill=_lerp(c1, (255, 255, 255), 0.35))
        td.ellipse((-tile * 0.2, tile * 0.65, tile * 0.35, tile * 1.2), fill=_lerp(c0, (255, 255, 255), 0.18))
        td.ellipse((tile * 0.2, tile * 0.2, tile * 0.8, tile * 0.8), fill=_lerp(c0, (255, 255, 255), 0.16))
        initials = "".join(w[0] for w in (doc.get("name") or "MP").split()[:2]).upper()
        f_init = ImageFont.load_default(size=118)
        tw = td.textlength(initials, font=f_init)
        td.text(((tile - tw) / 2, tile / 2 - 74), initials, font=f_init, fill=(255, 255, 255))
    mask = Image.new("L", (tile, tile), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, tile, tile), radius=48, fill=255)
    img.paste(tile_img, (tx, ty), mask)
    d = ImageDraw.Draw(img)

    # title + pitch + manager
    x, y, max_w = 64, 150, W - 64 - 300 - 64 - 48
    for line in _wrap(d, doc.get("name") or "Model portfolio", f_title, max_w, 2):
        d.text((x, y), line, font=f_title, fill=(26, 16, 48))
        y += 74
    y += 6
    for line in _wrap(d, doc.get("subtitle") or "", f_sub, max_w, 2):
        d.text((x, y), line, font=f_sub, fill=(75, 69, 96))
        y += 40
    y += 10
    d.text((x, y), f"by {manager}  ·  SEBI-registered research analyst", font=f_meta, fill=(107, 100, 128))
    y += 44
    # chips
    cx = x
    for t in (doc.get("tags") or [])[:3] + [str(doc.get("strategy") or "").replace("-", " ")]:
        if not t:
            continue
        w = d.textlength(t, font=f_chip) + 28
        d.rounded_rectangle((cx, y, cx + w, y + 34), radius=17, fill=(241, 231, 254))
        d.text((cx + 14, y + 6), t, font=f_chip, fill=(83, 32, 168))
        cx += w + 10

    # stats strip
    sy = H - 64 - 96
    d.rounded_rectangle((64, sy, W - 64, sy + 96), radius=24, fill=(255, 255, 255), outline=(232, 225, 240))
    col_w = (W - 128) / max(1, len(stats))
    for i, (label, value) in enumerate(stats):
        bx = 64 + i * col_w
        d.text((bx + 28, sy + 16), label.upper(), font=f_stat_l, fill=(148, 163, 184))
        d.text((bx + 28, sy + 42), value, font=f_stat_v, fill=(26, 16, 48) if i else _hex(pal[0]))
        if i:
            d.line((bx, sy + 20, bx, sy + 76), fill=(238, 232, 247), width=2)

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def build_router(db) -> APIRouter:
    router = APIRouter()
    col = db.analyst_portfolios

    async def _listing(pid_or_code: str) -> Optional[dict]:
        proj = {"_id": 0, "id": 1, "name": 1, "subtitle": 1, "strategy": 1, "tags": 1, "owner_name": 1, "owner_id": 1, "cover": 1,
                "updated_at": 1, "launch_date": 1, "constituents": 1, "subscription": 1, "feeAmount": 1, "feeCycle": 1, "status": 1}
        doc = await col.find_one({"id": pid_or_code, "status": "approved"}, proj)
        if doc:
            return doc
        code = re.sub(r"[^a-f0-9]", "", (pid_or_code or "").lower())
        if len(code) >= 6:
            pattern = "^" + code[:8]
            candidates = await col.find({"status": "approved"}, proj).to_list(2000)
            hits = [c for c in candidates if re.match(pattern, c["id"].replace("-", "").lower())]
            if hits:
                return sorted(hits, key=lambda c: str(c.get("updated_at") or ""), reverse=True)[0]
        return None

    async def _stats(doc: dict) -> list:
        perf = await db.portfolio_performance.find_one({"_id": doc["id"]}, {"metrics": 1, "min_investment": 1, "launched_days_ago": 1, "status": 1})
        m = (perf or {}).get("metrics") or {}
        if m.get("cagr_pct") is not None:
            head = ("CAGR", f"{m['cagr_pct']:+.1f}%")
        elif m.get("return_pct") is not None:
            head = ("Since launch", f"{m['return_pct']:+.1f}%")
        else:
            head = ("Track record", "New")
        mi = ((perf or {}).get("min_investment") or {}).get("amount")
        min_s = f"Rs {mi:,}" if mi else "—"   # bundled font has no ₹ glyph
        n = len(doc.get("constituents") or [])
        cycle = {"monthly": "mo", "quarterly": "qtr", "half-yearly": "half-yr", "yearly": "yr"}.get(str(doc.get("feeCycle") or "monthly"), str(doc.get("feeCycle") or "mo"))
        access = "Free access" if doc.get("subscription") != "Paid" else (f"Rs {doc.get('feeAmount')}/{cycle}" if doc.get("feeAmount") else "Subscription")
        return [head, ("Min. investment", min_s), ("Holdings", f"{n} stocks"), ("Access", access)]

    async def _listing_page(request: Request, doc: dict) -> HTMLResponse:
        origin = _origin(request)
        name = doc.get("name") or "Model Portfolio"
        desc = (doc.get("subtitle") or f"{name} — an expert-managed model portfolio on {SITE}.").strip()
        if doc.get("owner_name"):
            desc = f"{desc} Managed by {doc['owner_name']} on Omnivest."
        image = f"{origin}/api/og/image/{doc['id']}.png?v={_version(doc)}"
        return _page(_title(name), desc, f"{origin}/model-portfolios/{doc['id']}", image, kind="article")

    @router.get("/og", response_class=HTMLResponse)
    async def og_preview(request: Request, path: str = "/"):
        origin = _origin(request)
        image = origin + OG_IMAGE_PATH
        if not path.startswith("/"):
            path = "/" + path
        clean = path.split("?")[0].rstrip("/") or "/"
        m = re.match(r"^/model-portfolios/([A-Za-z0-9\-]+)$", clean)
        if m:
            doc = await _listing(m.group(1))
            if doc:
                return await _listing_page(request, doc)
            title, desc = PAGE_META["/model-portfolios"]
            return _page(_title(title), desc, origin + "/model-portfolios", image)
        title, desc = PAGE_META.get(clean, (None, DEFAULT_DESC))
        return _page(_title(title), desc, origin + clean, image)

    @router.get("/og/s/{code}", response_class=HTMLResponse)
    async def og_short(request: Request, code: str):
        """Short share link: /s/<code> (rewritten to here). Unknown code → portfolios page."""
        doc = await _listing(code)
        if doc:
            return await _listing_page(request, doc)
        origin = _origin(request)
        title, desc = PAGE_META["/model-portfolios"]
        return _page(_title(title), desc, origin + "/model-portfolios", origin + OG_IMAGE_PATH)

    @router.get("/og/image/{pid}.png")
    async def og_image(pid: str, v: str = ""):
        doc = await _listing(pid)
        if not doc:
            return Response(status_code=404)
        cover = doc.get("cover") or {}
        cover_bytes = None
        if cover.get("kind") == "upload":
            row = await db.listing_covers.find_one({"portfolio_id": doc["id"]}, {"data": 1})
            cover_bytes = row["data"] if row else None
        manager = doc.get("owner_name") or "Research analyst"
        usr = await db.users.find_one({"id": doc.get("owner_id")}, {"_id": 0, "analyst_profile": 1}) if doc.get("owner_id") else None
        if usr and (usr.get("analyst_profile") or {}).get("displayName"):
            manager = usr["analyst_profile"]["displayName"]
        png = render_card(doc, manager, await _stats(doc), cover_bytes)
        return Response(content=png, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})

    # Path-style variant (/api/og/about) — hosting rewrites/CDNs can drop or
    # cache-collapse query strings, so shared links use this form instead.
    @router.get("/og/{rest:path}", response_class=HTMLResponse)
    async def og_preview_path(request: Request, rest: str = ""):
        return await og_preview(request, path="/" + rest)

    return router
