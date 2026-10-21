import csv
import hashlib
import io
import re
from datetime import date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from core import db, get_current_user, now_iso, new_id, log_activity
from models import TransactionIn, DateStr, TimeStr, Strict
import automations

router = APIRouter(prefix="/api")
U = Depends(get_current_user)


def D(s):
    return date.fromisoformat(s[:10])


def clamp(v, lo=0, hi=100):
    return max(lo, min(hi, v))


async def find(coll, uid, q=None, limit=5000):
    return await db[coll].find({"user_id": uid, **(q or {})}, {"_id": 0}).to_list(limit)


def dq(perspective):
    return {} if perspective in (None, "combined") else {"domain": perspective}


def settings_of(user):
    s = user.get("settings") or {}
    return {"work_start": s.get("work_start", "09:00"), "work_end": s.get("work_end", "18:00"),
            "capacity": int(s.get("daily_capacity_minutes", 360)), "currency": s.get("currency", "USD")}


# ---------- progress ----------
async def task_counts(uid, field):
    rows = await db.tasks.aggregate([
        {"$match": {"user_id": uid, field: {"$ne": None}}},
        {"$group": {"_id": f"${field}", "total": {"$sum": 1}, "done": {"$sum": {"$cond": [{"$eq": ["$status", "done"]}, 1, 0]}}}},
    ]).to_list(5000)
    return {r["_id"]: (r["done"], r["total"]) for r in rows}


def project_pct(p, counts):
    if p["status"] == "completed":
        return 100
    d, t = counts.get(p["id"], (0, 0))
    ms = p.get("milestones") or []
    d += sum(1 for m in ms if m["done"])
    t += len(ms)
    return round(100 * d / t) if t else 0


def enrich_projects(projects, counts, today):
    for p in projects:
        d, t = counts.get(p["id"], (0, 0))
        p["progress"] = project_pct(p, counts)
        p["task_done"], p["task_total"] = d, t
        nxt = sorted([m for m in p.get("milestones") or [] if not m["done"]], key=lambda m: m.get("due_date") or "9999")
        p["next_milestone"] = nxt[0] if nxt else None
        due = p.get("due_date")
        p["at_risk"] = bool(p["status"] in ("active", "planning") and due and (
            D(due) < today or (D(due) - today).days <= 14 and p["progress"] < 60))
    return projects


def enrich_goals(goals, projects, gcounts, today):
    by_goal = {}
    for p in projects:
        if p.get("goal_id"):
            by_goal.setdefault(p["goal_id"], []).append(p)
    for g in goals:
        ps = by_goal.get(g["id"], [])
        t, c, b = g.get("target"), g.get("current"), g.get("baseline") or 0
        td, tt = gcounts.get(g["id"], (0, 0))
        if t is not None and c is not None and t != b:
            pct, src = clamp(round((c - b) / (t - b) * 100)), "metric"
        elif ps:
            pct, src = round(sum(p["progress"] for p in ps) / len(ps)), "projects"
        elif tt:
            pct, src = round(100 * td / tt), "tasks"
        else:
            pct, src = None, "none"
        if g["status"] == "achieved":
            pct = 100
        exp = None
        if g.get("due_date"):
            start = D(g.get("start_date") or g["created_at"])
            span = (D(g["due_date"]) - start).days
            exp = clamp(round(100 * (today - start).days / span)) if span > 0 else 100
        g.update(progress=pct, progress_source=src, expected=exp, project_count=len(ps), task_count=tt,
                 behind=bool(g["status"] == "active" and pct is not None and exp is not None and pct < exp - 15),
                 no_plan=bool(g["status"] == "active" and g["horizon"] not in ("vision", "three_year") and not ps and not tt))
    return goals


async def goals_projects(uid, today, perspective=None):
    projects = await find("projects", uid, dq(perspective))
    enrich_projects(projects, await task_counts(uid, "project_id"), today)
    goals = await find("goals", uid, dq(perspective))
    all_projects = projects if perspective in (None, "combined") else enrich_projects(await find("projects", uid), await task_counts(uid, "project_id"), today)
    enrich_goals(goals, all_projects, await task_counts(uid, "goal_id"), today)
    return goals, projects


# ---------- habits ----------
def streak(days: set, today: date):
    d = today if today.isoformat() in days else today - timedelta(days=1)
    count, misses, used_grace = 0, 0, False
    for _ in range(800):
        if d.isoformat() in days:
            count += 1
            misses = 0
        else:
            misses += 1
            if misses > 1 or used_grace:
                break
            used_grace = True
        d -= timedelta(days=1)
    return count


