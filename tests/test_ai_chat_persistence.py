# AI chat persistence tests: disconnect mid-stream and done message_id consistency (run via PUBLIC URL)
import os, json, time, uuid
from datetime import date
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"


@pytest.fixture(scope="module")
def client():
    email = f"test_it4_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST it4"})
    assert r.status_code in (200, 201), r.text
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    yield s
    s.delete(f"{BASE}/account", json={"confirm": "DELETE"})


def _msgs(s, sid):
    r = s.get(f"{BASE}/ai/sessions/{sid}/messages")
    assert r.status_code == 200
    return r.json()


# Disconnect after first 1-2 deltas -> exactly one assistant message persisted
def test_disconnect_persists(client):
    r = client.post(f"{BASE}/ai/chat", json={"message": "Write a 400-word essay about weekly planning.", "date": date.today().isoformat()}, stream=True, timeout=180)
    assert r.status_code == 200
    sid, n = None, 0
    for line in r.iter_lines():
        if line.startswith(b"data: "):
            ev = json.loads(line[6:])
            if ev["type"] == "session":
                sid = ev["session_id"]
            elif ev["type"] == "delta":
                n += 1
                if n >= 2:
                    break
            elif ev["type"] in ("done", "error"):
                pytest.fail(f"stream ended before disconnect: {ev}")
    r.close()
    assert sid
    t0 = time.time()
    a = []
    while time.time() - t0 < 120:
        time.sleep(5)
        a = [m for m in _msgs(client, sid) if m["role"] == "assistant"]
        if a:
            break
    print(f"persisted after {time.time()-t0:.0f}s, len={len(a[0]['content']) if a else 0}")
    assert len(a) == 1
    # wait a bit more to ensure no duplicate gets written
    time.sleep(10)
    msgs = _msgs(client, sid)
    assert len([m for m in msgs if m["role"] == "assistant"]) == 1
    assert len([m for m in msgs if m["role"] == "user"]) == 1
    assert len(msgs[-1]["content"]) > 300, "full reply expected, not partial"


# Full stream: done.message_id == stored assistant id; one user + one assistant per turn
def test_full_stream_message_id(client):
    sid = None
    for turn in range(2):
        payload = {"message": "Give me 3 short tips for prioritising tasks." if turn == 0 else "Summarise that in one sentence.", "date": date.today().isoformat()}
        if sid:
            payload["session_id"] = sid
        r = client.post(f"{BASE}/ai/chat", json=payload, stream=True, timeout=180)
        assert r.status_code == 200
        done, text = None, ""
        for line in r.iter_lines():
            if line.startswith(b"data: "):
                ev = json.loads(line[6:])
                if ev["type"] == "session":
                    sid = ev["session_id"]
                elif ev["type"] == "delta":
                    text += ev["text"]
                elif ev["type"] == "done":
                    done = ev
                    break
                elif ev["type"] == "error":
                    pytest.fail(str(ev))
        assert done and done.get("message_id")
        msgs = _msgs(client, sid)
        asst = [m for m in msgs if m["role"] == "assistant"]
        users = [m for m in msgs if m["role"] == "user"]
        assert len(asst) == turn + 1 and len(users) == turn + 1, [m["role"] for m in msgs]
        assert asst[-1]["id"] == done["message_id"]
        assert asst[-1]["content"] == text
