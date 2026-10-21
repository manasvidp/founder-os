"""Transactional email via Resend (resend.com).

Set RESEND_API_KEY and EMAIL_FROM (e.g. "Founder OS <noreply@yourdomain.com>").
EMAIL_FROM must use a domain you have verified in Resend.
Without a key, configured() is False and callers say so honestly instead of pretending.
"""
import html
import logging
import os

import httpx

log = logging.getLogger("mailer")


def configured() -> bool:
    return bool(os.environ.get("RESEND_API_KEY") and os.environ.get("EMAIL_FROM"))


class EmailError(Exception):
    pass


async def send(to: str, subject: str, text: str, html_body: str | None = None):
    if not configured():
        raise EmailError("Email is not connected: add RESEND_API_KEY and EMAIL_FROM to the server environment")
    payload = {"from": os.environ["EMAIL_FROM"], "to": [to], "subject": subject, "text": text}
    if html_body:
        payload["html"] = html_body
    async with httpx.AsyncClient(timeout=20) as hc:
        r = await hc.post(os.environ.get("RESEND_API_URL", "https://api.resend.com") + "/emails", json=payload,
                          headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
    if r.status_code >= 300:
        log.error("Resend rejected email (%s): %s", r.status_code, r.text[:300])
        raise EmailError(f"The email provider rejected the message ({r.status_code})")
    return r.json().get("id")


def _wrap(title: str, body_html: str, button: tuple[str, str] | None = None) -> str:
    btn = ""
    if button:
        label, url = button
        btn = (f'<p style="margin:28px 0"><a href="{html.escape(url)}" style="background:#111827;color:#fff;'
               f'padding:11px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">{html.escape(label)}</a></p>')
    return f"""<!doctype html><html><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:14px;letter-spacing:.02em;margin-bottom:20px">Founder OS</div>
<div style="background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 14px">{html.escape(title)}</h1>
{body_html}{btn}
</div>
<p style="font-size:12px;color:#78716c;margin-top:18px">You're receiving this because you have a Founder OS account. Sent only to you.</p>
</div></body></html>"""


async def send_password_reset(to: str, name: str, link: str):
    text = (f"Hi {name},\n\nSomeone (hopefully you) asked to reset your Founder OS password.\n\n"
            f"Choose a new password here (the link works for 1 hour, once):\n{link}\n\n"
            "If you didn't ask for this, ignore this email. Your password stays the same.")
    body = (f"<p>Hi {html.escape(name)},</p><p>Someone (hopefully you) asked to reset your Founder OS password. "
            "The link below works once, for the next hour.</p>"
            "<p style='font-size:13px;color:#57534e'>If you didn't ask for this, ignore this email. Your password stays the same.</p>")
    return await send(to, "Reset your Founder OS password", text, _wrap("Reset your password", body, ("Choose a new password", link)))


async def send_week_ahead(to: str, name: str, review: dict, app_url: str):
    plan = [ln[2:] for ln in (review.get("next_focus") or "").splitlines() if ln.startswith("- ")]
    wins = [ln[2:] for ln in (review.get("wins") or "").splitlines() if ln.startswith("- ")]
    st = review.get("stats") or {}
    done = st.get("tasks_completed", 0)
    text = [f"Hi {name},", "", f"Your weekly review draft is ready. You completed {done} task(s) this week.", ""]
    if wins:
        text += ["This week:"] + [f"  - {w}" for w in wins[:5]] + [""]
    text += ["Proposed for next week:"] + [f"  - {p}" for p in plan] + ["", f"Review and edit it: {app_url}/reviews?tab=weekly"]
    li = lambda items: "<ul style='padding-left:18px;margin:6px 0 16px'>" + "".join(f"<li style='margin:4px 0'>{html.escape(i)}</li>" for i in items) + "</ul>"
    body = f"<p>Hi {html.escape(name)},</p><p>Your weekly review draft is ready. You completed <b>{done}</b> task(s) this week.</p>"
    if wins:
        body += "<div style='font-weight:600;margin-top:18px'>This week</div>" + li(wins[:5])
    body += "<div style='font-weight:600;margin-top:18px'>Proposed for next week</div>" + li(plan or ["Nothing scheduled yet. A good moment to plan."])
    return await send(to, "Your week ahead", "\n".join(text),
                      _wrap("Your week ahead", body, ("Open my weekly review", f"{app_url}/reviews?tab=weekly") if app_url else None))
