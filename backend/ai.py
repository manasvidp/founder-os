import asyncio
import json
import logging
import re
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

import llm

from core import db, get_current_user, new_id, now_iso
from models import Strict, DateStr, Text
from intel import D, find, goals_projects, finance_summary, habits_overview, plan_day

_TASKS: set = set()

router = APIRouter(prefix="/api/ai")
U = Depends(get_current_user)
log = logging.getLogger("ai")

SYSTEM = """You are the AI Chief of Staff inside Founder OS, the founder's private operating system for business and personal life.
Roles you play as needed: strategic adviser, executive assistant, execution partner, business analyst, relationship assistant, personal planning partner and reflection partner.

Rules:
- Ground every statement about the founder's situation in the RECORDS below. Cite records inline using their exact tag, e.g. [task:ID] or [goal:ID]. Never invent records, numbers, clients, results or sources.
- Clearly separate **Facts** (from records), **Inferences** and **Recommendations** when analysing.
- If data is missing or thin, say so plainly and ask a focused clarifying question.
- Respect rest, relationships and health as legitimate priorities. Never assume maximum productivity is the goal.
- You cannot send messages, publish, or move money. You may PROPOSE record changes; the founder approves them in the UI.
- To propose new records, append ONE fenced block at the end exactly like:
```fos-actions
[{"type":"create_task","title":"...","priority":2,"due_date":"YYYY-MM-DD","domain":"business","project_id":"optional existing id","goal_id":"optional existing id","est_minutes":30},
 {"type":"create_goal","title":"...","horizon":"quarter","domain":"business","due_date":"YYYY-MM-DD","metric_name":"optional","target":0},
 {"type":"create_project","title":"...","domain":"business","goal_id":"optional existing id","due_date":"YYYY-MM-DD"}]
```
Only include fields you are confident about; only reference ids that exist in RECORDS. Keep it to at most 12 actions.
- Citation tags are rendered in the UI as clickable chips showing the record's title, so do NOT repeat the title next to a tag.
- Write concise, well-structured markdown (short headings, bullets). No filler."""


def _line(kind, d, title, extra):
    return f"[{kind}:{d['id']}] {title} | " + " ".join(f"{k}={v}" for k, v in extra.items() if v not in (None, "", [], False))


