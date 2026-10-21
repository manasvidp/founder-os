from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import hashlib  # noqa: E402
import logging  # noqa: E402
import os  # noqa: E402
import re  # noqa: E402
import secrets  # noqa: E402
from datetime import timedelta  # noqa: E402
from typing import Optional, Literal  # noqa: E402
from urllib.parse import urlparse, urlencode  # noqa: E402

import httpx  # noqa: E402
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response  # noqa: E402
from fastapi.responses import JSONResponse, RedirectResponse, FileResponse  # noqa: E402
from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: E402
from apscheduler.triggers.cron import CronTrigger  # noqa: E402
from pydantic import BaseModel, EmailStr, Field  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from core import (db, client, get_current_user, hash_password, verify_password, create_access_token, create_refresh_token,  # noqa: E402
                  decode_token, now, now_iso, new_id, public_user, log_activity, as_aware, ACCESS_MIN, APP_URL, APP_TZ, cookie_opts)
from models import ENTITIES, UPDATES, LINKS, TRANSIENT, Strict, Short, Text, TimeStr  # noqa: E402
import automations  # noqa: E402
import intel  # noqa: E402
import ai  # noqa: E402
import workspace  # noqa: E402
import llm  # noqa: E402
import mailer  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("founder-os")

app = FastAPI(title="Founder OS API", version="1.0")
api = APIRouter(prefix="/api")
U = Depends(get_current_user)


# ---------- auth ----------
def set_auth_cookies(resp: Response, uid: str, email: str):
    access = create_access_token(uid, email)
    resp.set_cookie("access_token", access, max_age=ACCESS_MIN * 60, **cookie_opts())
    resp.set_cookie("refresh_token", create_refresh_token(uid), max_age=604800, **cookie_opts())
    return access


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def new_user_doc(email, name, **extra):
    return {"user_id": f"user_{new_id().replace('-', '')[:12]}", "email": email, "name": name, "role": "user",
            "profile": {}, "settings": {"onboarding_complete": False}, "created_at": now_iso(), **extra}


def signups_open():
    return os.environ.get("ALLOW_SIGNUPS", "true").lower() != "false"


