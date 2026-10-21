# Diagnostic: AI chat disconnect persistence (run manually: python diag_chat_disconnect.py <base_url>)
import sys, json, time, uuid, requests
from datetime import date

base = sys.argv[1].rstrip("/") + "/api"
email = f"test_diag_{uuid.uuid4().hex[:6]}@example.com"
tok = requests.post(f"{base}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST diag"}).json()["access_token"]
s = requests.Session()
s.headers["Authorization"] = f"Bearer {tok}"
r = s.post(f"{base}/ai/chat", json={"message": "Write a 400-word essay about weekly planning.", "date": date.today().isoformat()}, stream=True, timeout=180)
sid, n = None, 0
for line in r.iter_lines():
    if line.startswith(b"data: "):
        ev = json.loads(line[6:])
        if ev["type"] == "session":
            sid = ev["session_id"]
        if ev["type"] == "delta":
            n += 1
            if n >= 3:
                break
r.close()
print("disconnected sid", sid)
for i in range(int(sys.argv[2]) if len(sys.argv) > 2 else 20):
    time.sleep(3)
    msgs = s.get(f"{base}/ai/sessions/{sid}/messages").json()
    a = [m for m in msgs if m["role"] == "assistant"]
    print(i * 3, "assistant msgs:", len(a), (len(a[0]["content"]) if a else 0))
    if a:
        break
s.delete(f"{base}/account", json={"confirm": "DELETE"})
