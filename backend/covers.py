"""Listing cover art (Listing 2.0).

A listing never has a blank cover. Two sources:
  * theme  — an illustration from a curated catalogue (icon + palette + pattern), picked
             automatically from the listing's name / pitch / tags / category and
             swappable by the partner. Rendered client-side (components/CoverArt.jsx).
  * upload — the partner's own PNG/JPG/WebP (≤ 2 MB), stored in `listing_covers`
             and served from GET /portfolios/{id}/cover. Admin can reset it.

Doc shape on the listing:  cover: {kind: "auto"|"theme"|"upload", theme, palette, [asset]}
Public docs get `coverUrl` (upload) or the theme/palette so the client can draw it.
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import build_current_user_dep

MAX_BYTES = 2 * 1024 * 1024
ALLOWED_MIME = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}

# theme id -> (label, icon (lucide name), keywords)
THEMES: Dict[str, Tuple[str, str, List[str]]] = {
    "water":        ("Water & sanitation",   "Droplets",      ["water", "sanitation", "irrigation", "river", "drinking", "wastewater", "pipes"]),
    "green":        ("Green energy",         "Leaf",          ["green", "renewable", "clean energy", "climate", "esg", "sustainab", "carbon"]),
    "solar":        ("Solar",                "Sun",           ["solar", "photovoltaic"]),
    "wind":         ("Wind power",           "Wind",          ["wind", "turbine"]),
    "ev":           ("EV & mobility",        "Car",           ["ev", "electric vehicle", "auto", "automobile", "mobility", "battery", "two-wheeler", "cars"]),
    "tech":         ("IT & software",        "Cpu",           ["it ", "software", "tech", "saas", "digital services", "infosys", "tcs", "outsourc"]),
    "ai":           ("AI & data",            "BrainCircuit",  ["ai", "artificial intelligence", "data cent", "machine learning", "cloud", "gpu"]),
    "chips":        ("Semiconductors",       "CircuitBoard",  ["semiconductor", "chip", "electronics manufacturing", "pcb", "ems"]),
    "bank":         ("Banking & finance",    "Landmark",      ["bank", "nbfc", "lending", "finance", "financial", "credit", "housing finance"]),
    "insurance":    ("Insurance",            "ShieldCheck",   ["insurance", "insurer", "life cover"]),
    "fintech":      ("Fintech & payments",   "Smartphone",    ["fintech", "payment", "upi", "wallet", "digital lending", "broking"]),
    "pharma":       ("Pharma & healthcare",  "HeartPulse",    ["pharma", "health", "drug", "medic", "biotech", "diagnostic", "api "]),
    "hospital":     ("Hospitals",            "Stethoscope",   ["hospital", "clinic", "care provider"]),
    "fmcg":         ("Consumption & FMCG",   "ShoppingBag",   ["fmcg", "consum", "staple", "food", "beverage", "personal care", "brands"]),
    "retail":       ("Retail",               "Store",         ["retail", "e-commerce", "ecommerce", "quick commerce", "stores"]),
    "realty":       ("Real estate",          "Building2",     ["real estate", "realty", "housing", "property", "reit", "developer"]),
    "infra":        ("Infrastructure",       "HardHat",       ["infra", "capex", "cement", "construction", "roads", "engineering", "capital goods"]),
    "rail":         ("Railways",             "TrainFront",    ["rail", "metro", "wagon", "locomotive"]),
    "defence":      ("Defence",              "Shield",        ["defence", "defense", "aerospace", "missile", "shipyard", "drdo"]),
    "aviation":     ("Aviation & travel",    "Plane",         ["aviation", "airline", "airport", "travel", "tourism"]),
    "hotels":       ("Hotels & leisure",     "Hotel",         ["hotel", "hospitality", "leisure", "resort", "restaurant"]),
    "gold":         ("Gold & precious metals", "Gem",         ["gold", "silver", "precious", "jewel", "bullion"]),
    "metals":       ("Metals & mining",      "Pickaxe",       ["metal", "mining", "steel", "aluminium", "copper", "coal", "iron ore"]),
    "oil":          ("Oil & gas",            "Fuel",          ["oil", "gas", "petrol", "refin", "energy major", "lng"]),
    "power":        ("Power & utilities",    "Zap",           ["power", "utility", "electricity", "grid", "transmission", "discom"]),
    "chemicals":    ("Chemicals",            "FlaskConical",  ["chemical", "specialty chem", "agrochem", "fertiliser", "fertilizer"]),
    "agri":         ("Agriculture",          "Wheat",         ["agri", "farm", "seed", "crop", "tractor", "rural"]),
    "telecom":      ("Telecom",              "RadioTower",    ["telecom", "5g", "broadband", "tower", "spectrum"]),
    "media":        ("Media & gaming",       "Gamepad2",      ["media", "gaming", "entertainment", "ott", "streaming", "sports"]),
    "logistics":    ("Logistics",            "Truck",         ["logistic", "shipping", "port", "freight", "supply chain", "warehouse"]),
    "education":    ("Education",            "GraduationCap", ["education", "edtech", "school", "learning"]),
    "textiles":     ("Textiles",             "Shirt",         ["textile", "apparel", "garment", "fashion"]),
    "global":       ("Global & exports",     "Globe",         ["global", "export", "international", "us ", "world", "overseas"]),
    "dividend":     ("Dividend & income",    "Coins",         ["dividend", "income", "yield", "payout", "cash flow"]),
    "momentum":     ("Momentum",             "TrendingUp",    ["momentum", "breakout", "trend", "leaders"]),
    "value":        ("Value",                "Scale",         ["value", "undervalued", "cheap", "contrarian", "deep value"]),
    "quality":      ("Quality & moats",      "Award",         ["quality", "moat", "compounder", "roce", "blue chip", "franchise"]),
    "largecap":     ("Large cap",            "Crown",         ["large cap", "largecap", "nifty 50", "top 100", "giants", "mega"]),
    "smallcap":     ("Small & mid cap",      "Sprout",        ["small cap", "smallcap", "mid cap", "midcap", "emerging", "multibagger"]),
    "multiasset":   ("Multi-asset",          "Layers",        ["multi-asset", "multi asset", "asset allocation", "balanced", "all weather", "debt", "etf"]),
    "quant":        ("Quant & factors",      "BarChart3",     ["quant", "factor", "smart beta", "systematic", "rules-based", "model"]),
    "india":        ("India growth",         "Flag",          ["india", "bharat", "nation", "make in india", "domestic"]),
    "default":      ("Model portfolio",      "PieChart",      []),
}
PALETTES = ["violet", "indigo", "sky", "teal", "emerald", "amber", "rose", "slate"]
STRATEGY_THEME = {"asset-allocation": "multiasset", "smart-beta": "quant", "model-based": "quant"}
TAG_THEME = {"growth": "momentum", "value": "value", "dividend": "dividend", "momentum": "momentum", "quality": "quality", "low volatility": "quality",
             "multi-asset": "multiasset", "small & midcap": "smallcap", "large cap": "largecap", "quant": "quant"}


def catalog() -> List[dict]:
    return [{"id": k, "label": v[0], "icon": v[1]} for k, v in THEMES.items()]


def pick_theme(name: str = "", subtitle: str = "", tags: Optional[List[str]] = None, strategy: str = "") -> str:
    """Best theme for a listing: keyword hits in name/pitch (name weighs double) > tags > strategy > default."""
    text_name = f" {(name or '').lower()} "
    text_sub = f" {(subtitle or '').lower()} "
    best, best_score = "default", 0
    for tid, (_, _, kws) in THEMES.items():
        score = 0
        for kw in kws:
            if kw in text_name:
                score += 2 * len(kw)
            elif kw in text_sub:
                score += len(kw)
        if score > best_score:
            best, best_score = tid, score
    if best_score > 0:
        return best
    for t in (tags or []):
        if t.lower() in TAG_THEME:
            return TAG_THEME[t.lower()]
    return STRATEGY_THEME.get((strategy or "").lower(), "default")


def pick_palette(seed: str) -> str:
    h = int(hashlib.md5((seed or "omnivest").encode()).hexdigest(), 16)
    return PALETTES[h % len(PALETTES)]


def suggest(name: str = "", subtitle: str = "", tags: Optional[List[str]] = None, strategy: str = "", limit: int = 6) -> List[str]:
    """Ranked theme ids for the picker (auto pick first, then other keyword hits, then tag/strategy)."""
    text = f" {(name or '').lower()} {(subtitle or '').lower()} "
    scored = []
    for tid, (_, _, kws) in THEMES.items():
        s = sum(len(kw) for kw in kws if kw in text)
        if s:
            scored.append((s, tid))
    ranked = [t for _, t in sorted(scored, reverse=True)]
    for t in (tags or []):
        tt = TAG_THEME.get(t.lower())
        if tt and tt not in ranked:
            ranked.append(tt)
    st = STRATEGY_THEME.get((strategy or "").lower())
    if st and st not in ranked:
        ranked.append(st)
    for fallback in ("quality", "momentum", "india", "default"):
        if fallback not in ranked:
            ranked.append(fallback)
    return ranked[:limit]


def normalise_cover(doc: dict, existing: Optional[dict] = None) -> dict:
    """Guarantee a valid cover on the doc. Auto covers are re-picked as the name/pitch changes;
    theme/upload choices are kept (an upload survives edits unless explicitly removed)."""
    cur = doc.get("cover") if isinstance(doc.get("cover"), dict) else None
    prev = (existing or {}).get("cover") if isinstance((existing or {}).get("cover"), dict) else None
    kind = (cur or {}).get("kind") or (prev or {}).get("kind") or "auto"
    palette = (cur or {}).get("palette") or (prev or {}).get("palette") or pick_palette(doc.get("name") or "")
    if palette not in PALETTES:
        palette = pick_palette(doc.get("name") or "")
    if kind == "upload" and (prev or {}).get("asset"):
        doc["cover"] = {"kind": "upload", "asset": prev["asset"], "theme": (prev or {}).get("theme") or pick_theme(doc.get("name"), doc.get("subtitle"), doc.get("tags"), doc.get("strategy")), "palette": palette}
        return doc
    if kind == "theme" and (cur or {}).get("theme") in THEMES:
        doc["cover"] = {"kind": "theme", "theme": cur["theme"], "palette": palette}
        return doc
    if kind == "theme" and (prev or {}).get("theme") in THEMES and not cur:
        doc["cover"] = {"kind": "theme", "theme": prev["theme"], "palette": palette}
        return doc
    doc["cover"] = {"kind": "auto", "theme": pick_theme(doc.get("name"), doc.get("subtitle"), doc.get("tags"), doc.get("strategy")), "palette": palette}
    return doc


def public_cover(doc: dict) -> dict:
    c = doc.get("cover") if isinstance(doc.get("cover"), dict) else None
    if not c:
        c = {"kind": "auto", "theme": pick_theme(doc.get("name"), doc.get("subtitle"), doc.get("tags"), doc.get("strategy")), "palette": pick_palette(doc.get("name") or "")}
    out = {"kind": c.get("kind", "auto"), "theme": c.get("theme") if c.get("theme") in THEMES else "default", "palette": c.get("palette") if c.get("palette") in PALETTES else "violet",
           "icon": THEMES.get(c.get("theme") or "default", THEMES["default"])[1]}
    if c.get("kind") == "upload" and c.get("asset"):
        out["url"] = f"/api/portfolios/{doc.get('id')}/cover?v={str(c['asset'])[:8]}"
    return out


def build_router(db: AsyncIOMotorDatabase) -> APIRouter:
    router = APIRouter(tags=["covers"])
    require_admin = build_current_user_dep(db, ["admin"])
    require_analyst = build_current_user_dep(db, ["analyst"])
    portfolios, covers = db.analyst_portfolios, db.listing_covers

    @router.get("/covers/themes")
    async def themes():
        return {"themes": catalog(), "palettes": PALETTES}

    @router.get("/covers/suggest")
    async def suggest_endpoint(name: str = "", subtitle: str = "", tags: str = "", strategy: str = ""):
        tag_list = [t for t in tags.split(",") if t.strip()]
        return {"auto": pick_theme(name, subtitle, tag_list, strategy), "palette": pick_palette(name), "suggested": suggest(name, subtitle, tag_list, strategy)}

    @router.post("/analyst/portfolios/{pid}/cover")
    async def upload_cover(pid: str, file: UploadFile = File(...), user: dict = Depends(require_analyst)):
        doc = await portfolios.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0, "id": 1, "cover": 1})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        mime = (file.content_type or "").lower()
        if mime not in ALLOWED_MIME:
            raise HTTPException(status_code=422, detail="Use a PNG, JPG or WebP image.")
        data = await file.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller.")
        if len(data) < 100:
            raise HTTPException(status_code=422, detail="That file looks empty.")
        asset_id = str(uuid.uuid4())
        await covers.delete_many({"portfolio_id": pid})
        await covers.insert_one({"id": asset_id, "portfolio_id": pid, "mime": mime, "size": len(data), "data": data, "filename": file.filename or f"cover.{ALLOWED_MIME[mime]}", "uploaded_at": datetime.now(timezone.utc)})
        prev = doc.get("cover") or {}
        cover = {"kind": "upload", "asset": asset_id, "theme": prev.get("theme") or "default", "palette": prev.get("palette") or "violet"}
        await portfolios.update_one({"id": pid}, {"$set": {"cover": cover}})
        return {"cover": public_cover({"id": pid, "cover": cover})}

    @router.delete("/analyst/portfolios/{pid}/cover")
    async def remove_cover(pid: str, user: dict = Depends(require_analyst)):
        doc = await portfolios.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        await covers.delete_many({"portfolio_id": pid})
        fresh = normalise_cover({**doc, "cover": {"kind": "auto"}})
        await portfolios.update_one({"id": pid}, {"$set": {"cover": fresh["cover"]}})
        return {"cover": public_cover({**doc, "cover": fresh["cover"]})}

    @router.get("/portfolios/{pid}/cover")
    async def serve_cover(pid: str):
        row = await covers.find_one({"portfolio_id": pid})
        if not row:
            raise HTTPException(status_code=404, detail="No uploaded cover")
        return Response(content=row["data"], media_type=row["mime"], headers={"Cache-Control": "public, max-age=86400"})

    @router.post("/admin/portfolios/{pid}/cover/reset")
    async def admin_reset_cover(pid: str, user: dict = Depends(require_admin)):
        """Moderation: drop an uploaded cover and fall back to the generated theme."""
        doc = await portfolios.find_one({"id": pid}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        await covers.delete_many({"portfolio_id": pid})
        fresh = normalise_cover({**doc, "cover": {"kind": "auto"}})
        await portfolios.update_one({"id": pid}, {"$set": {"cover": fresh["cover"]}})
        await db.audit_log.insert_one({"id": str(uuid.uuid4()), "type": "cover_reset", "portfolio_id": pid, "portfolio_name": doc.get("name"), "admin": user.get("email"), "at": datetime.now(timezone.utc).isoformat()})
        return {"ok": True, "cover": public_cover({**doc, "cover": fresh["cover"]})}

    return router
