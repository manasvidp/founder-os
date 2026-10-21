# Founder OS backend regression tests: auth, isolation, tasks, goals/projects, calendar/plan, CRM, finance, personal, notes, reviews, search, settings
import os
import uuid
import io
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TODAY = date.today().isoformat()
TOMORROW = (date.today() + timedelta(days=1)).isoformat()
CREATED_USERS = []


def register(prefix="test_"):
    email = f"{prefix}{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST User"})
    assert r.status_code == 200, r.text
    d = r.json()
    CREATED_USERS.append(email)
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {d['access_token']}"})
    return s, d, email


@pytest.fixture(scope="module")
def ua():
    return register()


@pytest.fixture(scope="module")
def ub():
    return register()


# ---- auth ----
class TestAuth:
    def test_register_returns_token_and_cookies(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST"})
        CREATED_USERS.append(email)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == email and d["access_token"] and "password_hash" not in d
        assert "access_token" in r.cookies or "access_token" in r.headers.get("set-cookie", "")
        assert d.get("settings", {}).get("onboarding_complete") is False
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "testpass123", "name": "TEST"})
        assert r2.status_code == 400

    def test_login_me_logout(self, ua):
        _, _, email = ua
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200 and me.json()["email"] == email
        # cookie based
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"})
        assert s.get(f"{API}/auth/me").status_code == 200
        assert s.post(f"{API}/auth/refresh").status_code == 200
        s.post(f"{API}/auth/logout")
        assert s.get(f"{API}/auth/me").status_code == 401

    def test_admin_login(self):
        r = requests.post(f"{API}/auth/login", json={"email": os.environ["ADMIN_EMAIL"], "password": os.environ["ADMIN_PASSWORD"]})
        assert r.status_code == 200 and r.json()["role"] == "admin"

    def test_wrong_password_and_lockout(self):
        s, _, email = register()
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "wrongpass1"}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5, codes
        assert codes[5] == 429, codes
        # even correct pw locked
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"}).status_code == 429

    def test_unauth(self):
        assert requests.get(f"{API}/tasks").status_code == 401


# ---- onboarding / profile ----
class TestProfile:
    def test_profile_update(self, ua):
        s, _, _ = ua
        r = s.patch(f"{API}/me/profile", json={"company_name": "TEST Co", "work_start": "09:00", "work_end": "17:00",
                                               "daily_capacity_minutes": 360, "onboarding_complete": True, "currency": "GBP"})
        assert r.status_code == 200
        d = r.json()
        assert d["profile"]["company_name"] == "TEST Co" and d["settings"]["onboarding_complete"] is True


# ---- data isolation ----
class TestIsolation:
    def test_cross_user(self, ua, ub):
        a, b = ua[0], ub[0]
        t = a.post(f"{API}/tasks", json={"title": "TEST A task"}).json()
        g = a.post(f"{API}/goals", json={"title": "TEST A goal"}).json()
        c = a.post(f"{API}/contacts", json={"name": "TEST A contact"}).json()
        p = a.post(f"{API}/projects", json={"title": "TEST A proj"}).json()
        for ent, x in (("tasks", t), ("goals", g), ("contacts", c)):
            assert b.get(f"{API}/{ent}/{x['id']}").status_code == 404
            assert b.patch(f"{API}/{ent}/{x['id']}", json={}).status_code == 404
            assert b.delete(f"{API}/{ent}/{x['id']}").status_code == 404
        assert b.post(f"{API}/tasks", json={"title": "x", "project_id": p["id"]}).status_code == 400
        assert all(x["id"] != t["id"] for x in b.get(f"{API}/tasks").json())
        assert b.post(f"{API}/tasks/bulk", json={"ids": [t["id"]], "action": "delete"}).json()["updated"] == 0
        assert a.get(f"{API}/tasks/{t['id']}").status_code == 200


