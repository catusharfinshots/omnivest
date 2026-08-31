"""Tests for Feature 1 — server-side share previews via /api/og."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ui-redesign-130.preview.emergentagent.com").rstrip("/")
OG = f"{BASE_URL}/api/og"


def _get(path):
    r = requests.get(OG, params={"path": path}, timeout=30)
    return r


def _extract(html_txt, prop):
    # og:*  and twitter:* (property or name attr)
    m = re.search(
        rf'<meta\s+(?:property|name)="{re.escape(prop)}"\s+content="([^"]*)"',
        html_txt,
    )
    return m.group(1) if m else None


def _title_tag(html_txt):
    m = re.search(r"<title>([^<]*)</title>", html_txt)
    return m.group(1) if m else None


class TestOGEndpoint:
    def test_about_page_meta(self):
        r = _get("/about")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
        expected = "About Us | Omnivest"
        assert _title_tag(r.text) == expected
        assert _extract(r.text, "og:title") == expected
        assert _extract(r.text, "twitter:title") == expected
        desc = _extract(r.text, "og:description")
        assert desc and "Omnivest" in desc

    def test_home_default_title(self):
        r = _get("/")
        assert r.status_code == 200
        expected = "Omnivest — All your investing, in one place"
        assert _title_tag(r.text) == expected
        assert _extract(r.text, "og:title") == expected
        assert _extract(r.text, "twitter:title") == expected

    @pytest.mark.parametrize("path,label", [
        ("/aif", "Alternative Investment Funds"),
        ("/faq", "FAQ"),
        ("/managers", "Basket Managers"),
        ("/model-portfolios", "Model Portfolios"),
        ("/advisory", "Advisory"),
        ("/learn", "Learn"),
        ("/partner", "Become a Partner"),
    ])
    def test_static_routes_distinct_titles(self, path, label):
        r = _get(path)
        assert r.status_code == 200
        expected = f"{label} | Omnivest"
        assert _title_tag(r.text) == expected, f"path={path}"
        assert _extract(r.text, "og:title") == expected
        assert expected.endswith("| Omnivest")

    def test_titles_differ_across_routes(self):
        titles = set()
        for p in ["/", "/about", "/aif", "/faq", "/managers", "/model-portfolios", "/advisory", "/learn", "/partner"]:
            titles.add(_title_tag(_get(p).text))
        assert len(titles) == 9, f"Expected 9 unique titles, got {titles}"

    def test_og_image_present(self):
        r = _get("/about")
        img = _extract(r.text, "og:image")
        timg = _extract(r.text, "twitter:image")
        assert img and "omnivest-og-1200x630.png" in img
        assert timg and "omnivest-og-1200x630.png" in timg
        assert _extract(r.text, "og:image:width") == "1200"
        assert _extract(r.text, "og:image:height") == "630"

    def test_unknown_portfolio_fallback(self):
        r = _get("/model-portfolios/unknown-xyz-123")
        assert r.status_code == 200
        assert _title_tag(r.text) == "Model Portfolios | Omnivest"

    def test_nonexistent_route_fallback(self):
        r = _get("/nonexistent-route")
        assert r.status_code == 200
        assert _title_tag(r.text) == "Omnivest — All your investing, in one place"

    def test_canonical_and_js_redirect(self):
        r = _get("/about")
        assert re.search(r'<link\s+rel="canonical"\s+href="[^"]+/about"', r.text)
        assert "window.location.replace" in r.text


class TestStaticAssets:
    @pytest.mark.parametrize("path", [
        "/omnivest-og-1200x630.png?v=2",
        "/favicon.svg",
        "/favicon-32.png",
        "/apple-touch-icon.png",
    ])
    def test_static_asset(self, path):
        r = requests.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 200, f"{path} -> {r.status_code}"
        ct = r.headers.get("content-type", "")
        assert ct.startswith("image/"), f"{path} content-type={ct}"