async def build_context(user, ds, message=""):
    uid, today = user["user_id"], D(ds)
    refs, L = {}, []

    def add(_kind, d, title, **extra):
        refs[d["id"]] = {"type": _kind, "title": title}
        L.append(_line(_kind, d, title, extra))

    p = user.get("profile") or {}
    s = user.get("settings") or {}
    L.append(f"Founder: {user.get('name')} | company={p.get('company_name')} | today={ds} | work hours {s.get('work_start', '09:00')}-{s.get('work_end', '18:00')} | currency={s.get('currency', 'USD')}")
    for k in ("life_vision", "company_vision", "mission", "values", "definition_of_success", "positioning", "target_customers"):
        if p.get(k):
            L.append(f"{k}: {p[k][:600]}")
    goals, projects = await goals_projects(uid, today)
    L.append("\n## GOALS")
    for g in goals[:60]:
        add("goal", g, g["title"], horizon=g["horizon"], domain=g["domain"], status=g["status"], progress=f"{g['progress']}%" if g["progress"] is not None else "n/a",
            expected=g["expected"], metric=g.get("metric_name"), current=g.get("current"), target=g.get("target"), due=g.get("due_date"),
            parent=g.get("parent_id"), behind=g["behind"], no_plan=g["no_plan"])
    L.append("\n## PROJECTS")
    for pr in projects[:60]:
        add("project", pr, pr["title"], status=pr["status"], domain=pr["domain"], goal=pr.get("goal_id"), progress=f"{pr['progress']}%",
            due=pr.get("due_date"), at_risk=pr["at_risk"], next_milestone=(pr["next_milestone"] or {}).get("title"))
    tasks = await db.tasks.find({"user_id": uid, "status": {"$ne": "done"}}, {"_id": 0}).sort([("priority", 1), ("due_date", 1)]).to_list(120)
    L.append("\n## OPEN TASKS")
    for t in tasks:
        add("task", t, t["title"], status=t["status"], p=t["priority"], due=t.get("due_date"), scheduled=t.get("scheduled_date"), est=t.get("est_minutes"),
            domain=t["domain"], project=t.get("project_id"), goal=t.get("goal_id"), contact=t.get("contact_id"), top3=t.get("top3_date"), delegated=t.get("delegated_to"))
    done = await db.tasks.find({"user_id": uid, "status": "done"}, {"_id": 0}).sort("completed_at", -1).to_list(30)
    L.append("\n## RECENTLY COMPLETED")
    for t in done:
        add("task", t, t["title"], completed=(t.get("completed_at") or "")[:10], domain=t["domain"], project=t.get("project_id"))
    evs = await find("events", uid, {"start": {"$gte": (today - timedelta(days=7)).isoformat(), "$lte": (today + timedelta(days=14)).isoformat()}})
    L.append("\n## CALENDAR (past 7 / next 14 days)")
    for e in sorted(evs, key=lambda e: e["start"]):
        add("event", e, e["title"], start=e["start"], end=e["end"][11:16], domain=e["domain"], kind=e["kind"], contact=e.get("contact_id"), prep=(e.get("prep_notes") or "")[:200])
    contacts = await db.contacts.find({"user_id": uid}, {"_id": 0}).sort("next_follow_up", 1).to_list(80)
    L.append("\n## PEOPLE")
    for c in contacts:
        add("contact", c, c["name"], org=c.get("organisation"), kind=c["kind"], stage=c["stage"], deal=c.get("deal_value"),
            last_contacted=c.get("last_contacted"), follow_up=c.get("next_follow_up"), notes=(c.get("notes") or "")[:160])
    inter = await db.interactions.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(30)
    for i in inter:
        L.append(f"interaction {i['date']} with [contact:{i['contact_id']}] ({i['kind']}): {i['summary'][:200]} next={i.get('next_step')}")
    L.append("\n## FINANCE (actuals; projections are estimates)")
    for dom in ("business", "personal"):
        f = await finance_summary(uid, today, dom)
        L.append(f"{dom}: cash={f['cash']} month={f['month']} income={f['income']} expense={f['expense']} burn={f['burn']} runway_months={f['runway_months']} receivables={f['receivables']} months_of_data={f['months_of_data']}")
        for b in f["budgets"]:
            L.append(f"  budget {b['category']}: {b['spent']}/{b['amount']} ({b['pct']}%)")
        for k, v in sorted(f["by_category"].items(), key=lambda x: -x[1])[:8]:
            L.append(f"  spent {k}: {v}")
    L.append("\n## HABITS & WELLBEING")
    for h in await habits_overview(uid, today):
        add("habit", h, h["name"], streak=h["streak"], week=f"{h['week_count']}/{h['target_per_week']}", done_today=h["done_today"])
    for c in await db.checkins.find({"user_id": uid}, {"_id": 0}).sort("date", -1).to_list(7):
        L.append(f"checkin {c['date']}: energy={c.get('energy')} mood={c.get('mood')} stress={c.get('stress')} sleep={c.get('sleep_hours')}")
    plan = await plan_day(user, today)
    L.append(f"\n## TODAY CAPACITY: free={plan['free_minutes']}min meetings={plan['meeting_minutes']}min demand={plan['demand_minutes']}min capacity={plan['capacity_minutes']}min overcommitted={plan['overcommitted']}")
    notes = await db.notes.find({"user_id": uid}, {"_id": 0}).sort("created_at", -1).to_list(25)
    L.append("\n## NOTES & DECISIONS")
    for n in notes:
        add("note", n, n["title"], kind=n["kind"], domain=n["domain"], decision=(n.get("decision") or "")[:200], body=(n.get("body") or "")[:300].replace("\n", " "))
    revs = await db.reviews.find({"user_id": uid}, {"_id": 0}).sort("period_start", -1).to_list(3)
    for r in revs:
        L.append(f"review {r['kind']} {r['period_start']}: wins={(r.get('wins') or '')[:200]} challenges={(r.get('challenges') or '')[:200]} next_focus={(r.get('next_focus') or '')[:200]}")
    from workspace import doc_context, DOC_RULE
    hits = await doc_context(uid, message)
    if hits:
        L.append(f"\n## DOCUMENT EXCERPTS (retrieved for this request). {DOC_RULE} Cite as [doc:ID p.N] or [doc:ID s.N] using the given location.")
        for c, title in hits:
            refs[c["doc_id"]] = {"type": "doc", "title": title}
            L.append(f"<excerpt tag=\"[doc:{c['doc_id']} {c['label']}]\" title=\"{title}\">\n{c['text'][:1500]}\n</excerpt>")
    biz = await db.biz.find({"user_id": uid}, {"_id": 0}).to_list(60)
    if biz:
        L.append("\n## BUSINESS WORKSPACE")
        for b in biz:
            L.append(f"{b['kind']}: {b['title']} | owner={b.get('owner')} status={b.get('status')} current={b.get('current')} target={b.get('target')} severity={b.get('severity')}")
    return "\n".join(L), refs


