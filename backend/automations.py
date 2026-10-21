import re
from datetime import date, timedelta

from core import db, new_id, now_iso, log_activity, local_today
from models import TaskIn, AchievementIn

RULES = {
    "recurring_tasks": {"name": "Recurring tasks", "trigger": "Task completed", "condition": "Task has a recurrence rule", "action": "Create the next occurrence with a new due date", "external": False},
    "interaction_followup": {"name": "Interaction follow-ups", "trigger": "Interaction logged with a contact", "condition": "Interaction has a next step", "action": "Create a follow-up task in Inbox and set the contact's follow-up date", "external": False},
    "meeting_note_actions": {"name": "Meeting note action items", "trigger": "Meeting note created", "condition": "Lines start with '- [ ]', 'TODO:' or 'Action:'", "action": "Create proposed tasks in Inbox linked to the note", "external": False},
    "achievement_capture": {"name": "Achievement capture", "trigger": "Milestone done, project completed, goal achieved, habit streak reached", "condition": "First time the event occurs", "action": "Record an entry on the achievements timeline", "external": False},
    "weekly_review_draft": {"name": "Sunday weekly-review draft", "trigger": "Every Sunday 18:00 UK time (scheduled)", "condition": "No weekly review exists for the week", "action": "Create a pre-filled weekly review with a proposed plan for next week", "external": False},
    "weekly_review_email": {"name": "Sunday \"week ahead\" email", "trigger": "Right after the Sunday weekly-review draft is prepared", "condition": "Email delivery is connected", "action": "Email you a short summary of next week's plan (sent only to your own address)", "external": True},
}

ACTION_RE = re.compile(r"^\s*(?:-\s*\[\s*\]|TODO:|Action:)\s*(.+)$", re.I | re.M)


def enabled(user, rule):
    return ((user.get("settings") or {}).get("automations") or {}).get(rule, True)


def _add_month(d: date) -> date:
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return date(y, m, min(d.day, 28))


async def _new_task(uid, **fields):
    data = TaskIn(**{k: v for k, v in fields.items() if k in TaskIn.model_fields}).model_dump()
    extra = {k: v for k, v in fields.items() if k not in TaskIn.model_fields}
    doc = {"id": new_id(), "user_id": uid, **data, **extra, "created_at": now_iso(), "updated_at": now_iso()}
    await db.tasks.insert_one(doc)
    await log_activity(uid, "tasks", doc["id"], "created", doc["title"], note="Created by automation")
    return doc


async def h_recurring(uid, p):
    t = await db.tasks.find_one({"id": p["task_id"], "user_id": uid}, {"_id": 0})
    if not t:
        raise ValueError("Source task no longer exists")
    base = date.fromisoformat(t.get("due_date") or p["completed_on"])
    step = {"daily": 1, "weekly": 7}.get(t["recurrence"])
    nxt = base + timedelta(days=step) if step else _add_month(base)
    keep = {k: t[k] for k in ("title", "notes", "priority", "est_minutes", "project_id", "goal_id", "contact_id", "domain", "recurrence", "completion_criteria", "delegated_to")}
    subs = [{**s, "done": False} for s in t.get("subtasks") or []]
    doc = await _new_task(uid, **keep, status="todo", due_date=nxt.isoformat(), subtasks=subs, recurrence_parent_id=t["id"], source="automation:recurring_tasks")
    return f"Created next occurrence due {nxt.isoformat()} ({doc['id']})"


async def h_followup(uid, p):
    i = await db.interactions.find_one({"id": p["interaction_id"], "user_id": uid}, {"_id": 0})
    c = i and await db.contacts.find_one({"id": i["contact_id"], "user_id": uid}, {"_id": 0})
    if not c:
        raise ValueError("Interaction or contact no longer exists")
    upd, out = {}, []
    if not c.get("last_contacted") or i["date"] > c["last_contacted"]:
        upd["last_contacted"] = i["date"]
    if i.get("next_step"):
        t = await _new_task(uid, title=f"Follow up with {c['name']}: {i['next_step']}", status="inbox", priority=2,
                            due_date=i.get("next_step_date"), contact_id=c["id"], domain=c["domain"],
                            source="automation:interaction_followup", interaction_id=i["id"])
        out.append(f"Created follow-up task {t['id']}")
        if i.get("next_step_date"):
            upd["next_follow_up"] = i["next_step_date"]
    if upd:
        await db.contacts.update_one({"id": c["id"]}, {"$set": {**upd, "updated_at": now_iso()}})
        out.append(f"Updated contact: {', '.join(upd)}")
    return "; ".join(out) or "Nothing to do"


