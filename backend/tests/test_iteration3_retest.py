# Iteration 3 retest: fixes from iteration_2 (download non-ASCII, publish URL, ai-draft preview, draft-weekly date, cron, chat persistence, isolation)
import os
import time
import uuid
import json
import threading
import pytest
import requests
from datetime import date, timedelta
from urllib.parse import quote

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET")


def register():
    email = f"test_it3_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST IT3"})
    assert r.status_code == 200, r.text
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return s, r.json(), email


@pytest.fixture(scope="module")
def ua():
    return register()


@pytest.fixture(scope="module")
def ub():
    return register()


# ---- knowledge download non-ascii ----
class TestDownload:
    @pytest.mark.parametrize("name", ["Résumé – plan “Q4”.txt", "semi;colon 'name'.md", "日本語メモ.txt"])
    def test_download_unicode(self, ua, name):
        s = ua[0]
        content = f"TEST download {uuid.uuid4().hex}\nhello world".encode()
        r = s.post(f"{API}/documents", files={"file": (name, content, "text/plain")})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        d = s.get(f"{API}/documents/{did}/download")
        assert d.status_code == 200, d.text[:200]
        assert d.content == content
        cd = d.headers.get("content-disposition", "")
        assert "filename*=UTF-8''" in cd and quote(name) in cd, cd
        assert d.headers.get("x-content-type-options") == "nosniff"


# ---- content publish requires URL ----
class TestPublish:
    def test_create_published_without_url(self, ua):
        r = ua[0].post(f"{API}/content", json={"title": "TEST pub", "status": "published"})
        assert r.status_code in (400, 422), r.text

    def test_create_published_with_url(self, ua):
        r = ua[0].post(f"{API}/content", json={"title": "TEST pub2", "status": "published", "published_url": "https://x.com/p"})
        assert r.status_code == 200 and r.json()["status"] == "published"

    def test_update_rules(self, ua):
        s = ua[0]
        c = s.post(f"{API}/content", json={"title": "TEST pub3"}).json()
        assert s.patch(f"{API}/content/{c['id']}", json={"status": "published"}).status_code in (400, 422)
        assert s.patch(f"{API}/content/{c['id']}", json={"status": "published", "published_url": ""}).status_code in (400, 422)
        r = s.patch(f"{API}/content/{c['id']}", json={"status": "published", "published_url": "https://x.com/a"})
        assert r.status_code == 200
        # clearing URL on already-published item should be rejected
        assert s.patch(f"{API}/content/{c['id']}", json={"published_url": None}).status_code in (400, 422)
        assert s.get(f"{API}/content/{c['id']}").json()["published_url"] == "https://x.com/a"


# ---- content ai-draft preview ----
class TestAiDraft:
    def test_ai_draft_preview_not_saved(self, ua):
        s = ua[0]
        c = s.post(f"{API}/content", json={"title": "TEST why founders need weekly reviews", "body": "original body"}).json()
        r = s.post(f"{API}/content/{c['id']}/ai-draft", json={"sources": "FACT: 42 founders surveyed in TEST study", "body": "unsaved edited body", "cta": "Book a call", "instruction": "Write a short 80-word post. Mention the number of founders surveyed."}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["draft"], str) and len(d["draft"]) > 20
        assert "42" in d["draft"], d["draft"][:300]
        after = s.get(f"{API}/content/{c['id']}").json()
        assert after["body"] == "original body" and after.get("sources") is None

    def test_ai_draft_rejects_unknown_fields(self, ua):
        s = ua[0]
        c = s.post(f"{API}/content", json={"title": "TEST x"}).json()
        assert s.post(f"{API}/content/{c['id']}/ai-draft", json={"evil": 1}).status_code == 422


# ---- weekly draft date param ----
class TestWeekly:
    def test_draft_weekly_date_param(self, ua):
        s = ua[0]
        r = s.post(f"{API}/reviews/draft-weekly", params={"date": "2026-09-10"})
        assert r.status_code == 200, r.text
        assert r.json()["period_start"] == "2026-09-07" and r.json()["period_end"] == "2026-09-13"
        assert s.post(f"{API}/reviews/draft-weekly", params={"date": "2026-09-12"}).status_code == 409
        assert s.post(f"{API}/reviews/draft-weekly", params={"date": "bad"}).status_code == 422

    def test_cron(self):
        url = f"{API}/cron/weekly-review"
        assert requests.post(url, json={}).status_code == 401
        assert requests.post(url, json={}, headers={"Authorization": "Bearer wrong"}).status_code == 401
        rid = f"TEST-{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": rid}
        r = requests.post(url, json={}, headers=h)
        assert r.status_code == 200 and r.json()["ok"] is True and not r.json().get("duplicate")
        if date.today().weekday() != 6:
            assert "skipped" in r.json(), r.json()
        r2 = requests.post(url, json={}, headers=h)
        assert r2.status_code == 200 and r2.json().get("duplicate") is True

    def test_cron_run_id_in_body_dedupe(self):
        url = f"{API}/cron/weekly-review"
        rid = f"TEST-{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {CRON_SECRET}"}
        assert not requests.post(url, json={"run_id": rid}, headers=h).json().get("duplicate")
        assert requests.post(url, json={"run_id": rid}, headers=h).json().get("duplicate") is True