# ---- tasks ----
class TestTasks:
    def test_crud_and_bulk(self, ua):
        s = ua[0]
        t = s.post(f"{API}/tasks", json={"title": "TEST t1", "due_date": TODAY, "priority": 2}).json()
        assert t["status"] == "inbox"
        u = s.patch(f"{API}/tasks/{t['id']}", json={"status": "done"}).json()
        assert u["status"] == "done" and u["completed_at"]
        assert s.get(f"{API}/tasks", params={"status": "done"}).status_code == 200
        ids = [s.post(f"{API}/tasks", json={"title": f"TEST bulk {i}"}).json()["id"] for i in range(3)]
        assert s.post(f"{API}/tasks/bulk", json={"ids": ids[:2], "action": "complete"}).json()["updated"] == 2
        assert s.get(f"{API}/tasks/{ids[0]}").json()["status"] == "done"
        assert s.post(f"{API}/tasks/bulk", json={"ids": ids, "action": "delete"}).json()["updated"] == 3
        assert s.get(f"{API}/tasks/{ids[0]}").status_code == 404

    def test_validation(self, ua):
        s = ua[0]
        assert s.post(f"{API}/tasks", json={"title": ""}).status_code == 422
        assert s.post(f"{API}/tasks", json={"title": "x", "due_date": "bad"}).status_code == 422
        assert s.post(f"{API}/tasks", json={"title": "x", "foo": 1}).status_code == 422
        t = s.post(f"{API}/tasks", json={"title": "TEST v"}).json()
        assert s.patch(f"{API}/tasks/{t['id']}", json={"title": None}).status_code == 400

    def test_recurring(self, ua):
        s = ua[0]
        t = s.post(f"{API}/tasks", json={"title": "TEST recur", "recurrence": "weekly", "due_date": TODAY, "status": "todo"}).json()
        s.patch(f"{API}/tasks/{t['id']}", json={"status": "done"})
        nxt = [x for x in s.get(f"{API}/tasks").json() if x.get("recurrence_parent_id") == t["id"]]
        assert len(nxt) == 1 and nxt[0]["due_date"] == (date.today() + timedelta(days=7)).isoformat()
        runs = s.get(f"{API}/automations/runs").json()
        assert any(r["rule"] == "recurring_tasks" and r["status"] == "success" for r in runs)


# ---- goals & projects ----
class TestGoalsProjects:
    def test_goal_project_flow(self, ua):
        s = ua[0]
        g = s.post(f"{API}/goals", json={"title": "TEST MRR", "metric_name": "MRR", "baseline": 0, "target": 100, "current": 0}).json()
        u = s.patch(f"{API}/goals/{g['id']}", json={"current": 40, "change_note": "TEST note"}).json()
        assert u["current"] == 40
        acts = s.get(f"{API}/activity", params={"entity_id": g["id"]}).json()
        assert any(a.get("note") == "TEST note" for a in acts), acts
        ctx = s.get(f"{API}/goals/{g['id']}/context", params={"date": TODAY})
        assert ctx.status_code == 200, ctx.text
        p = s.post(f"{API}/projects", json={"title": "TEST proj", "goal_id": g["id"],
                                            "milestones": [{"title": "M1"}, {"title": "M2"}]}).json()
        assert p["goal_id"] == g["id"]
        s.post(f"{API}/tasks", json={"title": "TEST pt", "project_id": p["id"], "status": "done"})
        s.post(f"{API}/tasks", json={"title": "TEST pt2", "project_id": p["id"]})
        ms = p["milestones"]
        ms[0]["done"] = True
        s.patch(f"{API}/projects/{p['id']}", json={"milestones": ms})
        pc = s.get(f"{API}/projects/{p['id']}/context", params={"date": TODAY}).json()
        prog = pc.get("project", pc).get("progress")
        assert prog == 50, pc
        # milestone added via PATCH (as frontend does) must get an id and completing it must not 500
        ms2 = s.get(f"{API}/projects/{p['id']}").json()["milestones"] + [{"title": "M3"}]
        r = s.patch(f"{API}/projects/{p['id']}", json={"milestones": ms2})
        assert r.status_code == 200 and all(m.get("id") for m in r.json()["milestones"])
        ms3 = r.json()["milestones"]
        ms3[-1]["done"] = True
        assert s.patch(f"{API}/projects/{p['id']}", json={"milestones": ms3}).status_code == 200
        ach = s.get(f"{API}/achievements").json()
        assert any("M1" in a["title"] for a in ach)
        so = s.get(f"{API}/strategy/overview", params={"date": TODAY})
        assert so.status_code == 200


