# Founder OS phase 2 edge cases: document size limit, docx extraction, unicode filename download, cron bad body
import os
import io
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _user():
    email = f"test_p2e_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST"})
    s = requests.Session()
    s.headers["Authorization"] = "Bearer " + r.json()["access_token"]
    return s


def test_edges():
    s = _user()
    try:
        big = b"a" * (10 * 1024 * 1024 + 10)
        assert s.post(f"{API}/documents", files={"file": ("big.txt", big, "text/plain")}).status_code in (400, 413)
        import docx
        d = docx.Document()
        d.add_paragraph("TEST docx paragraph about otterwave")
        buf = io.BytesIO()
        d.save(buf)
        r = s.post(f"{API}/documents", files={"file": ("test.docx", buf.getvalue(), "application/octet-stream")})
        assert r.status_code == 200 and r.json()["status"] == "ready", r.text
        csv = s.post(f"{API}/documents", files={"file": ("t.csv", b"a,b\n1,2\n", "text/csv")})
        assert csv.status_code == 200 and csv.json()["status"] == "ready"
        u = s.post(f"{API}/documents", files={"file": ("报告 résumé.txt", "unicode body 测试".encode(), "text/plain")})
        assert u.status_code == 200
        dl = s.get(f"{API}/documents/{u.json()['id']}/download")
        assert dl.status_code == 200, f"unicode filename download -> {dl.status_code}"
    finally:
        s.delete(f"{API}/account", json={"confirm": "DELETE"})
