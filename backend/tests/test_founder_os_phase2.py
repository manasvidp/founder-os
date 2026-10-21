# Founder OS phase 2 regression: security, documents (knowledge), biz, content, weekly draft/cron, widget order, isolation
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET")


def register():
    email = f"test_p2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST P2"})
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s, r.json(), email


def make_pdf(pages):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for t in pages:
        c.drawString(72, 720, t)
        c.showPage()
    c.save()
    return buf.getvalue()


@pytest.fixture(scope="module")
def ua():
    return register()


@pytest.fixture(scope="module")
def ub():
    return register()


# ---- security ----
class TestSecurity:
    def test_headers(self, ua):
        r = ua[0].get(f"{API}/auth/me")
        h = r.headers
        assert h.get("x-content-type-options") == "nosniff"
        assert "max-age" in (h.get("strict-transport-security") or "")
        assert h.get("referrer-policy")
        assert "no-store" in (h.get("cache-control") or "")

    def test_forgot_password_honest(self, ua):
        email_on = requests.get(f"{API}/auth/config").json()["email"]
        r = requests.post(f"{API}/auth/forgot-password", json={"email": ua[2]})
        assert r.status_code == 200 and r.json()["email_available"] is email_on
        r2 = requests.post(f"{API}/auth/forgot-password", json={"email": "test_nobody_x@example.com"})
        assert r2.status_code == 200 and r2.json() == r.json()  # same reply whether or not the account exists
        assert requests.post(f"{API}/auth/reset-password", json={"token": "bogus", "password": "newpass123"}).status_code == 400

    def test_change_password(self):
        s, _, email = register()
        assert s.post(f"{API}/auth/change-password", json={"current_password": "wrong", "new_password": "newpass1234"}).status_code == 400
        assert s.post(f"{API}/auth/change-password", json={"current_password": "testpass123", "new_password": "short"}).status_code == 422
        r = s.post(f"{API}/auth/change-password", json={"current_password": "testpass123", "new_password": "newpass1234"})
        assert r.status_code == 200
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"}).status_code == 401
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "newpass1234"}).status_code == 200
        act = s.get(f"{API}/activity").json()
        acts = act if isinstance(act, list) else act.get("items", [])
        actions = {a.get("action") for a in acts}
        assert "password_changed" in actions and "login" in actions, actions
        s.get(f"{API}/export")
        acts = s.get(f"{API}/activity").json()
        acts = acts if isinstance(acts, list) else acts.get("items", [])
        assert "export" in {a.get("action") for a in acts}
        s.delete(f"{API}/account", json={"confirm": "DELETE"})

    def test_lockout(self):
        s, _, email = register()
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "badpass99"}).status_code for _ in range(5)]
        assert codes == [401] * 5
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"})
        assert r.status_code == 429
        s.delete(f"{API}/account", json={"confirm": "DELETE"})

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]})
        assert r.status_code == 200 and r.json()["role"] == "admin"

    def test_integrations_honest(self, ua):
        ints = {i["key"]: i["status"] for i in ua[0].get(f"{API}/integrations").json()}
        cfg = requests.get(f"{API}/auth/config").json()
        assert ints["email"] == ("connected" if cfg["email"] else "not_configured")
        assert ints["google_login"] == ("connected" if cfg["google"] else "not_configured")
        for k in ("google_calendar", "banking", "linkedin"):  # not built yet, must never claim to be connected
            assert ints[k] == "not_configured", (k, ints[k])