# ---- AI chat persistence ----
def _chat(s, msg, sid=None, stream_all=True, max_chunks=None):
    body = {"message": msg, "date": date.today().isoformat()}
    if sid:
        body["session_id"] = sid
    r = s.post(f"{API}/ai/chat", json=body, stream=True, timeout=180)
    assert r.status_code == 200, r.text
    events, n = [], 0
    for line in r.iter_lines():
        if not line or not line.startswith(b"data: "):
            continue
        ev = json.loads(line[6:])
        events.append(ev)
        if ev["type"] == "delta":
            n += 1
            if max_chunks and n >= max_chunks:
                r.close()
                break
    return events


class TestChat:
    def test_normal_completion_single_message(self, ua):
        s = ua[0]
        ev = _chat(s, "Reply with exactly: TEST OK")
        sid = next(e["session_id"] for e in ev if e["type"] == "session")
        done = [e for e in ev if e["type"] == "done"]
        assert done, ev[-3:]
        msgs = s.get(f"{API}/ai/sessions/{sid}/messages").json()
        asst = [m for m in msgs if m["role"] == "assistant"]
        assert len(asst) == 1, asst
        assert len([m for m in msgs if m["role"] == "user"]) == 1
        full = "".join(e["text"] for e in ev if e["type"] == "delta")
        assert asst[0]["content"] == full
        pytest.message_id_match = asst[0]["id"] == done[0]["message_id"]
        assert asst[0]["id"] == done[0]["message_id"], f"done.message_id {done[0]['message_id']} != stored id {asst[0]['id']}"

    def test_disconnect_mid_stream_persists(self, ua):
        s = ua[0]
        ev = _chat(s, "Write a 400-word essay about the importance of weekly planning for founders.", max_chunks=3)
        sid = next(e["session_id"] for e in ev if e["type"] == "session")
        asst = []
        for _ in range(25):
            time.sleep(3)
            msgs = s.get(f"{API}/ai/sessions/{sid}/messages").json()
            asst = [m for m in msgs if m["role"] == "assistant"]
            if asst:
                break
        assert len(asst) == 1, f"assistant message not persisted after disconnect: {asst}"
        assert len(asst[0]["content"]) > 0


# ---- isolation smoke ----
class TestIsolation:
    def test_cross_account(self, ua, ub):
        a, b = ua[0], ub[0]
        c = a.post(f"{API}/content", json={"title": "TEST iso content"}).json()
        z = a.post(f"{API}/biz", json={"kind": "kpi", "title": "TEST iso kpi"})
        assert z.status_code == 200, z.text
        z = z.json()
        d = a.post(f"{API}/documents", files={"file": ("iso.txt", f"TEST iso {uuid.uuid4().hex}".encode(), "text/plain")}).json()
        for path in (f"content/{c['id']}", f"biz/{z['id']}", f"documents/{d['id']}"):
            assert b.get(f"{API}/{path}").status_code == 404, path
            assert b.patch(f"{API}/{path}", json={"title": "HACK"}).status_code == 404, path
            assert b.delete(f"{API}/{path}").status_code == 404, path
        assert b.get(f"{API}/documents/{d['id']}/download").status_code == 404
        assert b.post(f"{API}/content/{c['id']}/ai-draft", json={}).status_code == 404
        assert a.get(f"{API}/content/{c['id']}").json()["title"] == "TEST iso content"
        assert a.get(f"{API}/biz/{z['id']}").json()["title"] == "TEST iso kpi"
        assert all(x["id"] != c["id"] for x in b.get(f"{API}/content").json())


def test_zz_cleanup(ua, ub):
    for s in (ua[0], ub[0]):
        assert s.delete(f"{API}/account", json={"confirm": "DELETE"}).status_code == 200