async def habits_overview(uid, today, perspective=None):
    habits = await find("habits", uid, {"active": True, **dq(perspective)})
    since = (today - timedelta(days=400)).isoformat()
    logs = await find("habit_logs", uid, {"date": {"$gte": since}})
    by = {}
    for lg in logs:
        by.setdefault(lg["habit_id"], set()).add(lg["date"])
    week = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    for h in habits:
        s = by.get(h["id"], set())
        h["done_today"] = today.isoformat() in s
        h["streak"] = streak(s, today)
        h["last7"] = [d in s for d in week]
        h["week_count"] = sum(h["last7"])
        h["consistency"] = clamp(round(100 * h["week_count"] / h["target_per_week"]))
        h["history"] = sorted(d for d in s if d >= (today - timedelta(days=90)).isoformat())
    return habits


# ---------- finance ----------
def month_key(d: date, back=0):
    y, m = d.year, d.month - back
    while m <= 0:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}"


async def finance_summary(uid, today, domain=None):
    q = dq(domain)
    accounts = await find("accounts", uid, q)
    cash = sum(a["balance"] for a in accounts)
    txs = await find("transactions", uid, q)
    budgets = await find("budgets", uid, {**q, "month": month_key(today)})
    months = [month_key(today, i) for i in range(5, -1, -1)]
    series = {m: {"month": m, "income": 0.0, "expense": 0.0} for m in months}
    cat = {}
    receivables, upcoming = 0.0, []
    for t in txs:
        mk = t["date"][:7]
        if t["status"] == "actual" and mk in series:
            series[mk][t["direction"]] += t["amount"]
            if mk == months[-1] and t["direction"] == "expense":
                cat[t["category"]] = cat.get(t["category"], 0) + t["amount"]
        if t["status"] == "pending" and t["direction"] == "income":
            receivables += t["amount"]
        if t["status"] in ("pending", "projected") and t["direction"] == "expense" and today.isoformat() <= t["date"] <= (today + timedelta(days=30)).isoformat():
            upcoming.append(t)
    full = [series[m] for m in months[:-1] if series[m]["income"] or series[m]["expense"]][-3:]
    avg_in = sum(s["income"] for s in full) / len(full) if full else None
    avg_ex = sum(s["expense"] for s in full) / len(full) if full else None
    burn = (avg_ex - avg_in) if full else None
    runway = round(cash / burn, 1) if burn and burn > 0 and cash > 0 else None
    budget_rows = []
    for b in budgets:
        spent = cat.get(b["category"], 0)
        budget_rows.append({**b, "spent": spent, "pct": round(100 * spent / b["amount"]) if b["amount"] else None})
    scenarios = None
    if full:
        scenarios = {}
        for name, fi, fe in (("conservative", 0.8, 1.1), ("expected", 1.0, 1.0), ("ambitious", 1.2, 1.0)):
            bal, path = cash, []
            for _ in range(6):
                bal += avg_in * fi - avg_ex * fe
                path.append(round(bal, 2))
            scenarios[name] = path
    cur = series[months[-1]]
    return {"domain": domain or "combined", "cash": cash, "accounts": accounts, "month": months[-1],
            "income": cur["income"], "expense": cur["expense"], "net": cur["income"] - cur["expense"],
            "series": list(series.values()), "by_category": cat, "budgets": budget_rows,
            "avg_income": avg_in, "avg_expense": avg_ex, "burn": burn, "runway_months": runway,
            "receivables": receivables, "upcoming": sorted(upcoming, key=lambda t: t["date"]),
            "scenarios": scenarios, "months_of_data": len(full),
            "basis": "Actual transactions only. Scenarios are projections from your trailing average, not guarantees."}