# ---- calendar & planner ----
class TestCalendar:
    def test_events_and_plan(self, ua):
        s = ua[0]
        e = s.post(f"{API}/events", json={"title": "TEST mtg", "start": f"{TODAY}T10:00", "end": f"{TODAY}T11:00"})
        assert e.status_code == 200
        cal = s.get(f"{API}/calendar", params={"start": TODAY, "end": TODAY}).json()
        assert "TEST mtg" in str(cal)
        for i in range(3):
            s.post(f"{API}/tasks", json={"title": f"TEST big {i}", "est_minutes": 240, "due_date": TODAY, "status": "todo"})
        plan = s.get(f"{API}/plan/day", params={"date": TODAY}).json()
        assert plan["overcommitted"] is True and plan["blocks"]
        b = plan["blocks"][0]
        r = s.post(f"{API}/plan/apply", json={"date": TODAY, "blocks": [{"task_id": x["task_id"], "start": x["start"]} for x in plan["blocks"]], "defer": []})
        assert r.status_code == 200 and r.json()["updated"] >= 1
        t = s.get(f"{API}/tasks/{b['task_id']}").json()
        assert t["scheduled_time"] == b["start"] and t["scheduled_date"] == TODAY

    def test_plan_apply_bad_payload(self, ua):
        r = ua[0].post(f"{API}/plan/apply", json={"date": TODAY, "blocks": [{"foo": 1}]})
        assert r.status_code in (400, 422), f"got {r.status_code}"


# ---- CRM ----
class TestPeople:
    def test_interaction_followup_and_toggle(self, ua):
        s = ua[0]
        c = s.post(f"{API}/contacts", json={"name": "TEST Alice", "stage": "lead"}).json()
        assert s.patch(f"{API}/contacts/{c['id']}", json={"stage": "meeting"}).json()["stage"] == "meeting"
        i = s.post(f"{API}/interactions", json={"contact_id": c["id"], "date": TODAY, "summary": "TEST call",
                                                "next_step": "send deck", "next_step_date": TOMORROW})
        assert i.status_code == 200
        tasks = [t for t in s.get(f"{API}/tasks", params={"status": "inbox"}).json() if t.get("contact_id") == c["id"]]
        assert len(tasks) == 1 and "send deck" in tasks[0]["title"]
        assert s.get(f"{API}/contacts/{c['id']}").json()["next_follow_up"] == TOMORROW
        assert s.get(f"{API}/contacts/{c['id']}/context").status_code == 200
        # pause automation
        assert s.put(f"{API}/automations/interaction_followup", json={"enabled": False}).status_code == 200
        s.post(f"{API}/interactions", json={"contact_id": c["id"], "date": TODAY, "summary": "TEST call2", "next_step": "x2"})
        tasks2 = [t for t in s.get(f"{API}/tasks").json() if t.get("contact_id") == c["id"]]
        assert len(tasks2) == 1
        s.put(f"{API}/automations/interaction_followup", json={"enabled": True})
        rules = s.get(f"{API}/automations").json()
        assert all(r["enabled"] for r in rules)


# ---- finance ----
class TestFinance:
    def test_finance_flow(self, ua):
        s = ua[0]
        a = s.post(f"{API}/accounts", json={"name": "TEST bank", "balance": 10000}).json()
        assert a["balance"] == 10000
        s.post(f"{API}/transactions", json={"date": TODAY, "description": "TEST inc", "amount": 500, "direction": "income", "account_id": a["id"]})
        s.post(f"{API}/transactions", json={"date": TODAY, "description": "TEST exp", "amount": 200, "category": "Software"})
        s.post(f"{API}/transactions", json={"date": TODAY, "description": "TEST pend", "amount": 50, "status": "pending"})
        s.post(f"{API}/budgets", json={"category": "Software", "month": TODAY[:7], "amount": 300})
        assert s.post(f"{API}/transactions", json={"date": TODAY, "description": "neg", "amount": -5}).status_code == 422
        f = s.get(f"{API}/finance/summary", params={"date": TODAY, "domain": "business"}).json()
        assert f["income"] == 500 and f["expense"] == 200, f
        assert any(b["category"] == "Software" and b["spent"] == 200 for b in f["budgets"])
        assert s.get(f"{API}/finance/summary", params={"date": TODAY, "domain": "combined"}).status_code == 200

    def test_csv_import_dedupe(self, ua):
        s = ua[0]
        csv = f"date,description,amount,category\n{TODAY},TEST Stripe,1200,Sales\n{TODAY},TEST AWS,-99.5,Software\nbad,row,x,y\n"
        r1 = s.post(f"{API}/transactions/import", files={"file": ("t.csv", io.BytesIO(csv.encode()), "text/csv")}, data={"domain": "business"}).json()
        assert r1["created"] == 2 and len(r1["errors"]) == 1, r1
        r2 = s.post(f"{API}/transactions/import", files={"file": ("t.csv", io.BytesIO(csv.encode()), "text/csv")}, data={"domain": "business"}).json()
        assert r2["created"] == 0 and r2["skipped_duplicates"] == 2
        aws = [t for t in s.get(f"{API}/transactions").json() if t["description"] == "TEST AWS"][0]
        assert aws["direction"] == "expense" and aws["amount"] == 99.5