async def h_meeting(uid, p):
    n = await db.notes.find_one({"id": p["note_id"], "user_id": uid}, {"_id": 0})
    if not n:
        raise ValueError("Note no longer exists")
    items = [m.strip() for m in ACTION_RE.findall(n.get("body") or "") if m.strip()][:30]
    for title in items:
        await _new_task(uid, title=title[:300], status="inbox", project_id=n.get("project_id"), goal_id=n.get("goal_id"),
                        contact_id=n.get("contact_id"), domain=n["domain"], source="automation:meeting_note_actions", note_id=n["id"])
    return f"Created {len(items)} proposed task(s)"


async def h_achievement(uid, p):
    data = AchievementIn(title=p["title"][:300], description=p.get("description"), kind=p["kind"],
                         domain=p.get("domain", "business"), date=p["date"]).model_dump()
    doc = {"id": new_id(), "user_id": uid, **data, "source_entity": p.get("source_entity"), "source_id": p.get("source_id"),
           "auto": True, "created_at": now_iso(), "updated_at": now_iso()}
    await db.achievements.insert_one(doc)
    return f"Recorded achievement {doc['id']}"


HANDLERS = {"recurring_tasks": h_recurring, "interaction_followup": h_followup,
            "meeting_note_actions": h_meeting, "achievement_capture": h_achievement}


async def execute(run_doc):
    try:
        result = await HANDLERS[run_doc["rule"]](run_doc["user_id"], run_doc["payload"])
        upd = {"status": "success", "result": result, "error": None}
    except Exception as e:  # noqa: BLE001 — every failure is recorded in the audit trail
        upd = {"status": "failed", "error": str(e)}
    upd.update(finished_at=now_iso(), attempts=run_doc.get("attempts", 0) + 1)
    await db.automation_runs.update_one({"id": run_doc["id"]}, {"$set": upd})
    return {**run_doc, **upd}


async def run(user, rule, trigger, dedupe_key, payload):
    if not enabled(user, rule):
        return None
    uid = user["user_id"]
    if await db.automation_runs.find_one({"user_id": uid, "dedupe_key": dedupe_key, "status": "success"}, {"_id": 1}):
        return None
    doc = {"id": new_id(), "user_id": uid, "rule": rule, "trigger": trigger, "dedupe_key": dedupe_key, "payload": payload,
           "status": "running", "attempts": 0, "started_at": now_iso()}
    await db.automation_runs.insert_one(doc)
    doc.pop("_id", None)
    return await execute(doc)


async def after_save(user, name, before, after):
    today = local_today().isoformat()
    b = before or {}
    if name == "tasks" and after["status"] == "done" and b.get("status") != "done" and after.get("recurrence", "none") != "none":
        await run(user, "recurring_tasks", "task.completed", f"recur:{after['id']}", {"task_id": after["id"], "completed_on": today})
    if name == "interactions" and before is None:
        await run(user, "interaction_followup", "interaction.created", f"int:{after['id']}", {"interaction_id": after["id"]})
    if name == "notes" and before is None and after["kind"] == "meeting":
        await run(user, "meeting_note_actions", "note.created", f"note:{after['id']}", {"note_id": after["id"]})
    if name == "projects":
        old_done = {m.get("id") for m in b.get("milestones") or [] if m.get("done")}
        for m in after.get("milestones") or []:
            if m.get("done") and m.get("id") and m["id"] not in old_done:
                await run(user, "achievement_capture", "milestone.done", f"ach:ms:{m['id']}",
                          {"title": f"Milestone reached: {m['title']}", "description": f"Project: {after['title']}", "kind": "milestone",
                           "domain": after["domain"], "date": today, "source_entity": "projects", "source_id": after["id"]})
        if after["status"] == "completed" and b.get("status") != "completed":
            await run(user, "achievement_capture", "project.completed", f"ach:project:{after['id']}",
                      {"title": f"Project completed: {after['title']}", "kind": "project", "domain": after["domain"],
                       "date": today, "source_entity": "projects", "source_id": after["id"]})
    if name == "goals":
        t, c, bl = after.get("target"), after.get("current"), after.get("baseline") or 0
        metric_hit = t is not None and c is not None and t != bl and (c - bl) / (t - bl) >= 1
        if after["status"] == "achieved" or metric_hit:
            await run(user, "achievement_capture", "goal.achieved", f"ach:goal:{after['id']}",
                      {"title": f"Goal achieved: {after['title']}", "kind": "goal", "domain": after["domain"],
                       "date": today, "source_entity": "goals", "source_id": after["id"]})
