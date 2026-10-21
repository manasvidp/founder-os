# Founder OS — PRD

## Original problem statement (user's words, condensed only where very long)
Phase 1: "Build Founder OS — a premium, unified operating system for a founder's business and personal life", built in vertical slices (not a static mockup): command centre, life/business strategy, execution, personal life, business operations, finance, CRM, content, knowledge/documents, AI Chief of Staff, automations, security. Audit and architecture first; every feature must work end-to-end on real persisted records; label anything partial/prototype/dependent honestly; no fake data disguised as real.

Phase 2: "FOUNDER OS — COMPLETE THE PRODUCT, SECURITY AUDIT AND PRODUCTION RELEASE". Extend (not restart) the app; independent audit; security first (authz/ownership, sessions, password reset, rate limits, CSRF/XSS, uploads, mass assignment, CORS, headers, logging, export/delete, audit logs); complete Business Workspace, Content Studio, Knowledge Library and an honest integrations framework; make all modules interconnect; repeatable automated + E2E tests; release only if gates pass.
- "Sunday Review Draft: Create a pre-filled weekly review arriving every Sunday evening with a proposed plan for next week."
- "Document Knowledge Base: Add document uploads with summaries and AI answers that reference exact source pages."

## User choices
- Sign-in: Google sign-in + email/password (JWT, httpOnly cookies)
- AI: Claude (Emergent universal key)
- Uploads: cloud object storage now
- Design: premium CRM-style founder command centre (design_guidelines.json)

## Architecture
- FastAPI (`backend/`): server.py (auth, CRUD, routes), core.py, models.py (strict pydantic, extra=forbid), automations.py, intel.py (context/search), ai.py (Claude Chief of Staff, SSE streaming, record citations incl. `[doc:id p.N]`), workspace.py (business, content AI drafts, knowledge library/object storage, weekly draft + cron webhook)
- Scheduler: in-app (APScheduler) every Sunday 18:00 Europe/London; optional secret-protected webhook at /api/cron/weekly-review
- React (`frontend/`): Shell, CommandMenu, QuickCapture; pages Home, Tasks, Projects, Plan, Calendar, People, Finance, Personal, Notes, Reviews, Chief, Business, Content, Knowledge, Settings, Privacy, Login, Onboarding
- MongoDB, every record scoped by user_id server-side

## Implemented
- 2026-10-?? (phase 1): auth, onboarding, Command Centre, quick capture, tasks/recurrence, goals↔projects, calendar agenda, CRM with follow-up automation, finance, personal, notes, weekly/daily reviews, AI Chief of Staff with record citations
- 2026-10-21 (phase 2):
  - Business Workspace (profile, products, revenue streams, KPIs, operations, team, risks, decisions, opportunities, meetings → tasks)
  - Content Studio (status board, brand voice/pillars, AI draft preview → apply/discard, repurpose, published requires URL, self-reported metrics)
  - Knowledge Library (secure uploads via object storage, validation, extraction with page/section labels, status/retry, summaries, links, search, downloads with safe headers, soft delete; AI answers cite exact pages)
  - Sunday weekly review draft (cron + manual "Draft weekly review"), drafts are editable before saving
  - Security: ownership checks, strict input models, password change/reset flow, security headers, rate limits, audit log, export/delete
  - Home widget show/hide/reorder/restore; privacy & data-handling page
  - AI replies are saved even if the user closes the tab mid-answer (background generation)
  - Tests: testing agent iterations 2–4 + backend pytest suite (47 passing); deployment pre-check passed

## Known limits / honest status
- Password-reset emails: no email provider configured → reset email delivery NOT live
- External integrations (Google Calendar, email, LinkedIn, bank feeds): framework/status only, NOT connected
- Production deploy: not yet performed

## Backlog
- P0: deploy after user confirmation; post-deploy smoke test
- P1: email provider for reset/notifications; Google Calendar sync
- P2: bank feed import provider; dashboard drag-drop; content performance import