# ---- personal ----
class TestPersonal:
    def test_habits_checkins(self, ua):
        s = ua[0]
        h = s.post(f"{API}/habits", json={"name": "TEST run"}).json()
        y = (date.today() - timedelta(days=1)).isoformat()
        assert s.post(f"{API}/habits/{h['id']}/toggle", json={"date": y}).json()["done"] is True
        assert s.post(f"{API}/habits/{h['id']}/toggle", json={"date": TODAY}).json()["done"] is True
        ov = s.get(f"{API}/habits/overview", params={"date": TODAY}).json()
        hh = [x for x in ov if x["id"] == h["id"]][0]
        assert hh["streak"] == 2 and hh["done_today"] is True
        assert s.post(f"{API}/habits/{h['id']}/toggle", json={"date": TODAY}).json()["done"] is False
        c = s.put(f"{API}/checkins/{TODAY}", json={"energy": 4, "mood": 3, "sleep_hours": 7.5}).json()
        assert c["energy"] == 4
        assert s.put(f"{API}/checkins/{TODAY}", json={"energy": 9}).status_code == 400
        assert s.get(f"{API}/checkins").json()[0]["date"] == TODAY


# ---- notes, reviews, achievements, dashboard, search, export ----
class TestMisc:
    def test_meeting_note(self, ua):
        s = ua[0]
        n = s.post(f"{API}/notes", json={"title": "TEST meeting", "kind": "meeting", "body": "Agenda\n- [ ] Send proposal\nTODO: Book room"}).json()
        tasks = [t for t in s.get(f"{API}/tasks").json() if t.get("note_id") == n["id"]]
        assert sorted(t["title"] for t in tasks) == ["Book room", "Send proposal"]

    def test_reviews_achievements(self, ua):
        s = ua[0]
        start = (date.today() - timedelta(days=6)).isoformat()
        st = s.get(f"{API}/reviews/stats", params={"start": start, "end": TODAY})
        assert st.status_code == 200 and st.json()["tasks_completed"] >= 1
        r = s.post(f"{API}/reviews", json={"kind": "weekly", "period_start": start, "period_end": TODAY, "wins": "TEST"})
        assert r.status_code == 200
        a = s.post(f"{API}/achievements", json={"title": "TEST win", "date": TODAY})
        assert a.status_code == 200
        pr = s.get(f"{API}/progress", params={"date": TODAY})
        assert pr.status_code == 200, pr.text

    def test_dashboard_perspective(self, ua):
        s = ua[0]
        for p in ("combined", "business", "personal"):
            r = s.get(f"{API}/dashboard", params={"date": TODAY, "perspective": p})
            assert r.status_code == 200, r.text

    def test_search(self, ua):
        s = ua[0]
        res = s.get(f"{API}/search", params={"q": "TEST Alice"}).json()
        assert any(x["type"] == "contact" for x in res)
        assert s.get(f"{API}/search", params={"q": "send deck"}).json()

    def test_export_integrations(self, ua):
        s = ua[0]
        r = s.get(f"{API}/export")
        assert r.status_code == 200 and "attachment" in r.headers.get("content-disposition", "")
        d = r.json()
        assert d["tasks"] and "password_hash" not in d["user"]
        ints = s.get(f"{API}/integrations").json()
        assert {i["status"] for i in ints} <= {"connected", "not_configured", "not_implemented"}

    def test_ai_sessions_list(self, ua):
        assert ua[0].get(f"{API}/ai/sessions").status_code == 200


# ---- account deletion / cleanup ----
class TestDeleteAccount:
    def test_delete(self):
        s, d, email = register()
        s.post(f"{API}/tasks", json={"title": "TEST del"})
        assert s.delete(f"{API}/account", json={"confirm": "nope"}).status_code == 400
        assert s.delete(f"{API}/account", json={"confirm": "DELETE"}).status_code == 200
        assert requests.post(f"{API}/auth/login", json={"email": email, "password": "testpass123"}).status_code == 401
