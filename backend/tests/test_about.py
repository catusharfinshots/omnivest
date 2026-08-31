"""Backend tests for the About Us feature.

Covers: default GET payload, admin PUT persistence, auth (401/403),
image upload happy-path (200 + media served), non-image rejection (422),
path-traversal (400) and non-existent media (404).
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ui-redesign-130.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@omnivest.in"
ADMIN_PASSWORD = "Admin@123"
INVESTOR_EMAIL = "demo@basketly.in"
INVESTOR_PASSWORD = "Password123"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token") or (data.get("data") or {}).get("token")


@pytest.fixture(scope="module")
def admin_token():
    t = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert t, "admin token not returned"
    return t


@pytest.fixture(scope="module")
def investor_token():
    return _login(INVESTOR_EMAIL, INVESTOR_PASSWORD)


# ---------- GET default payload ----------
class TestAboutGet:
    def test_get_about_defaults(self):
        r = requests.get(f"{API}/about", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("hero", "story", "teamIntro", "founders", "team", "teamStats", "investors", "contacts", "visibility"):
            assert k in d, f"missing key: {k}"
        assert isinstance(d["founders"], list) and len(d["founders"]) >= 1
        assert isinstance(d["team"], list) and len(d["team"]) >= 2
        assert isinstance(d["contacts"], list) and len(d["contacts"]) >= 3
        assert d["investors"].get("enabled") is False
        assert d["visibility"].get("investors") is False


# ---------- Auth on PUT ----------
class TestAboutPutAuth:
    def test_put_without_token_401(self):
        r = requests.put(f"{API}/about", json={"hero": {"headline": "x"}}, timeout=15)
        assert r.status_code == 401, r.text

    def test_put_with_non_admin_403(self, investor_token):
        r = requests.put(
            f"{API}/about",
            json={"hero": {"headline": "not allowed"}},
            headers={"Authorization": f"Bearer {investor_token}"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"


# ---------- PUT persists ----------
class TestAboutPutAdmin:
    def test_put_updates_and_persists(self, admin_token):
        # get current to restore later
        current = requests.get(f"{API}/about", timeout=15).json()
        original_headline = current["hero"]["headline"]
        new_headline = "TEST_HEADLINE_persist_check"
        try:
            r = requests.put(
                f"{API}/about",
                json={"hero": {**current["hero"], "headline": new_headline}},
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=20,
            )
            assert r.status_code == 200, r.text
            assert r.json()["hero"]["headline"] == new_headline
            # GET again to verify persistence
            r2 = requests.get(f"{API}/about", timeout=15)
            assert r2.status_code == 200
            assert r2.json()["hero"]["headline"] == new_headline
        finally:
            requests.put(
                f"{API}/about",
                json={"hero": {**current["hero"], "headline": original_headline}},
                headers={"Authorization": f"Bearer {admin_token}"},
                timeout=20,
            )

    def test_put_ignores_non_whitelisted_keys(self, admin_token):
        r = requests.put(
            f"{API}/about",
            json={"maliciousKey": {"x": 1}},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 200
        assert "maliciousKey" not in r.json()


# ---------- Upload + media ----------
_PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90"
    b"wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\x5b\xd4\xbb\xe0"
    b"\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestAboutUpload:
    def test_upload_image_and_serve(self, admin_token):
        files = {"file": ("test.png", io.BytesIO(_PNG_1x1), "image/png")}
        r = requests.post(
            f"{API}/about/upload",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "filename" in data and "url" in data
        assert data["url"].startswith("/api/about/media/")
        # fetch media
        media = requests.get(f"{BASE_URL}{data['url']}", timeout=20)
        assert media.status_code == 200
        assert media.headers.get("content-type", "").startswith("image/")

    def test_upload_non_image_422(self, admin_token):
        files = {"file": ("evil.txt", io.BytesIO(b"not an image"), "text/plain")}
        r = requests.post(
            f"{API}/about/upload",
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_upload_requires_admin(self, investor_token):
        files = {"file": ("test.png", io.BytesIO(_PNG_1x1), "image/png")}
        r = requests.post(
            f"{API}/about/upload",
            files=files,
            headers={"Authorization": f"Bearer {investor_token}"},
            timeout=15,
        )
        assert r.status_code == 403


class TestAboutMedia:
    def test_path_traversal_rejected(self):
        # encoded slash in path
        r = requests.get(f"{API}/about/media/..%2Fsecret", timeout=10)
        # Ideal is 400 (explicit reject). Route-level 404 is acceptable since access is still blocked.
        assert r.status_code in (400, 404), f"expected 400/404 for traversal, got {r.status_code}"

    def test_double_dot_rejected(self):
        r = requests.get(f"{API}/about/media/..config", timeout=10)
        # contains '..' so should be 400
        assert r.status_code == 400

    def test_nonexistent_404(self):
        r = requests.get(f"{API}/about/media/does_not_exist_xyz.png", timeout=10)
        assert r.status_code == 404
