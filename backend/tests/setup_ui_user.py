# Seeds a TEST UI user with onboarding complete + one PDF document for Playwright UI tests
import os, io, json, uuid, requests
from reportlab.pdfgen import canvas
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
email = f"test_ui_{uuid.uuid4().hex[:6]}@example.com"
r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST UI"})
s = requests.Session(); s.headers["Authorization"] = "Bearer " + r.json()["access_token"]
s.patch(f"{API}/me/profile", json={"onboarding_complete": True, "company_name": "TEST Co"})
buf = io.BytesIO(); c = canvas.Canvas(buf)
c.drawString(72, 720, "Intro page for the TEST Falconridge partnership agreement."); c.showPage()
c.drawString(72, 720, "The Falconridge partnership renewal deadline is 14 August 2026 and the fee is 18500 GBP."); c.showPage(); c.save()
d = s.post(f"{API}/documents", files={"file": ("test_falconridge.pdf", buf.getvalue(), "application/pdf")}).json()
print(json.dumps({"email": email, "doc_id": d["id"], "status": d["status"]}))