# ---------- planner ----------
def mins(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def hhmm(n):
    return f"{n // 60:02d}:{n % 60:02d}"


def task_score(t, day):
    s = (5 - t["priority"]) * 100
    if t.get("top3_date") == day.isoformat():
        s += 1000
    if t.get("due_date"):
        dd = D(t["due_date"])
        s += 300 if dd < day else 150 if dd == day else max(0, 60 - (dd - day).days * 10)
    if t.get("goal_id") or t.get("project_id"):
        s += 50
    return s


async def plan_day(user, day: date):
    uid, st = user["user_id"], settings_of(user)
    ds = day.isoformat()
    events = sorted(await find("events", uid, {"start": {"$regex": f"^{ds}"}}), key=lambda e: e["start"])
    open_tasks = await find("tasks", uid, {"status": {"$ne": "done"}})
    done_ids = {t["id"] for t in await find("tasks", uid, {"status": "done"})}
    horizon = (day + timedelta(days=2)).isoformat()
    cands, blocked = [], []
    for t in open_tasks:
        if t["status"] == "waiting" or t.get("delegated_to"):
            continue
        rel = t.get("top3_date") == ds or t.get("scheduled_date") == ds or (t.get("due_date") and t["due_date"] <= horizon and not (t.get("scheduled_date") and t["scheduled_date"] > ds))
        if not rel:
            continue
        if any(b not in done_ids for b in t.get("blocked_by") or []):
            blocked.append(t)
        else:
            cands.append(t)
    cands.sort(key=lambda t: -task_score(t, day))
    ws, we = mins(st["work_start"]), mins(st["work_end"])
    merged = []
    for bs, be in sorted((mins(e["start"][11:16]), mins(e["end"][11:16]) if e["end"][:10] == ds else 24 * 60) for e in events):
        if merged and bs <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], be)
        else:
            merged.append([bs, be])
    busy = [tuple(b) for b in merged]
    slots, cur = [], ws
    for bs, be in sorted(busy):
        if bs > cur:
            slots.append([cur, min(bs, we)])
        cur = max(cur, be)
    if cur < we:
        slots.append([cur, we])
    slots = [s for s in slots if s[1] > s[0]]
    free = sum(s[1] - s[0] for s in slots)
    blocks, overflow, used = [], [], 0
    for t in cands:
        dur = t.get("est_minutes") or 30
        slot = next((s for s in slots if s[1] - s[0] >= dur), None)
        if slot and used + dur <= st["capacity"]:
            blocks.append({"task_id": t["id"], "title": t["title"], "start": hhmm(slot[0]), "end": hhmm(slot[0] + dur),
                           "minutes": dur, "priority": t["priority"], "domain": t["domain"], "estimated": not t.get("est_minutes"),
                           "reason": "Top priority" if t.get("top3_date") == ds else "Overdue" if t.get("due_date") and t["due_date"] < ds else f"P{t['priority']}" + (" · due " + t["due_date"] if t.get("due_date") else "")})
            slot[0] += dur
            used += dur
        else:
            nxt = day + timedelta(days=1)
            while nxt.weekday() >= 5:
                nxt += timedelta(days=1)
            overflow.append({"task_id": t["id"], "title": t["title"], "minutes": dur, "priority": t["priority"], "suggested_date": nxt.isoformat(), "due_date": t.get("due_date")})
    demand = sum((t.get("est_minutes") or 30) for t in cands)
    return {"date": ds, "work_start": st["work_start"], "work_end": st["work_end"], "capacity_minutes": st["capacity"],
            "free_minutes": free, "meeting_minutes": sum(be - bs for bs, be in busy), "demand_minutes": demand,
            "scheduled_minutes": used, "overcommitted": demand > min(free, st["capacity"]), "blocks": blocks, "overflow": overflow,
            "blocked": [{"task_id": t["id"], "title": t["title"], "blocked_by": t["blocked_by"]} for t in blocked],
            "events": events}


class PlanBlock(Strict):
    task_id: str
    start: TimeStr


class PlanDefer(Strict):
    task_id: str
    date: DateStr


class PlanApply(Strict):
    date: DateStr
    blocks: List[PlanBlock] = []
    defer: List[PlanDefer] = []


@router.get("/plan/day")
async def get_plan(date: DateStr, user=U):
    return await plan_day(user, D(date))


@router.post("/plan/apply")
async def apply_plan(body: PlanApply, user=U):
    uid, n = user["user_id"], 0
    for b in body.blocks:
        r = await db.tasks.update_one({"id": b.task_id, "user_id": uid}, {"$set": {"scheduled_date": body.date, "scheduled_time": b.start, "updated_at": now_iso()}})
        n += r.modified_count
    for d in body.defer:
        r = await db.tasks.update_one({"id": d.task_id, "user_id": uid}, {"$set": {"scheduled_date": d.date, "scheduled_time": None, "updated_at": now_iso()}})
        n += r.modified_count
        if r.modified_count:
            await log_activity(uid, "tasks", d.task_id, "rescheduled", note=f"Deferred to {d.date} via day planner")
    return {"updated": n}


# ---------- gamification ----------
LEVEL_TITLES = ["Starter", "Operator", "Builder", "Strategist", "Scale Architect", "Visionary"]


