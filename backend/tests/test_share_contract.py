"""Share-preview CONTRACT (standing requirement): every public URL must give crawlers a
title, description, canonical URL and an absolute image on the public origin, and the
image must resolve. Run against production after every deploy:
    REACT_APP_BACKEND_URL=https://omnivest.in pytest tests/test_share_contract.py
Locally (backend only) the static-site parts are skipped."""
import os
import re
import sys

import pytest
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import og  # noqa: E402

ORIGIN = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
LOCAL = "localhost" in ORIGIN or "127.0.0.1" in ORIGIN
WA = {"User-Agent": "WhatsApp/2.23.20.0", "Accept": "*/*"}
HUMAN = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128 Safari/537.36"}
TAG = re.compile(r'<meta (?:property|name)="(og:title|og:description|og:url|og:image)" content="([^"]*)"')


def _tags(url, headers=WA):
    r = requests.get(url, headers=headers, timeout=60)
    assert r.status_code == 200, f"{url} -> {r.status_code}"
    return dict(TAG.findall(r.text)), r.text


def _assert_contract(tags, origin=ORIGIN):
    for k in ("og:title", "og:description", "og:url", "og:image"):
        assert tags.get(k), f"missing {k}: {tags}"
    assert tags["og:url"].startswith(origin), tags["og:url"]
    assert tags["og:image"].startswith(origin), tags["og:image"]
    if not LOCAL or "/api/og/image/" in tags["og:image"]:
        img = requests.get(tags["og:image"], headers={"User-Agent": "facebookexternalhit/1.1"}, timeout=60)
        assert img.status_code == 200 and img.headers.get("content-type", "").startswith("image/"), f"image {tags['og:image']} -> {img.status_code}"
        assert len(img.content) > 5000


@pytest.mark.parametrize("route", sorted(og.PAGE_META.keys()))
def test_static_route_share_link(route):
    tags, _ = _tags(f"{ORIGIN}/api/og{route}")
    _assert_contract(tags)
    assert tags["og:url"] == f"{ORIGIN}{route}" if route != "/" else tags["og:url"].rstrip("/") == ORIGIN


@pytest.mark.skipif(LOCAL, reason="prerendered pages live on the static site")
@pytest.mark.parametrize("route", [r for r in sorted(og.PAGE_META.keys()) if r != "/"])
def test_static_route_direct_url(route):
    tags, html = _tags(f"{ORIGIN}{route}")
    _assert_contract(tags)
    assert '<div id="root"' in html


def _live_listings():
    r = requests.get(f"{ORIGIN}/api/portfolios", timeout=60)
    return r.json().get("portfolios", []) if r.status_code == 200 else []


def test_every_live_listing_short_link_and_direct_url():
    listings = _live_listings()
    if not listings:
        pytest.skip("no live listings")
    for l in listings[:25]:
        code = og.short_code(l["id"])
        short = f"{ORIGIN}/s/{code}" if not LOCAL else f"{ORIGIN}/api/og/s/{code}"
        tags, _ = _tags(short)
        _assert_contract(tags)
        assert l["name"] in tags["og:title"], (l["name"], tags["og:title"])
        assert f"/api/og/image/{l['id']}.png" in tags["og:image"]
        assert tags["og:url"] == f"{ORIGIN}/model-portfolios/{l['id']}"
        if not LOCAL:
            # address-bar URL: crawler sees the listing card, a browser gets the app shell
            tags2, _ = _tags(f"{ORIGIN}/model-portfolios/{l['id']}")
            assert f"/api/og/image/{l['id']}.png" in tags2.get("og:image", ""), tags2
            h = requests.get(f"{ORIGIN}/model-portfolios/{l['id']}", headers=HUMAN, timeout=60)
            assert h.status_code == 200 and '<div id="root"' in h.text


def test_every_active_manager_page():
    r = requests.get(f"{ORIGIN}/api/managers", timeout=60)
    managers = r.json().get("managers", []) if r.status_code == 200 else []
    if not managers:
        pytest.skip("no active managers")
    for m in managers[:25]:
        tags, _ = _tags(f"{ORIGIN}/api/og/manager/{m['id']}")
        _assert_contract(tags)
        assert (m.get("name") or "")[:12] in tags["og:title"]
        if not LOCAL:
            tags2, _ = _tags(f"{ORIGIN}/manager/{m['id']}")
            assert (m.get("name") or "")[:12] in tags2.get("og:title", "")


def test_unknown_listing_and_manager_fall_back_cleanly():
    tags, _ = _tags(f"{ORIGIN}/api/og/s/zzzzzzzz")
    assert "Model Portfolios" in tags["og:title"]
    tags, _ = _tags(f"{ORIGIN}/api/og/manager/nope")
    assert "Basket Managers" in tags["og:title"]