# ---- documents ----
class TestDocuments:
    state = {}

    def test_upload_txt(self, ua):
        s = ua[0]
        txt = b"TEST Quarterly plan\nThe zebracorn initiative launches in March with budget 42000.\n"
        r = s.post(f"{API}/documents", files={"file": ("test_plan.txt", txt, "text/plain")}, data={"folder": "TEST", "tags": "a,b"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "ready" and d["version"] == 1 and "_id" not in d and d["tags"] == ["a", "b"]
        self.state["txt"] = d["id"]
        det = s.get(f"{API}/documents/{d['id']}").json()
        assert det["chunks"][0]["label"] == "s.1" and "zebracorn" in det["chunks"][0]["text"]

    def test_duplicate_and_version(self, ua):
        s = ua[0]
        txt = b"TEST Quarterly plan\nThe zebracorn initiative launches in March with budget 42000.\n"
        r = s.post(f"{API}/documents", files={"file": ("other.txt", txt, "text/plain")})
        assert r.status_code == 409
        r2 = s.post(f"{API}/documents", files={"file": ("test_plan.txt", b"TEST version two zebracorn v2", "text/plain")})
        assert r2.status_code == 200 and r2.json()["version"] == 2 and r2.json()["previous_version_id"] == self.state["txt"]
        self.state["v2"] = r2.json()["id"]

    def test_upload_pdf(self, ua):
        s = ua[0]
        pdf = make_pdf(["TEST page one about quokkamarine revenue", "TEST page two lists the deadline 30 June"])
        r = s.post(f"{API}/documents", files={"file": ("test_report.pdf", pdf, "application/pdf")})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "ready" and d["sections"] == 2
        det = s.get(f"{API}/documents/{d['id']}").json()
        assert [c["label"] for c in det["chunks"]] == ["p.1", "p.2"]
        self.state["pdf"] = d["id"]
        hits = s.get(f"{API}/documents/search", params={"q": "quokkamarine"}).json()
        assert any(h["doc_id"] == d["id"] and h["label"] == "p.1" for h in hits)

    def test_invalid_files(self, ua):
        s = ua[0]
        assert s.post(f"{API}/documents", files={"file": ("x.exe", b"MZ\x90\x00", "application/octet-stream")}).status_code == 400
        assert s.post(f"{API}/documents", files={"file": ("fake.pdf", b"hello not a pdf", "application/pdf")}).status_code == 400
        assert s.post(f"{API}/documents", files={"file": ("bin.txt", b"\xff\xfe\x00\x81\x82", "text/plain")}).status_code == 400
        assert s.post(f"{API}/documents", files={"file": ("empty.txt", b"", "text/plain")}).status_code == 400

    def test_failed_and_retry(self, ua):
        s = ua[0]
        # whitespace-only text -> no extractable text -> failed
        r = s.post(f"{API}/documents", files={"file": ("test_blank.md", b"   \n\n  ", "text/markdown")})
        assert r.status_code == 200 and r.json()["status"] == "failed" and r.json()["error"]
        rid = r.json()["id"]
        rr = s.post(f"{API}/documents/{rid}/retry")
        assert rr.status_code == 200 and rr.json()["status"] == "failed"
        assert s.post(f"{API}/documents/{self.state['txt']}/retry").status_code == 400

    def test_link_and_download(self, ua, ub):
        s = ua[0]
        g = s.post(f"{API}/goals", json={"title": "TEST goal docs"}).json()
        r = s.patch(f"{API}/documents/{self.state['pdf']}", json={"goal_id": g["id"]})
        assert r.status_code == 200 and r.json()["goal_id"] == g["id"]
        gb = ub[0].post(f"{API}/goals", json={"title": "TEST goal B"}).json()
        assert s.patch(f"{API}/documents/{self.state['pdf']}", json={"goal_id": gb["id"]}).status_code == 400
        dl = s.get(f"{API}/documents/{self.state['pdf']}/download")
        assert dl.status_code == 200 and dl.content.startswith(b"%PDF")

    def test_isolation(self, ua, ub):
        b = ub[0]
        did = self.state["pdf"]
        assert b.get(f"{API}/documents/{did}").status_code == 404
        assert b.patch(f"{API}/documents/{did}", json={"title": "hack"}).status_code == 404
        assert b.get(f"{API}/documents/{did}/download").status_code == 404
        assert b.post(f"{API}/documents/{did}/summarize").status_code == 404
        assert b.post(f"{API}/documents/{did}/retry").status_code == 404
        assert b.delete(f"{API}/documents/{did}").status_code == 404
        assert b.get(f"{API}/documents/search", params={"q": "quokkamarine"}).json() == []
        assert b.get(f"{API}/documents").json() == []

    def test_summarize_ai(self, ua):
        r = ua[0].post(f"{API}/documents/{self.state['pdf']}/summarize", timeout=120)
        assert r.status_code == 200, r.text
        assert "[p." in r.json()["summary"]

    def test_delete_removes_from_search(self, ua):
        s = ua[0]
        assert s.delete(f"{API}/documents/{self.state['v2']}").status_code == 200
        assert s.get(f"{API}/documents/{self.state['v2']}").status_code == 404
        hits = s.get(f"{API}/documents/search", params={"q": "zebracorn v2"}).json()
        assert not any(h["doc_id"] == self.state["v2"] for h in hits)


# ---- business ----
class TestBiz:
    def test_kinds_crud(self, ua, ub):
        s = ua[0]
        ids = []
        for k in ["kpi", "product", "revenue_stream", "assumption", "procedure", "team_member", "meeting", "risk", "decision", "opportunity"]:
            r = s.post(f"{API}/biz", json={"kind": k, "title": f"TEST {k}"})
            assert r.status_code == 200, (k, r.text)
            ids.append(r.json()["id"])
        assert s.post(f"{API}/biz", json={"kind": "bogus", "title": "x"}).status_code == 422
        kpi = s.post(f"{API}/biz", json={"kind": "kpi", "title": "TEST MRR", "target": 10000, "current": 2500, "unit": "$"}).json()
        p = s.patch(f"{API}/biz/{kpi['id']}", json={"current": 5000})
        assert p.status_code == 200 and s.get(f"{API}/biz/{kpi['id']}").json()["current"] == 5000
        m = s.post(f"{API}/biz", json={"kind": "meeting", "title": "TEST standup", "action_items": [{"title": "TEST follow up A"}, {"title": "TEST follow up B"}]}).json()
        assert len(m["action_items"]) == 2 and all(a.get("id") for a in m["action_items"])
        b = ub[0]
        assert b.get(f"{API}/biz/{kpi['id']}").status_code == 404
        assert b.patch(f"{API}/biz/{kpi['id']}", json={"current": 1}).status_code == 404
        assert b.delete(f"{API}/biz/{kpi['id']}").status_code == 404
        gb = b.post(f"{API}/goals", json={"title": "TEST B goal"}).json()
        assert s.post(f"{API}/biz", json={"kind": "risk", "title": "TEST", "goal_id": gb["id"]}).status_code == 400
        assert s.delete(f"{API}/biz/{ids[0]}").status_code == 200
        assert s.get(f"{API}/biz/{ids[0]}").status_code == 404


# ---- content ----
class TestContent:
    def test_crud_repurpose_isolation(self, ua, ub):
        s = ua[0]
        c = s.post(f"{API}/content", json={"title": "TEST idea"}).json()
        assert c["status"] == "idea" and c["ai_generated"] is False
        assert s.patch(f"{API}/content/{c['id']}", json={"status": "drafting"}).json()["status"] == "drafting"
        rp = s.post(f"{API}/content", json={"title": "TEST repurposed", "format": "newsletter", "source_content_id": c["id"]})
        assert rp.status_code == 200 and rp.json()["source_content_id"] == c["id"]
        b = ub[0]
        assert b.get(f"{API}/content/{c['id']}").status_code == 404
        assert b.patch(f"{API}/content/{c['id']}", json={"title": "x"}).status_code == 404
        assert b.delete(f"{API}/content/{c['id']}").status_code == 404
        assert b.post(f"{API}/content/{c['id']}/ai-draft", json={}).status_code == 404
        assert b.post(f"{API}/content", json={"title": "TEST", "source_content_id": c["id"]}).status_code == 400

    def test_publish_requires_url_server_side(self, ua):
        s = ua[0]
        c = s.post(f"{API}/content", json={"title": "TEST pub"}).json()
        r = s.patch(f"{API}/content/{c['id']}", json={"status": "published"})
        assert r.status_code == 400, f"server accepted published without URL: {r.status_code}"


# ---- weekly review draft & cron ----
class TestWeekly:
    def test_draft_weekly(self, ua):
        s = ua[0]
        s.post(f"{API}/tasks", json={"title": "TEST due soon", "status": "todo", "due_date": __import__("datetime").date.today().isoformat()})
        r = s.post(f"{API}/reviews/draft-weekly")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["draft"] is True and d["kind"] == "weekly" and "Proposed plan" in d["next_focus"] and "TEST due soon" in d["next_focus"]
        assert s.post(f"{API}/reviews/draft-weekly").status_code == 409
        assert any(x["id"] == d["id"] for x in s.get(f"{API}/reviews").json())

    # WARNING: a valid cron call drafts weekly reviews for ALL onboarded users (incl. real admin) — remove auto drafts after (see report)
    def test_cron(self):
        url = f"{API}/cron/weekly-review"
        assert requests.post(url, json={}).status_code == 401
        assert requests.post(url, json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
        rid = f"TEST-{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": rid}
        r = requests.post(url, json={}, headers=h)
        assert r.status_code == 200 and r.json()["ok"] is True and not r.json().get("duplicate")
        r2 = requests.post(url, json={}, headers=h)
        assert r2.status_code == 200 and r2.json().get("duplicate") is True


# ---- home widget order ----
class TestWidgetOrder:
    def test_widget_order(self, ua):
        s = ua[0]
        order = ["finance", "today", "goals"]
        r = s.patch(f"{API}/me/profile", json={"widget_order": order})
        assert r.status_code == 200 and r.json()["settings"]["widget_order"] == order
        assert s.get(f"{API}/auth/me").json()["settings"]["widget_order"] == order
        r = s.patch(f"{API}/me/profile", json={"widget_order": None})
        assert r.status_code == 200


def test_zz_cleanup(ua, ub):
    for s in (ua[0], ub[0]):
        assert s.delete(f"{API}/account", json={"confirm": "DELETE"}).status_code == 200
