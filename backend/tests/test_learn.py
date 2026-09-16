"""Learn (blog): admin writes, readers read, share cards render.

Drafts are invisible to readers; publishing stamps a date and makes the post appear on /learn, in the
Dashboard's Worth a read, and as its own WhatsApp card (/api/og/learn/<slug>). Covers upload and serve.
"""
import io
import os
import sys
import uuid

import requests

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import learn as ln  # noqa: E402
from test_listing_v2 import API, _admin  # noqa: E402

TAG_RE = __import__("re").compile(r'<meta (?:property|name)="(og:title|og:description|og:url|og:image)" content="([^"]*)"')


def test_slug_and_read_time_pure():
    assert ln.slugify("SIP vs lumpsum: which one wins over 10 years?") == "sip-vs-lumpsum-which-one-wins-over-10-years"
    assert ln.slugify("") == "post"
    assert ln.read_minutes("") == 1
    assert ln.read_minutes("<p>" + "word " * 650 + "</p>") == 3


def test_draft_publish_read_share_and_delete():
    h = _admin()
    uniq = uuid.uuid4().hex[:6]
    title = f"Test guide {uniq}"
    created = None
    try:
        r = requests.post(f"{API}/admin/learn", json={"title": title, "category": "Strategy", "excerpt": "A short summary.", "body": "<h2>Why</h2><p>Because.</p><script>x()</script>", "status": "draft"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()["post"]
        assert created["slug"] == f"test-guide-{uniq}" and "<script>" not in created["body"] and created["published_at"] is None
        # drafts: not listed, not readable, no share card
        assert all(p["slug"] != created["slug"] for p in requests.get(f"{API}/learn/posts", timeout=30).json()["posts"])
        assert requests.get(f"{API}/learn/posts/{created['slug']}", timeout=30).status_code == 404
        assert requests.get(f"{API}/og/learn/{created['slug']}.png", timeout=30).status_code == 404
        # publish
        r = requests.put(f"{API}/admin/learn/{created['id']}", json={"title": title, "category": "Strategy", "excerpt": "A short summary.", "body": "<p>Because.</p>", "status": "published"}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["post"]["published_at"]
        listed = requests.get(f"{API}/learn/posts", timeout=30).json()
        assert any(p["slug"] == created["slug"] for p in listed["posts"]) and "Strategy" in listed["categories"]
        assert "body" not in listed["posts"][0]
        one = requests.get(f"{API}/learn/posts/{created['slug']}", timeout=30).json()
        assert one["post"]["title"] == title and one["post"]["body"] == "<p>Because.</p>" and one["post"]["read_min"] == 1
        # share contract for the post link
        og = requests.get(f"{API}/og/learn/{created['slug']}", headers={"User-Agent": "WhatsApp/2.23.20.0"}, timeout=30)
        tags = dict(TAG_RE.findall(og.text))
        assert tags["og:title"].startswith(title) and tags["og:url"].endswith(f"/learn/{created['slug']}") and f"/api/og/learn/{created['slug']}.png" in tags["og:image"]
        img = requests.get(f"{API}/og/learn/{created['slug']}.png", timeout=60)
        assert img.status_code == 200 and img.headers["content-type"].startswith("image/png") and len(img.content) > 5000
        # cover upload -> served, and the card still renders
        from PIL import Image
        buf = io.BytesIO(); Image.new("RGB", (400, 300), (108, 43, 217)).save(buf, "PNG")
        r = requests.post(f"{API}/admin/learn/{created['id']}/cover", files={"file": ("c.png", buf.getvalue(), "image/png")}, headers=h, timeout=30)
        assert r.status_code == 200, r.text
        cov = requests.get(f"{API.rsplit('/api', 1)[0]}{r.json()['cover_url']}", timeout=30)
        assert cov.status_code == 200 and cov.headers["content-type"] == "image/png"
        assert requests.get(f"{API}/og/learn/{created['slug']}.png?v=2", timeout=60).status_code == 200
        # dashboard "worth a read" is fed by the same list (unauthenticated check via the public list ordering)
        assert requests.get(f"{API}/learn/posts", timeout=30).json()["posts"][0]["slug"] == created["slug"]
        # unpublish hides it again
        r = requests.put(f"{API}/admin/learn/{created['id']}", json={"title": title, "category": "Strategy", "excerpt": "", "body": "<p>Because.</p>", "status": "draft"}, headers=h, timeout=30)
        assert r.status_code == 200 and requests.get(f"{API}/learn/posts/{created['slug']}", timeout=30).status_code == 404
    finally:
        if created:
            requests.delete(f"{API}/admin/learn/{created['id']}", headers=h, timeout=30)
    assert requests.get(f"{API}/learn/posts/{created['slug']}", timeout=30).status_code == 404


def test_starter_drafts_exist_once():
    h = _admin()
    first = requests.get(f"{API}/admin/learn", headers=h, timeout=30).json()["posts"]
    second = requests.get(f"{API}/admin/learn", headers=h, timeout=30).json()["posts"]
    assert len(first) == len(second) >= 1
    assert all(p["status"] == "draft" for p in first if p.get("starter"))


def test_markdown_import_with_images_builds_the_article():
    """A Finshots-style .md plus its PNGs in one upload: title, summary, cover and figures come from the file;
    an image referenced but not attached is reported, not silently dropped."""
    from PIL import Image
    h = _admin()
    md = ("# Test import title\n\n![Hero](hero.png)\n\n*In today's explainer, we break down something worth twenty characters.*\n\n---\n\n### The Story\n\nFirst paragraph with **bold**.\n\n![Chart](chart.png)\n\n*Figure: Omnivest*\n\nSecond paragraph.\n\n![Missing](later.png)\n\n*Figure: Omnivest*\n").encode()
    def png(rgb):
        b = io.BytesIO(); Image.new("RGB", (300, 200), rgb).save(b, "PNG"); return b.getvalue()
    created = requests.post(f"{API}/admin/learn", json={"title": "placeholder", "status": "draft"}, headers=h, timeout=30).json()["post"]
    try:
        files = [("md", ("article.md", md, "text/markdown")), ("images", ("hero.png", png((108, 43, 217)), "image/png")), ("images", ("chart.png", png((14, 165, 233)), "image/png"))]
        r = requests.post(f"{API}/admin/learn/{created['id']}/import", files=files, headers=h, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["import"]["images_attached"] == 2 and d["import"]["missing_images"] == ["later.png"] and d["import"]["cover_set"]
        post = d["post"]
        assert post["title"] == "Test import title" and post["slug"].startswith("test-import-title") and post["excerpt"].startswith("In today's explainer")
        assert post["body"].count("<figure>") == 1 and "hero" not in post["body"] and "<figcaption>Figure: Omnivest</figcaption>" in post["body"] and "[image to attach: later.png]" in post["body"]
        assert "/api/learn/asset/" in post["body"] and post["cover_url"]
        # the inline asset is served, and an <img> pointing anywhere else is stripped by the sanitiser
        src = post["body"].split('src="')[1].split('"')[0]
        assert requests.get(f"{API.rsplit('/api', 1)[0]}{src}", timeout=30).headers["content-type"] == "image/png"
        r = requests.put(f"{API}/admin/learn/{created['id']}", json={"title": post["title"], "body": '<figure><img src="http://evil.example/x.png"><figcaption>x</figcaption></figure><p>kept</p>', "status": "draft"}, headers=h, timeout=30)
        assert r.status_code == 200 and "<img" not in r.json()["post"]["body"] and "kept" in r.json()["post"]["body"]
        # inline upload endpoint used by the Insert image button
        r = requests.post(f"{API}/admin/learn/{created['id']}/assets", files=[("files", ("a.png", png((1, 2, 3)), "image/png"))], headers=h, timeout=30)
        assert r.status_code == 200 and r.json()["assets"][0]["url"].startswith("/api/learn/asset/")
    finally:
        requests.delete(f"{API}/admin/learn/{created['id']}", headers=h, timeout=30)