class ChatIn(Strict):
    message: Text
    date: DateStr
    session_id: Optional[str] = None
    title: Optional[str] = None


def sse(obj):
    return f"data: {json.dumps(obj)}\n\n"


@router.get("/sessions")
async def sessions(user=U):
    return await db.ai_sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("updated_at", -1).to_list(100)


@router.get("/sessions/{sid}/messages")
async def messages(sid: str, user=U):
    return await db.ai_messages.find({"user_id": user["user_id"], "session_id": sid}, {"_id": 0}).sort("created_at", 1).to_list(500)


@router.delete("/sessions/{sid}")
async def delete_session(sid: str, user=U):
    uid = user["user_id"]
    await db.ai_sessions.delete_one({"id": sid, "user_id": uid})
    await db.ai_messages.delete_many({"session_id": sid, "user_id": uid})
    return {"ok": True}


@router.post("/chat")
async def chat(body: ChatIn, user=U):
    uid = user["user_id"]
    if not body.message.strip():
        raise HTTPException(400, "Message is empty")
    sid = body.session_id
    if sid:
        if not await db.ai_sessions.find_one({"id": sid, "user_id": uid}):
            raise HTTPException(404, "Session not found")
    else:
        sid = new_id()
        await db.ai_sessions.insert_one({"id": sid, "user_id": uid, "title": (body.title or body.message)[:80], "created_at": now_iso(), "updated_at": now_iso()})
    history = await db.ai_messages.find({"user_id": uid, "session_id": sid}, {"_id": 0}).sort("created_at", -1).to_list(12)
    ctx, refs = await build_context(user, body.date, body.message)
    convo = "".join(f"{'Founder' if m['role'] == 'user' else 'Chief of Staff'}: {m['content'][:3000]}\n\n" for m in reversed(history))
    prompt = (f"Previous conversation:\n{convo}\n" if convo else "") + f"Founder's request: {body.message}"
    turn = new_id()
    await db.ai_messages.insert_one({"id": new_id(), "user_id": uid, "session_id": sid, "role": "user", "content": body.message, "created_at": now_iso()})
    system = f"{SYSTEM}\n\n# RECORDS (authorised data for this founder, as of {body.date})\n{ctx}"

    queue: asyncio.Queue = asyncio.Queue()
    mid = new_id()

    async def produce():
        full = ""
        try:
            async for text in llm.stream(system, prompt):
                full += text
                queue.put_nowait({"type": "delta", "text": text})
        except Exception as e:  # noqa: BLE001
            log.exception("AI stream failed")
            queue.put_nowait({"type": "error", "detail": f"The AI service failed: {str(e)[:200]}"})
            if not full:
                return
        used = {i: refs[i] for i in set(re.findall(r"\[(?:\w+):([0-9a-f-]{36})(?: [ps]\.\d+)?\]", full)) if i in refs}
        await db.ai_messages.insert_one({"id": mid, "user_id": uid, "session_id": sid, "role": "assistant", "turn": turn, "content": full, "refs": used, "created_at": now_iso()})
        await db.ai_sessions.update_one({"id": sid}, {"$set": {"updated_at": now_iso()}})
        queue.put_nowait({"type": "done", "refs": used, "message_id": mid})

    task = asyncio.create_task(produce())
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)

    async def gen():
        yield sse({"type": "session", "session_id": sid})
        while True:
            ev = await queue.get()
            yield sse(ev)
            if ev["type"] in ("done", "error"):
                return

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