async def progress_stats(uid, today):
    c = db.tasks.count_documents
    tasks_done = await c({"user_id": uid, "status": "done"})
    top3_done = await c({"user_id": uid, "status": "done", "top3_date": {"$ne": None}})
    habit_logs = await db.habit_logs.count_documents({"user_id": uid})
    projects = await find("projects", uid)
    ms_done = sum(1 for p in projects for m in p.get("milestones") or [] if m["done"])
    proj_done = sum(1 for p in projects if p["status"] == "completed")
    goals_done = await db.goals.count_documents({"user_id": uid, "status": "achieved"})
    reviews = await db.reviews.count_documents({"user_id": uid})
    interactions = await db.interactions.count_documents({"user_id": uid})
    habits = await habits_overview(uid, today)
    best = max([h["streak"] for h in habits] or [0])
    xp = tasks_done * 10 + top3_done * 15 + habit_logs * 5 + ms_done * 50 + proj_done * 100 + goals_done * 200 + reviews * 30 + interactions * 5
    level = int((xp / 50) ** 0.5) + 1
    nxt = (level ** 2) * 50
    prev = ((level - 1) ** 2) * 50
    badges = [
        {"key": "first_task", "name": "First Commitment Kept", "desc": "Complete your first task", "earned": tasks_done >= 1},
        {"key": "tasks_50", "name": "Reliable Operator", "desc": "Complete 50 tasks", "earned": tasks_done >= 50},
        {"key": "top3_10", "name": "Priority Keeper", "desc": "Complete 10 top-three priorities", "earned": top3_done >= 10},
        {"key": "streak_7", "name": "Week of Consistency", "desc": "Reach a 7-day habit streak", "earned": best >= 7},
        {"key": "streak_30", "name": "Rooted Routine", "desc": "Reach a 30-day habit streak", "earned": best >= 30},
        {"key": "milestone", "name": "Milestone Maker", "desc": "Complete a project milestone", "earned": ms_done >= 1},
        {"key": "project", "name": "Shipper", "desc": "Complete a project", "earned": proj_done >= 1},
        {"key": "goal", "name": "Goal Achiever", "desc": "Achieve a goal", "earned": goals_done >= 1},
        {"key": "review_4", "name": "Reflective Founder", "desc": "Complete 4 reviews", "earned": reviews >= 4},
        {"key": "network_10", "name": "Relationship Builder", "desc": "Log 10 interactions", "earned": interactions >= 10},
    ]
    return {"xp": xp, "level": level, "title": LEVEL_TITLES[min((level - 1) // 3, len(LEVEL_TITLES) - 1)],
            "level_floor": prev, "next_level_xp": nxt, "best_streak": best, "badges": badges,
            "counts": {"tasks_done": tasks_done, "top3_done": top3_done, "habit_logs": habit_logs, "milestones": ms_done,
                       "projects_completed": proj_done, "goals_achieved": goals_done, "reviews": reviews, "interactions": interactions}}


@router.get("/progress")
async def get_progress(date: DateStr, user=U):
    return await progress_stats(user["user_id"], D(date))


# ---------- dashboard ----------
def build_insights(goals, projects, overdue, plan, contacts_due, fin, checkins, events_week, st, today):
    out = []
    add = lambda kind, sev, title, detail, link, refs=None: out.append({"kind": kind, "severity": sev, "title": title, "detail": detail, "link": link, "refs": refs or []})
    for g in goals:
        if g.get("no_plan"):
            add("no_plan", "warning", f"“{g['title']}” has no execution plan", "No projects or tasks are linked to this goal yet.", f"/plan?goal={g['id']}", [{"type": "goal", "id": g["id"]}])
        elif g.get("behind"):
            add("goal_behind", "risk", f"“{g['title']}” is behind schedule", f"{g['progress']}% done vs {g['expected']}% of time elapsed.", f"/plan?goal={g['id']}", [{"type": "goal", "id": g["id"]}])
    gmap = {g["id"]: g for g in goals}
    for p in projects:
        if p.get("at_risk"):
            add("project_risk", "risk", f"Project “{p['title']}” is at risk", f"{p['progress']}% complete, due {p['due_date']}.", f"/projects/{p['id']}", [{"type": "project", "id": p["id"]}])
        g = gmap.get(p.get("goal_id"))
        if p["status"] == "active" and g and g["status"] in ("abandoned", "paused", "achieved"):
            add("misaligned", "warning", f"“{p['title']}” supports a goal that is {g['status']}", "Consider pausing or re-linking this project.", f"/projects/{p['id']}", [{"type": "project", "id": p["id"]}])
    if overdue:
        add("overdue", "risk", f"{len(overdue)} overdue task(s)", "Reschedule, delegate or drop them deliberately.", "/tasks?view=overdue")
    if plan["overcommitted"]:
        add("overcommitted", "warning", "Today is overcommitted", f"{plan['demand_minutes']} min of work vs {min(plan['free_minutes'], plan['capacity_minutes'])} min available.", "/calendar?planner=1")
    if contacts_due:
        add("followups", "info", f"{len(contacts_due)} follow-up(s) due", ", ".join(c["name"] for c in contacts_due[:3]), "/people?view=followups")
    for b in fin["budgets"]:
        if b["pct"] is not None and b["pct"] > 100:
            add("budget", "warning", f"{b['category']} is over budget", f"{b['pct']}% of {fin['month']} budget used ({b['domain']}).", "/finance")
    if fin["runway_months"] is not None and fin["runway_months"] < 6:
        add("runway", "risk", f"Runway is {fin['runway_months']} months", "Based on trailing 3-month net burn of business accounts.", "/finance")
    late = [e for e in events_week if e["domain"] == "business" and e["end"][11:16] > st["work_end"]]
    if len(late) >= 3:
        add("late_work", "warning", "Business is spilling into your evenings", f"{len(late)} business events end after {st['work_end']} this week.", "/calendar")
    en = [c["energy"] for c in checkins if c.get("energy")]
    if len(en) >= 3 and sum(en) / len(en) <= 2.5:
        add("energy", "warning", "Energy has been low", f"Average energy {round(sum(en) / len(en), 1)}/5 over your last check-ins. Protect recovery time.", "/personal")
    order = {"risk": 0, "warning": 1, "info": 2}
    return sorted(out, key=lambda i: order[i["severity"]])


def next_action(top3, today_tasks, overdue, ds):
    for label, pool in (("It is one of today's top three priorities", [t for t in top3 if t["status"] != "done"]),
                        ("It is overdue", overdue), ("It is due today", today_tasks)):
        if pool:
            t = sorted(pool, key=lambda t: (t["priority"], t.get("due_date") or "9999"))[0]
            return {"task": t, "reason": f"{label} and has priority P{t['priority']}" + (" and is linked to a goal" if t.get("goal_id") else "") + "."}
    return None


@router.get("/dashboard")
async def dashboard(date: DateStr, perspective: str = "combined", user=U):
    uid, today, st = user["user_id"], D(date), settings_of(user)
    ds = today.isoformat()
    q = dq(perspective)
    open_tasks = await find("tasks", uid, {"status": {"$ne": "done"}, **q})
    top3 = sorted(await find("tasks", uid, {"top3_date": ds, **q}), key=lambda t: t["created_at"])
    done_today = await find("tasks", uid, {"status": "done", "completed_at": {"$regex": f"^{ds}"}, **q})
    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < ds]
    today_tasks = [t for t in open_tasks if (t.get("due_date") == ds or t.get("scheduled_date") == ds) and t.get("top3_date") != ds]
    inbox = sum(1 for t in open_tasks if t["status"] == "inbox")
    events = sorted(await find("events", uid, {"start": {"$regex": f"^{ds}"}, **q}), key=lambda e: e["start"])
    week_end = (today + timedelta(days=7)).isoformat()
    events_week = await find("events", uid, {"start": {"$gte": ds, "$lte": week_end}, **q})
    goals, projects = await goals_projects(uid, today, perspective)
    contacts = await find("contacts", uid, {"next_follow_up": {"$ne": None, "$lte": (today + timedelta(days=3)).isoformat()}, **q})
    pipeline = await find("contacts", uid, {"stage": {"$in": ["lead", "contacted", "meeting", "proposal"]}, "domain": "business"})
    habits = await habits_overview(uid, today, None if perspective == "business" else "personal") if perspective != "business" else []
    checkin = await db.checkins.find_one({"user_id": uid, "date": ds}, {"_id": 0})
    checkins = await db.checkins.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(7)
    fin = {d: await finance_summary(uid, today, d) for d in ("business", "personal")}
    plan = await plan_day(user, today)
    achievements = await db.achievements.find({"user_id": uid, **q}, {"_id": 0}).sort("date", -1).to_list(5)
    shutdown = await db.reviews.find_one({"user_id": uid, "kind": "daily", "period_start": ds}, {"_id": 0})
    fin_ins = fin["business"] if perspective != "personal" else fin["personal"]
    insights = build_insights([g for g in goals], projects, overdue, plan, contacts, fin_ins, checkins, events_week, st, today)
    comps = []
    if top3:
        comps.append({"key": "top3", "label": "Top priorities", "weight": 50, "value": sum(t["status"] == "done" for t in top3) / len(top3)})
    planned = len(done_today) + len([t for t in today_tasks if t["status"] != "done"])
    if planned:
        comps.append({"key": "tasks", "label": "Planned tasks", "weight": 20, "value": len(done_today) / planned})
    if habits:
        comps.append({"key": "habits", "label": "Habits", "weight": 20, "value": sum(h["done_today"] for h in habits) / len(habits)})
    comps.append({"key": "shutdown", "label": "Daily shutdown", "weight": 10, "value": 1 if shutdown else 0})
    tw = sum(c["weight"] for c in comps)
    score = round(sum(c["weight"] * c["value"] for c in comps) / tw * 100) if tw else 0
    return {
        "date": ds, "perspective": perspective, "profile": user.get("profile") or {}, "settings": st,
        "top3": top3, "today_tasks": today_tasks, "overdue": overdue, "done_today": done_today, "inbox_count": inbox,
        "events": events, "goals": [g for g in goals if g["status"] == "active" and g["horizon"] in ("annual", "quarter", "month")],
        "projects": [p for p in projects if p["status"] in ("active", "planning")],
        "followups": sorted(contacts, key=lambda c: c["next_follow_up"]),
        "pipeline": {"count": len(pipeline), "value": sum(c.get("deal_value") or 0 for c in pipeline)},
        "habits": habits, "checkin": checkin, "finance": fin, "plan": {k: plan[k] for k in ("free_minutes", "demand_minutes", "capacity_minutes", "meeting_minutes", "overcommitted")},
        "achievements": achievements, "insights": insights, "next_action": next_action(top3, today_tasks, overdue, ds),
        "score": {"value": score, "components": comps}, "shutdown_done": bool(shutdown),
    }


@router.get("/strategy/overview")
async def strategy_overview(date: DateStr, user=U):
    goals, projects = await goals_projects(user["user_id"], D(date))
    return {"goals": goals, "projects": projects}


# ---------- contexts ----------
@router.get("/goals/{gid}/context")
async def goal_context(gid: str, date: DateStr, user=U):
    uid = user["user_id"]
    goals, projects = await goals_projects(uid, D(date))
    g = next((x for x in goals if x["id"] == gid), None)
    if not g:
        raise HTTPException(404, "Goal not found")
    return {"goal": g, "children": [x for x in goals if x.get("parent_id") == gid],
            "parent": next((x for x in goals if x["id"] == g.get("parent_id")), None),
            "projects": [p for p in projects if p.get("goal_id") == gid],
            "tasks": await find("tasks", uid, {"goal_id": gid}),
            "notes": await find("notes", uid, {"goal_id": gid}),
            "history": await db.activity.find({"user_id": uid, "entity_id": gid}, {"_id": 0}).sort("at", -1).to_list(100)}


@router.get("/projects/{pid}/context")
async def project_context(pid: str, date: DateStr, user=U):
    uid = user["user_id"]
    goals, projects = await goals_projects(uid, D(date))
    p = next((x for x in projects if x["id"] == pid), None)
    if not p:
        raise HTTPException(404, "Project not found")
    return {"project": p, "goal": next((g for g in goals if g["id"] == p.get("goal_id")), None),
            "tasks": await find("tasks", uid, {"project_id": pid}), "notes": await find("notes", uid, {"project_id": pid}),
            "events": await find("events", uid, {"project_id": pid}),
            "history": await db.activity.find({"user_id": uid, "entity_id": pid}, {"_id": 0}).sort("at", -1).to_list(100)}


@router.get("/contacts/{cid}/context")
async def contact_context(cid: str, user=U):
    uid = user["user_id"]
    c = await db.contacts.find_one({"id": cid, "user_id": uid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Contact not found")
    return {"contact": c, "interactions": await db.interactions.find({"user_id": uid, "contact_id": cid}, {"_id": 0}).sort("date", -1).to_list(500),
            "tasks": await find("tasks", uid, {"contact_id": cid}), "events": await find("events", uid, {"contact_id": cid}),
            "notes": await find("notes", uid, {"contact_id": cid}), "transactions": await find("transactions", uid, {"contact_id": cid})}


# ---------- calendar ----------
@router.get("/calendar")
async def calendar(start: DateStr, end: DateStr, user=U):
    uid = user["user_id"]
    events = await find("events", uid, {"start": {"$gte": start, "$lte": end + "T23:59"}})
    tasks = await find("tasks", uid, {"$or": [{"scheduled_date": {"$gte": start, "$lte": end}}, {"due_date": {"$gte": start, "$lte": end}}]})
    return {"events": sorted(events, key=lambda e: e["start"]), "tasks": tasks}


# ---------- finance ----------
@router.get("/finance/summary")
async def get_finance(date: DateStr, domain: str = "business", user=U):
    return await finance_summary(user["user_id"], D(date), None if domain == "combined" else domain)


@router.post("/transactions/import")
async def import_csv(file: UploadFile = File(...), domain: str = Form("business"), user=U):
    if domain not in ("business", "personal"):
        raise HTTPException(400, "domain must be business or personal")
    raw = await file.read()
    if len(raw) > 2_000_000:
        raise HTTPException(400, "File too large (max 2 MB)")
    try:
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    except UnicodeDecodeError:
        raise HTTPException(400, "File must be UTF-8 CSV")
    uid, created, skipped, errors = user["user_id"], 0, 0, []
    for n, r in enumerate(rows, start=2):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        try:
            amt = float(r.get("amount", "").replace(",", "").replace("$", "").replace("£", "").replace("€", ""))
            direction = r.get("direction") or r.get("type") or ("income" if amt > 0 else "expense")
            direction = "income" if direction.lower().startswith("inc") or direction.lower() == "credit" else "expense"
            tx = TransactionIn(date=r.get("date", "")[:10], description=r.get("description") or r.get("memo") or "Imported",
                               amount=abs(amt), direction=direction, category=r.get("category") or "Uncategorised", domain=domain)
        except Exception as e:  # noqa: BLE001
            errors.append(f"Row {n}: {str(e).splitlines()[0][:120]}")
            continue
        h = hashlib.sha1(f"{tx.date}|{tx.description}|{tx.amount}|{tx.direction}|{domain}".encode()).hexdigest()
        if await db.transactions.find_one({"user_id": uid, "import_hash": h}, {"_id": 1}):
            skipped += 1
            continue
        await db.transactions.insert_one({"id": new_id(), "user_id": uid, **tx.model_dump(), "import_hash": h, "source": "csv", "created_at": now_iso(), "updated_at": now_iso()})
        created += 1
    await log_activity(uid, "transactions", None, "imported", file.filename, note=f"{created} created, {skipped} duplicates skipped, {len(errors)} errors")
    return {"created": created, "skipped_duplicates": skipped, "errors": errors[:50]}


# ---------- habits & check-ins ----------
class Toggle(Strict):
    date: DateStr


@router.get("/habits/overview")
async def get_habits(date: DateStr, user=U):
    return await habits_overview(user["user_id"], D(date))


@router.post("/habits/{hid}/toggle")
async def toggle_habit(hid: str, body: Toggle, user=U):
    uid = user["user_id"]
    h = await db.habits.find_one({"id": hid, "user_id": uid}, {"_id": 0})
    if not h:
        raise HTTPException(404, "Habit not found")
    q = {"user_id": uid, "habit_id": hid, "date": body.date}
    if await db.habit_logs.find_one(q):
        await db.habit_logs.delete_one(q)
        done = False
    else:
        await db.habit_logs.update_one(q, {"$setOnInsert": {**q, "id": new_id(), "created_at": now_iso()}}, upsert=True)
        done = True
        s = streak({lg["date"] for lg in await find("habit_logs", uid, {"habit_id": hid})}, D(body.date))
        for n in (7, 30, 100):
            if s >= n:
                await automations.run(user, "achievement_capture", "habit.streak", f"ach:habit:{hid}:{n}",
                                      {"title": f"{n}-day streak: {h['name']}", "kind": "personal", "domain": h["domain"], "date": body.date,
                                       "source_entity": "habits", "source_id": hid})
    return {"done": done}


class CheckinIn(Strict):
    energy: Optional[int] = None
    mood: Optional[int] = None
    stress: Optional[int] = None
    sleep_hours: Optional[float] = Field(None, ge=0, le=24)
    note: Optional[str] = Field(None, max_length=5000)


@router.put("/checkins/{day}")
async def put_checkin(day: DateStr, body: CheckinIn, user=U):
    for k in ("energy", "mood", "stress"):
        v = getattr(body, k)
        if v is not None and not 1 <= v <= 5:
            raise HTTPException(400, f"{k} must be 1-5")
    uid = user["user_id"]
    await db.checkins.update_one({"user_id": uid, "date": day}, {"$set": {**body.model_dump(exclude_unset=True), "updated_at": now_iso()},
                                                                  "$setOnInsert": {"id": new_id(), "user_id": uid, "date": day}}, upsert=True)
    return await db.checkins.find_one({"user_id": uid, "date": day}, {"_id": 0})


@router.get("/checkins")
async def get_checkins(user=U):
    return await db.checkins.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1).to_list(90)


# ---------- reviews ----------
@router.get("/reviews/stats")
async def review_stats(start: DateStr, end: DateStr, user=U):
    uid = user["user_id"]
    rng = {"$gte": start, "$lte": end + "T23:59:59~"}
    done = await find("tasks", uid, {"status": "done", "completed_at": rng})
    top3 = await find("tasks", uid, {"top3_date": {"$gte": start, "$lte": end}})
    events = await find("events", uid, {"start": {"$gte": start, "$lte": end + "T23:59"}})
    txs = await find("transactions", uid, {"date": {"$gte": start, "$lte": end}, "status": "actual"})
    logs = await db.habit_logs.count_documents({"user_id": uid, "date": {"$gte": start, "$lte": end}})
    inter = await find("interactions", uid, {"date": {"$gte": start, "$lte": end}})
    ach = await find("achievements", uid, {"date": {"$gte": start, "$lte": end}})
    checks = await find("checkins", uid, {"date": {"$gte": start, "$lte": end}})
    habits = await db.habits.count_documents({"user_id": uid, "active": True})
    days = (D(end) - D(start)).days + 1

    def hours(dom):
        tot = 0
        for e in events:
            if e["domain"] == dom and e["end"][:10] == e["start"][:10]:
                tot += mins(e["end"][11:16]) - mins(e["start"][11:16])
        return round(tot / 60, 1)

    spend = {d: sum(t["amount"] for t in txs if t["domain"] == d and t["direction"] == "expense") for d in ("business", "personal")}
    income = {d: sum(t["amount"] for t in txs if t["domain"] == d and t["direction"] == "income") for d in ("business", "personal")}
    en = [c["energy"] for c in checks if c.get("energy")]
    return {"start": start, "end": end,
            "tasks_completed": len(done), "tasks_by_domain": {d: sum(t["domain"] == d for t in done) for d in ("business", "personal")},
            "focus_minutes": sum(t.get("actual_minutes") or t.get("est_minutes") or 0 for t in done),
            "top3_set": len(top3), "top3_done": sum(t["status"] == "done" for t in top3),
            "event_hours": {d: hours(d) for d in ("business", "personal")},
            "habit_completion": round(100 * logs / (habits * days)) if habits else None,
            "interactions": len(inter), "spend": spend, "income": income,
            "avg_energy": round(sum(en) / len(en), 1) if en else None,
            "achievements": ach, "completed": [{"id": t["id"], "title": t["title"], "domain": t["domain"]} for t in done[:50]]}


# ---------- search ----------
SEARCH = [("tasks", "title", "task"), ("projects", "title", "project"), ("goals", "title", "goal"), ("contacts", "name", "contact"),
          ("notes", "title", "note"), ("events", "title", "event"), ("transactions", "description", "transaction")]


@router.get("/search")
async def search(q: str, user=U):
    if len(q.strip()) < 2:
        return []
    rx = {"$regex": re.escape(q.strip()), "$options": "i"}
    out = []
    for coll, field, kind in SEARCH:
        ors = [{field: rx}] + ([{"organisation": rx}, {"email": rx}] if coll == "contacts" else []) + ([{"body": rx}] if coll == "notes" else [])
        for d in await db[coll].find({"user_id": user["user_id"], "$or": ors}, {"_id": 0}).limit(8).to_list(8):
            out.append({"type": kind, "id": d["id"], "title": d[field], "domain": d.get("domain"),
                        "subtitle": d.get("status") or d.get("organisation") or d.get("kind") or d.get("date") or ""})
    return out


@router.get("/activity")
async def activity(entity_id: Optional[str] = None, limit: int = 50, user=U):
    q = {"user_id": user["user_id"], **({"entity_id": entity_id} if entity_id else {})}
    return await db.activity.find(q, {"_id": 0}).sort("at", -1).to_list(min(limit, 500))


# ---------- automations ----------
class RuleToggle(BaseModel):
    enabled: bool


@router.get("/automations")
async def list_rules(user=U):
    return [{"key": k, **v, "enabled": automations.enabled(user, k)} for k, v in automations.RULES.items()]


@router.put("/automations/{rule}")
async def set_rule(rule: str, body: RuleToggle, user=U):
    if rule not in automations.RULES:
        raise HTTPException(404, "Unknown automation")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {f"settings.automations.{rule}": body.enabled}})
    return {"key": rule, "enabled": body.enabled}


@router.get("/automations/runs")
async def runs(user=U):
    return await db.automation_runs.find({"user_id": user["user_id"]}, {"_id": 0}).sort("started_at", -1).to_list(100)


@router.post("/automations/runs/{rid}/retry")
async def retry(rid: str, user=U):
    r = await db.automation_runs.find_one({"id": rid, "user_id": user["user_id"]}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Run not found")
    if r["status"] != "failed":
        raise HTTPException(400, "Only failed runs can be retried")
    return await automations.execute(r)