@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    if not signups_open():
        raise HTTPException(403, "New sign-ups are closed for this workspace")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "An account with this email already exists")
    doc = new_user_doc(email, body.name.strip(), password_hash=hash_password(body.password), auth_provider="password")
    await db.users.insert_one(doc)
    token = set_auth_cookies(response, doc["user_id"], email)
    return {**public_user(doc), "access_token": token}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ident = f"login:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("locked_until") and now().isoformat() < att["locked_until"]:
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        cnt = (att or {}).get("count", 0) + 1
        upd = {"count": cnt, "last": now_iso()}
        if att and att.get("locked_until") and now().isoformat() >= att["locked_until"]:
            upd = {"count": 1, "last": now_iso(), "locked_until": None}
        elif cnt >= 5:
            upd["locked_until"] = (now() + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    await log_activity(user["user_id"], "security", user["user_id"], "login", "Signed in with password")
    token = set_auth_cookies(response, user["user_id"], email)
    return {**public_user(user), "access_token": token}


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    uid = decode_token(request.cookies.get("refresh_token") or "", "refresh")
    user = uid and await db.users.find_one({"user_id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(401, "Invalid refresh token")
    token = set_auth_cookies(response, uid, user["email"])
    return {"ok": True, "access_token": token}


# Google sign-in (your own Google Cloud OAuth client — see DEPLOY.md). Hidden in the UI until configured.
GOOGLE_ID, GOOGLE_SECRET = os.environ.get("GOOGLE_CLIENT_ID", ""), os.environ.get("GOOGLE_CLIENT_SECRET", "")


def google_enabled():
    return bool(GOOGLE_ID and GOOGLE_SECRET and APP_URL)


def google_redirect_uri():
    return f"{APP_URL}/api/auth/google/callback"


@api.get("/auth/config")
async def auth_config():
    return {"google": google_enabled(), "email": mailer.configured(), "signups": signups_open()}


@api.get("/auth/google/start")
async def google_start():
    if not google_enabled():
        raise HTTPException(404, "Google sign-in is not configured")
    state = secrets.token_urlsafe(24)
    q = urlencode({"client_id": GOOGLE_ID, "redirect_uri": google_redirect_uri(), "response_type": "code",
                   "scope": "openid email profile", "state": state, "prompt": "select_account"})
    resp = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{q}", status_code=302)
    resp.set_cookie("oauth_state", state, max_age=600, **cookie_opts())
    return resp


@api.get("/auth/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    fail = RedirectResponse("/login?auth_error=google", status_code=302)
    fail.delete_cookie("oauth_state", path="/")
    if error or not code or not state or not google_enabled() or not secrets.compare_digest(state, request.cookies.get("oauth_state") or ""):
        return fail
    try:
        async with httpx.AsyncClient(timeout=15) as hc:
            tok = await hc.post("https://oauth2.googleapis.com/token", data={
                "code": code, "client_id": GOOGLE_ID, "client_secret": GOOGLE_SECRET,
                "redirect_uri": google_redirect_uri(), "grant_type": "authorization_code"})
            tok.raise_for_status()
            info = await hc.get("https://openidconnect.googleapis.com/v1/userinfo",
                                headers={"Authorization": f"Bearer {tok.json()['access_token']}"})
            info.raise_for_status()
            data = info.json()
    except Exception as e:  # noqa: BLE001
        logger.error("Google sign-in failed: %s", e)
        return fail
    if not data.get("email") or not data.get("email_verified"):
        return fail
    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        if not signups_open():
            return RedirectResponse("/login?auth_error=closed", status_code=302)
        user = new_user_doc(email, data.get("name") or email.split("@")[0], picture=data.get("picture"), auth_provider="google")
        await db.users.insert_one(user)
    elif data.get("picture"):
        await db.users.update_one({"email": email}, {"$set": {"picture": data["picture"]}})
    await log_activity(user["user_id"], "security", user["user_id"], "login", "Signed in with Google")
    resp = RedirectResponse("/", status_code=302)
    resp.delete_cookie("oauth_state", path="/")
    set_auth_cookies(resp, user["user_id"], email)
    return resp


@api.get("/auth/me")
async def me(user=U):
    return user


@api.post("/auth/logout")
async def logout(request: Request, response: Response):
    st = request.cookies.get("session_token")
    if st:
        await db.user_sessions.delete_one({"session_token": st})
    for k in ("access_token", "refresh_token", "session_token"):
        response.delete_cookie(k, path="/")
    return {"ok": True}


class ForgotIn(BaseModel):
    email: EmailStr


RESET_OK = "If an account exists for that email, a reset link is on its way. Check your inbox (and spam)."


@api.post("/auth/forgot-password")
async def forgot(body: ForgotIn):
    if not mailer.configured() or not APP_URL:
        return {"ok": True, "email_available": False,
                "message": "Password reset email isn't switched on yet (no email provider connected). Contact the workspace owner, or sign in with Google if your account uses it."}
    user = await db.users.find_one({"email": body.email.lower()})
    if user:
        hour_ago = now() - timedelta(hours=1)
        recent = await db.password_reset_tokens.count_documents({"user_id": user["user_id"], "created_at": {"$gte": hour_ago}})
        if recent < 3:  # quiet rate limit; the response is identical either way so it can't be used to probe accounts
            token = secrets.token_urlsafe(32)
            await db.password_reset_tokens.update_many({"user_id": user["user_id"], "used": False}, {"$set": {"used": True}})
            await db.password_reset_tokens.insert_one({"token_hash": hashlib.sha256(token.encode()).hexdigest(), "user_id": user["user_id"],
                                                       "used": False, "expires_at": now() + timedelta(hours=1), "created_at": now()})
            try:
                await mailer.send_password_reset(user["email"], user.get("name") or "there", f"{APP_URL}/reset-password?token={token}")
                await log_activity(user["user_id"], "security", user["user_id"], "password_reset_requested", "Password reset email sent")
            except mailer.EmailError as e:
                logger.error("reset email failed: %s", e)
    return {"ok": True, "email_available": True, "message": RESET_OK}


class ResetIn(BaseModel):
    token: str
    password: str = Field(..., min_length=8, max_length=128)


@api.post("/auth/reset-password")
async def reset(body: ResetIn):
    t = await db.password_reset_tokens.find_one({"token_hash": hashlib.sha256(body.token.encode()).hexdigest()})
    if not t or t["used"] or as_aware(t["expires_at"]) < now():
        raise HTTPException(400, "Reset link is invalid or expired")
    await db.users.update_one({"user_id": t["user_id"]}, {"$set": {"password_hash": hash_password(body.password), "auth_provider": "password"}})
    await db.password_reset_tokens.update_one({"_id": t["_id"]}, {"$set": {"used": True}})
    u = await db.users.find_one({"user_id": t["user_id"]}, {"email": 1})
    if u:
        await db.login_attempts.delete_one({"identifier": f"login:{u['email']}"})
    await log_activity(t["user_id"], "security", t["user_id"], "password_reset", "Password reset")
    return {"ok": True}


class ChangePwIn(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


@api.post("/auth/change-password")
async def change_password(body: ChangePwIn, user=U):
    doc = await db.users.find_one({"user_id": user["user_id"]})
    if not doc.get("password_hash") or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await log_activity(user["user_id"], "security", user["user_id"], "password_changed", "Password changed")
    return {"ok": True}


# ---------- profile & settings ----------
class ProfileIn(Strict):
    name: Optional[Short] = None
    company_name: Optional[Short] = None
    role: Optional[Short] = None
    life_vision: Optional[Text] = None
    company_vision: Optional[Text] = None
    mission: Optional[Text] = None
    values: Optional[Text] = None
    definition_of_success: Optional[Text] = None
    positioning: Optional[Text] = None
    target_customers: Optional[Text] = None
    business_model: Optional[Text] = None
    brand_voice: Optional[Text] = None
    audience: Optional[Text] = None
    content_pillars: Optional[Text] = None
    widget_order: Optional[list[str]] = None
    work_start: Optional[TimeStr] = None
    work_end: Optional[TimeStr] = None
    daily_capacity_minutes: Optional[int] = Field(None, ge=30, le=1200)
    currency: Optional[Literal["USD", "GBP", "EUR", "CAD", "AUD", "INR", "SGD", "AED"]] = None
    theme: Optional[Literal["light", "dark"]] = None
    onboarding_complete: Optional[bool] = None
    widgets: Optional[dict] = None


SETTINGS_KEYS = {"work_start", "work_end", "daily_capacity_minutes", "currency", "theme", "onboarding_complete", "widgets", "widget_order"}


@api.patch("/me/profile")
async def update_profile(body: ProfileIn, user=U):
    data = body.model_dump(exclude_unset=True)
    upd = {}
    for k, v in data.items():
        if k == "name":
            upd["name"] = v
        elif k in SETTINGS_KEYS:
            upd[f"settings.{k}"] = v
        else:
            upd[f"profile.{k}"] = v
    if upd:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": upd})
        changed = [k for k in data if k not in ("theme", "widgets")]
        if changed:
            await log_activity(user["user_id"], "profile", user["user_id"], "updated", "Strategy profile", diff={k: [None, "updated"] for k in changed})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})


EXPORT_COLLS = [v[0] for v in ENTITIES.values()] + ["habit_logs", "checkins", "activity", "automation_runs", "ai_sessions", "ai_messages", "documents", "doc_chunks"]


@api.get("/export")
async def export(user=U):
    uid = user["user_id"]
    out = {"exported_at": now_iso(), "user": user}
    for c in EXPORT_COLLS:
        out[c] = await db[c].find({"user_id": uid}, {"_id": 0}).to_list(100000)
    await log_activity(uid, "security", uid, "export", "Data exported")
    return JSONResponse(out, headers={"Content-Disposition": "attachment; filename=founder-os-export.json"})


class DeleteIn(BaseModel):
    confirm: str


@api.delete("/account")
async def delete_account(body: DeleteIn, response: Response, user=U):
    if body.confirm != "DELETE":
        raise HTTPException(400, "Type DELETE to confirm")
    if user.get("role") == "admin":
        raise HTTPException(400, "The owner admin account cannot be deleted from the app")
    uid = user["user_id"]
    for c in EXPORT_COLLS + ["user_sessions", "password_reset_tokens"]:
        await db[c].delete_many({"user_id": uid})
    await db.file_blobs.delete_many({"path": {"$regex": f"^uploads/{re.escape(uid)}/"}})
    await db.users.delete_one({"user_id": uid})
    for k in ("access_token", "refresh_token", "session_token"):
        response.delete_cookie(k, path="/")
    return {"ok": True}


# ---------- generic, user-scoped CRUD ----------
async def validate_links(uid, data):
    for f, coll in LINKS.items():
        if data.get(f) and not await db[coll].find_one({"id": data[f], "user_id": uid}, {"_id": 1}):
            raise HTTPException(400, f"Linked record not found: {f}")
    for b in data.get("blocked_by") or []:
        if not await db.tasks.find_one({"id": b, "user_id": uid}, {"_id": 1}):
            raise HTTPException(400, "Blocking task not found")


def apply_task_status(data, before=None):
    if "status" not in data:
        return
    if data["status"] == "done" and (before or {}).get("status") != "done":
        data["completed_at"] = now_iso()
    elif data["status"] != "done":
        data["completed_at"] = None


def register_crud(name):
    coll, Model, sort, tf = ENTITIES[name]
    Upd = UPDATES[name]
    required = {k for k, v in Model.model_fields.items() if v.is_required()}

    async def list_items(request: Request, user=U):
        q = {"user_id": user["user_id"]}
        for k, v in request.query_params.items():
            if k in Model.model_fields and k not in TRANSIENT:
                q[k] = None if v == "null" else int(v) if k == "priority" else (v == "true") if v in ("true", "false") else v
        if s := request.query_params.get("q"):
            q[tf] = {"$regex": re.escape(s), "$options": "i"}
        limit = min(int(request.query_params.get("limit", 2000)), 5000)
        return await db[coll].find(q, {"_id": 0}).sort(*sort).to_list(limit)

    async def create_item(body: Model, user=U):
        uid = user["user_id"]
        data = body.model_dump()
        note = data.pop("change_note", None)
        await validate_links(uid, data)
        if name == "tasks":
            apply_task_status(data)
        if name == "content" and data.get("status") == "published" and not data.get("published_url"):
            raise HTTPException(400, "Add the live URL (published_url) to mark content as published")
        doc = {"id": new_id(), "user_id": uid, **data, "created_at": now_iso(), "updated_at": now_iso()}
        await db[coll].insert_one(doc)
        doc.pop("_id", None)
        await log_activity(uid, name, doc["id"], "created", doc.get(tf, ""), note=note)
        await automations.after_save(user, name, None, doc)
        return doc

    async def get_item(item_id: str, user=U):
        doc = await db[coll].find_one({"id": item_id, "user_id": user["user_id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(404, f"{name[:-1].capitalize()} not found")
        return doc

    async def update_item(item_id: str, body: Upd, user=U):
        uid = user["user_id"]
        before = await get_item(item_id, user)
        data = body.model_dump(exclude_unset=True)
        for k in ("milestones", "subtasks"):  # nested items must keep their default-generated ids
            if data.get(k) is not None:
                data[k] = [i.model_dump() for i in getattr(body, k)]
        note = data.pop("change_note", None)
        for k in required:
            if k in data and data[k] is None:
                raise HTTPException(400, f"{k} cannot be empty")
        if name == "tasks" and item_id in (data.get("blocked_by") or []):
            raise HTTPException(400, "A task cannot block itself")
        if name == "content" and data.get("status", before["status"]) == "published" and not data.get("published_url", before.get("published_url")):
            raise HTTPException(400, "Add the live URL (published_url) to mark content as published")
        await validate_links(uid, data)
        if name == "tasks":
            apply_task_status(data, before)
        diff = {k: [before.get(k), v] for k, v in data.items() if before.get(k) != v and k not in ("updated_at",)}
        if data:
            await db[coll].update_one({"id": item_id, "user_id": uid}, {"$set": {**data, "updated_at": now_iso()}})
        after = await get_item(item_id, user)
        if diff:
            await log_activity(uid, name, item_id, "updated", after.get(tf, ""), diff=diff, note=note)
        await automations.after_save(user, name, before, after)
        return after

    async def delete_item(item_id: str, user=U):
        uid = user["user_id"]
        doc = await get_item(item_id, user)
        await db[coll].delete_one({"id": item_id, "user_id": uid})
        for f, target in LINKS.items():
            if target == coll:
                for c in {v[0] for v in ENTITIES.values()}:
                    if c == "interactions" and f == "contact_id":
                        await db.interactions.delete_many({"user_id": uid, "contact_id": item_id})
                    else:
                        await db[c].update_many({"user_id": uid, f: item_id}, {"$set": {f: None}})
        if coll == "tasks":
            await db.tasks.update_many({"user_id": uid, "blocked_by": item_id}, {"$pull": {"blocked_by": item_id}})
        if coll == "habits":
            await db.habit_logs.delete_many({"user_id": uid, "habit_id": item_id})
        await log_activity(uid, name, item_id, "deleted", doc.get(tf, ""))
        return {"ok": True}

    for fn, suffix in ((list_items, "list"), (create_item, "create"), (get_item, "get"), (update_item, "update"), (delete_item, "delete")):
        fn.__name__ = f"{name}_{suffix}"
    api.add_api_route(f"/{name}", list_items, methods=["GET"])
    api.add_api_route(f"/{name}", create_item, methods=["POST"])
    api.add_api_route(f"/{name}/{{item_id}}", get_item, methods=["GET"])
    api.add_api_route(f"/{name}/{{item_id}}", update_item, methods=["PATCH"])
    api.add_api_route(f"/{name}/{{item_id}}", delete_item, methods=["DELETE"])


class BulkIn(Strict):
    ids: list[str]
    action: Literal["complete", "delete", "set_status", "schedule", "set_priority"]
    value: Optional[str] = None


@api.post("/tasks/bulk")
async def bulk_tasks(body: BulkIn, user=U):
    uid, n = user["user_id"], 0
    for tid in body.ids[:500]:
        t = await db.tasks.find_one({"id": tid, "user_id": uid}, {"_id": 0})
        if not t:
            continue
        if body.action == "delete":
            await db.tasks.delete_one({"id": tid, "user_id": uid})
            await db.tasks.update_many({"user_id": uid, "blocked_by": tid}, {"$pull": {"blocked_by": tid}})
            await log_activity(uid, "tasks", tid, "deleted", t["title"], note="Bulk action")
        else:
            data = {"complete": {"status": "done"}, "set_status": {"status": body.value}, "schedule": {"scheduled_date": body.value},
                    "set_priority": {"priority": int(body.value or 3)}}[body.action]
            if data.get("status") not in (None, "inbox", "todo", "in_progress", "waiting", "done"):
                raise HTTPException(400, "Invalid status")
            apply_task_status(data, t)
            await db.tasks.update_one({"id": tid, "user_id": uid}, {"$set": {**data, "updated_at": now_iso()}})
            after = await db.tasks.find_one({"id": tid, "user_id": uid}, {"_id": 0})
            await log_activity(uid, "tasks", tid, "updated", t["title"], diff={k: [t.get(k), v] for k, v in data.items()}, note="Bulk action")
            await automations.after_save(user, "tasks", t, after)
        n += 1
    return {"updated": n}


for _name in ENTITIES:
    register_crud(_name)


@api.get("/")
async def root():
    return {"service": "Founder OS API", "status": "ok"}


@api.get("/integrations")
async def integrations(user=U):
    st = lambda ok: "connected" if ok else "not_configured"
    return [
        {"key": "claude", "name": "Claude (AI Chief of Staff)", "status": st(llm.configured()), "detail": f"Anthropic API, model {llm.MODEL}. Reads only your Founder OS records." if llm.configured() else "Add ANTHROPIC_API_KEY on the server to switch on the Chief of Staff, summaries and drafts."},
        {"key": "email", "name": "Email delivery (password reset, week-ahead summary)", "status": st(mailer.configured()), "detail": f"Resend, sending from {os.environ.get('EMAIL_FROM')}. Emails go only to your own address." if mailer.configured() else "Add RESEND_API_KEY and EMAIL_FROM on the server. Until then, password reset emails can't be sent."},
        {"key": "google_login", "name": "Google sign-in", "status": st(google_enabled()), "detail": "Your own Google Cloud OAuth client." if google_enabled() else "Optional. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to show the Google button."},
        {"key": "weekly_cron", "name": "Sunday weekly-review draft", "status": "connected", "detail": f"Runs inside the app every Sunday at 18:00 ({APP_TZ.key})."},
        {"key": "csv", "name": "CSV transaction import", "status": "connected", "detail": "Manual upload; duplicates are skipped. Imported figures are not verified bank balances."},
        {"key": "documents", "name": "Document storage & extraction", "status": "connected", "detail": "Stored privately in your own database. PDF, DOCX, TXT, MD and CSV text extraction. No OCR for scanned files."},
        {"key": "google_calendar", "name": "Google Calendar sync", "status": "not_configured", "detail": "Coming next. Calendar is native until then."},
        {"key": "banking", "name": "Bank feeds", "status": "not_configured", "detail": "Use CSV import from your bank's statement export. Live feeds (TrueLayer) can come later."},
        {"key": "linkedin", "name": "LinkedIn publishing", "status": "not_configured", "detail": "Needs an approved LinkedIn app with w_member_social permission. Content is published manually until then; no scraping."},
    ]


@api.post("/integrations/email/test")
async def email_test(user=U):
    if not mailer.configured():
        raise HTTPException(400, "Email is not connected yet")
    try:
        await mailer.send(user["email"], "Founder OS test email", "Email delivery is working. You'll get password resets and your Sunday week-ahead summary here.",
                          mailer._wrap("Email is working", "<p>You'll get password resets and your Sunday week-ahead summary at this address.</p>"))
    except mailer.EmailError as e:
        raise HTTPException(502, str(e))
    return {"ok": True, "sent_to": user["email"]}


@api.get("/health")
async def health():
    await db.command("ping")
    return {"ok": True}


app.include_router(workspace.router)
app.include_router(intel.router)
app.include_router(ai.router)
app.include_router(api)

_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.cookies:
        origin = request.headers.get("origin")
        if origin:
            host = request.headers.get("x-forwarded-host") or request.headers.get("host")
            if urlparse(origin).netloc != host and origin not in _origins and "*" not in _origins:
                return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
    return await call_next(request)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origin_regex=".*" if "*" in _origins else None,
                   allow_origins=[] if "*" in _origins else _origins, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.doc_chunks.create_index([("user_id", 1), ("doc_id", 1)])
    await db.documents.create_index([("user_id", 1), ("sha256", 1)])
    await db.cron_runs.create_index("run_id", unique=True)
    await db.file_blobs.create_index("path", unique=True)
    await db.password_reset_tokens.create_index("expires_at")
    await db.login_attempts.create_index("identifier")
    await db.user_sessions.create_index("session_token")
    await db.habit_logs.create_index([("user_id", 1), ("habit_id", 1), ("date", 1)], unique=True)
    await db.checkins.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.automation_runs.create_index([("user_id", 1), ("dedupe_key", 1)])
    for c in {v[0] for v in ENTITIES.values()} | {"activity", "ai_messages", "ai_sessions"}:
        await db[c].create_index([("user_id", 1), ("id", 1)])
    # Owner account: created once from ADMIN_EMAIL/ADMIN_PASSWORD. After that the password is yours to change in the app;
    # restarts no longer reset it back to the environment value.
    email, pw = os.environ.get("ADMIN_EMAIL", "").lower(), os.environ.get("ADMIN_PASSWORD", "")
    if email:
        existing = await db.users.find_one({"email": email})
        if not existing and pw:
            await db.users.insert_one(new_user_doc(email, "Founder", role="admin", password_hash=hash_password(pw), auth_provider="password"))
        elif existing and existing.get("role") != "admin":
            await db.users.update_one({"email": email}, {"$set": {"role": "admin"}})
    if os.environ.get("DISABLE_SCHEDULER", "").lower() != "true":
        scheduler.add_job(workspace.scheduled_weekly, CronTrigger(day_of_week="sun", hour=18, minute=0, timezone=APP_TZ),
                          id="weekly-review", replace_existing=True, misfire_grace_time=3 * 3600, coalesce=True)
        scheduler.start()
        logger.info("Scheduler on: weekly review every Sunday 18:00 %s", APP_TZ.key)


scheduler = AsyncIOScheduler()


@app.on_event("shutdown")
async def shutdown():
    if scheduler.running:
        scheduler.shutdown(wait=False)
    client.close()


# ---------- the React app ----------
# In production the built frontend is served by this same server, so the app and API share one address.
STATIC_DIR = Path(os.environ.get("STATIC_DIR", Path(__file__).parent.parent / "frontend" / "build"))
if (STATIC_DIR / "index.html").exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (STATIC_DIR / full_path).resolve()
        if full_path and f.is_file() and STATIC_DIR.resolve() in f.parents:
            cache = "public, max-age=31536000, immutable" if full_path.startswith("static/") else "no-cache"
            return FileResponse(f, headers={"Cache-Control": cache})
        return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})
