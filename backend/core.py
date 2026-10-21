import os
import uuid
from datetime import date, datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import bcrypt
import jwt
from fastapi import Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

if os.environ["MONGO_URL"].startswith("mongomock://"):  # local tests only — in-memory stand-in for MongoDB
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
else:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ.get("DB_NAME", "founder_os")]
JWT_ALG = "HS256"
ACCESS_MIN = 60

# The public address of the app, e.g. https://app.yourdomain.com — used for email links and Google sign-in.
APP_URL = os.environ.get("APP_URL", "").strip().rstrip("/")
# "Today" and the Sunday schedule follow this timezone, not the server's (servers run on UTC).
APP_TZ = ZoneInfo(os.environ.get("APP_TIMEZONE", "Europe/London"))
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() != "false"
COOKIE_SAMESITE = os.environ.get("COOKIE_SAMESITE", "lax")


def local_today() -> date:
    return datetime.now(APP_TZ).date()


def cookie_opts():
    return {"httponly": True, "secure": COOKIE_SECURE, "samesite": COOKIE_SAMESITE, "path": "/"}


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


def new_id():
    return str(uuid.uuid4())


def as_aware(dt):
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def _secret():
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access", "exp": now() + timedelta(minutes=ACCESS_MIN)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh", "exp": now() + timedelta(days=7)}
    return jwt.encode(payload, _secret(), algorithm=JWT_ALG)


def decode_token(token: str, kind: str):
    try:
        p = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
        return p["sub"] if p.get("type") == kind else None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    bearer = auth[7:] if auth.startswith("Bearer ") else None
    user_id = None
    for t in (request.cookies.get("access_token"), bearer):
        if t and (uid := decode_token(t, "access")):
            user_id = uid
            break
    if not user_id:
        for st in (request.cookies.get("session_token"), bearer):
            if not st:
                continue
            s = await db.user_sessions.find_one({"session_token": st}, {"_id": 0})
            if s and as_aware(s["expires_at"]) > now():
                user_id = s["user_id"]
                break
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def public_user(u: dict) -> dict:
    return {k: v for k, v in u.items() if k not in ("_id", "password_hash")}


async def log_activity(uid, entity, entity_id, action, title="", diff=None, note=None):
    await db.activity.insert_one({
        "id": new_id(), "user_id": uid, "entity": entity, "entity_id": entity_id, "action": action,
        "title": title, "diff": diff or {}, "note": note, "at": now_iso(),
    })
