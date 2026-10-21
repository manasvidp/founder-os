# Founder OS

A private operating system for a founder's business and personal life: plan, tasks, projects, calendar, people, finance, content, a knowledge library and an AI Chief of Staff grounded in your own records.

**To put it live, follow [DEPLOY.md](DEPLOY.md).**

## How it's built

- **Backend:** FastAPI + MongoDB (`backend/`). It also serves the built frontend, so the whole app runs as one service on one address.
- **Frontend:** React + Tailwind + shadcn/ui (`frontend/`).
- **AI:** Anthropic Claude via the official SDK (`backend/llm.py`).
- **Email:** Resend (`backend/mailer.py`). Used for password resets and the optional Sunday "week ahead" summary, sent only to the account owner.
- **Files:** stored in MongoDB (`file_blobs` collection, 10 MB per file). No separate storage service.
- **Scheduler:** in-app (APScheduler). Prepares the weekly review draft every Sunday at 18:00 `APP_TIMEZONE` (default Europe/London).
- **Sign-in:** email and password, plus optional Google sign-in with your own Google Cloud OAuth client.

All settings are environment variables. See [.env.example](.env.example).

## Running it on your own computer

You need Python 3.12+, Node 22 and a MongoDB connection string (Atlas free tier works).

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp ../.env.example .env   # fill in MONGO_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD; add COOKIE_SECURE=false and APP_URL=http://localhost:3000
uvicorn server:app --port 8001 --reload

# frontend (second terminal). /api calls are forwarded to port 8001
cd frontend
corepack enable && yarn install
yarn start
```

## Tests

The tests call a running backend:

```bash
cd backend
REACT_APP_BACKEND_URL=http://localhost:8001 ADMIN_EMAIL=... ADMIN_PASSWORD=... WEBHOOK_CRON_SECRET=... pytest -n 0 tests
```

Three tests check the wording of real AI replies, so they need a real `ANTHROPIC_API_KEY` on the server.
