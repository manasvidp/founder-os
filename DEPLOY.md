# Putting Founder OS live

This takes about an hour the first time. You'll create five accounts, copy a few keys into Railway, and point your domain at it. Nothing here needs a terminal.

| Piece | What it does | Cost |
|---|---|---|
| GitHub | Holds the code. Railway redeploys whenever it changes | Free |
| MongoDB Atlas | The database (your records and uploaded documents) | Free tier (512 MB) |
| Railway | Runs the app 24/7 | Hobby plan $5/month, which includes $5 of usage. Expect roughly $5–10/month |
| Anthropic | Powers the AI Chief of Staff, summaries and drafts | Pay as you go. Set a monthly limit |
| Resend | Sends password-reset and Sunday emails | Free (3,000 emails/month) |
| Domain | `app.yourdomain.com` | About £10/year |

Keep a private note open as you go. You'll collect seven values and paste them into Railway in step 4.

---

## Before you start: one security fix

Emergent's test reports and test files had your old owner password written in them in plain text. I've removed it from this code. If that password is used anywhere else, change it there. Pick a **new** password for `ADMIN_PASSWORD` below.

---

## Step 1: Put the code on GitHub

1. Go to github.com → **+** (top right) → **New repository**.
2. Name: `founder-os`. Choose **Private**. Don't tick any "initialize" boxes. Click **Create repository**.
3. Either reply to Claude with "repo created" and it will push the code for you, **or** on the new repo page click **uploading an existing file**, drag in everything from the unzipped `founder-os` folder (not the folder itself, its contents), and click **Commit changes**.

## Step 2: Database (MongoDB Atlas)

1. Go to mongodb.com/cloud/atlas/register and sign up (Google sign-in is fine).
2. When asked to deploy a cluster, choose the **Free** tier. Provider **AWS**, region **London (eu-west-2)**. Click **Create**.
3. **Create a database user.** Username `founderos`. Click **Autogenerate secure password** and copy it into your note. Click **Create user**.
4. **Network access.** In the left menu, open **Network Access** → **Add IP address** → **Allow access from anywhere** (`0.0.0.0/0`) → **Confirm**. Railway's servers don't have fixed addresses, so this is needed. Your password still protects the database.
5. Back on the cluster: **Connect** → **Drivers**. Copy the connection string. It looks like
   `mongodb+srv://founderos:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority...`
6. In your note, replace `<db_password>` with the password from step 3. This whole line is your **MONGO_URL**.

## Step 3: AI key (Anthropic)

1. Go to console.anthropic.com and sign up.
2. **Billing** → add a card and a small amount of credit (£10 lasts a long time for one person).
3. **Limits** → set a monthly spend limit you're comfortable with.
4. **API keys** → **Create key** → name it `founder-os` → copy it (starts `sk-ant-`). This is **ANTHROPIC_API_KEY**. You only see it once.

## Step 4: Run it (Railway)

1. Go to railway.com → **Login** → **Login with GitHub**. Pick the **Hobby** plan.
2. **New Project** → **Deploy from GitHub repo** → allow access to `founder-os` → select it.
   Railway finds the `Dockerfile` and starts building. The first build fails because the variables aren't set yet. That's expected.
3. Click the service → **Settings** → **Networking** → **Generate Domain**. You get something like `founder-os-production.up.railway.app`. Copy it.
4. Click **Variables** → **Raw Editor**, paste this, and fill it in:

   ```
   MONGO_URL=<from step 2>
   DB_NAME=founder_os
   JWT_SECRET=<a long random string. Use a password generator, 64 characters>
   APP_URL=https://founder-os-production.up.railway.app
   ADMIN_EMAIL=<your email>
   ADMIN_PASSWORD=<a new strong password>
   ANTHROPIC_API_KEY=<from step 3>
   APP_TIMEZONE=Europe/London
   ALLOW_SIGNUPS=false
   ```

   `APP_URL` is `https://` + the domain from step 3, with **no** slash at the end.
5. Click **Update Variables** → **Deploy**. Wait for the deployment to show **Active** (about 3–5 minutes).
6. Check it: open `https://<your railway domain>/api/health` in a browser. You should see `{"ok":true}`.
7. Open `https://<your railway domain>` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Go to **Settings** → **Password** and change it to something only you know. Restarts won't reset it any more.

You're live. The next steps add your own domain and email.

## Step 5: Your domain

1. Buy a domain at Cloudflare (dash.cloudflare.com → **Domain Registration**) or Namecheap. You'll use the subdomain `app.` for Founder OS, which keeps the main domain free for your site or The Ledger.
2. In Railway: service → **Settings** → **Networking** → **Custom Domain** → type `app.yourdomain.com` → **Add**. Railway shows you a **CNAME** record (and sometimes a **TXT** record to prove ownership).
3. At your registrar's **DNS** page, add exactly those records.
   On Cloudflare, set the CNAME's proxy to **DNS only** (grey cloud) so Railway can issue the HTTPS certificate.
4. Wait until Railway shows a green tick next to the domain (often 5–30 minutes).
5. Railway → **Variables** → change `APP_URL` to `https://app.yourdomain.com` → it redeploys automatically.

## Step 6: Email (Resend)

1. Go to resend.com and sign up.
2. **Domains** → **Add domain** → enter `yourdomain.com` → region **Ireland (eu-west-1)**.
3. Resend lists a few DNS records (an MX, a TXT for SPF, and a TXT for DKIM). Add each one at your registrar exactly as shown. Then click **Verify DNS records** in Resend. It can take up to an hour to turn green.
4. **API Keys** → **Create API key** → name `founder-os`, permission **Sending access**, domain `yourdomain.com` → copy it (starts `re_`).
5. Railway → **Variables** → add:
   ```
   RESEND_API_KEY=re_...
   EMAIL_FROM=Founder OS <noreply@yourdomain.com>
   ```
6. After it redeploys: Founder OS → **Settings** → **Integrations** → **Send me a test email**. If it arrives, password reset and the Sunday email are both on.

The Sunday "week ahead" email can be switched off in **Settings** → **Automations**.

## Step 7 (optional): "Continue with Google"

Skip this if email and password is fine for you. The Google button stays hidden until this is set up.

1. Go to console.cloud.google.com → project picker (top left) → **New project** → name `Founder OS` → **Create**.
2. Search for **Google Auth Platform** (or **OAuth consent screen**) → **Get started**.
   App name `Founder OS`, support email = yours, audience **External**, contact email = yours → **Create**.
3. **Audience** → under **Test users** add your own Google address. In testing mode, only listed test users can sign in, which suits a private app.
4. **Clients** → **Create client** → type **Web application** → name `Founder OS`.
   Under **Authorized redirect URIs** add `https://app.yourdomain.com/api/auth/google/callback` → **Create**.
5. Copy the **Client ID** and **Client secret** into Railway → **Variables**:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
   The Google button appears on the sign-in page after the redeploy. Google sign-in with your `ADMIN_EMAIL` address logs into the same owner account.

---

## Living with it

- **Updates.** Any change pushed to the `main` branch on GitHub redeploys automatically in a few minutes.
- **Backups.** The free Atlas tier has no automatic backups. Use **Settings** → **Export all my data** now and then, or upgrade Atlas later.
- **The Sunday job** runs inside the app at 18:00 UK time and follows the clocks changing. It runs once per Sunday even if the app restarts.
- **Costs.** Check Railway → **Usage** after the first week. Set a **usage limit** in Railway's account settings if you want a hard cap.

## If something goes wrong

| What you see | Usually means |
|---|---|
| Deploy fails at "healthcheck" | `MONGO_URL` is wrong, or Atlas **Network Access** doesn't allow `0.0.0.0/0`. Check Railway → **Deployments** → **View logs**. |
| Signing in sends you straight back to the login page | `APP_URL` doesn't exactly match the address in your browser (check https, `app.`, and no trailing slash). |
| AI says "not configured" | `ANTHROPIC_API_KEY` is missing, or there's no credit on the Anthropic account. |
| Test email fails | The Resend domain isn't verified yet, or `EMAIL_FROM` uses a different domain from the one you verified. |
| Emails land in spam | One of Resend's DNS records is missing. Re-check them in Resend → **Domains**. |
| Google says `redirect_uri_mismatch` | The redirect URI in Google Cloud must be exactly `https://app.yourdomain.com/api/auth/google/callback`. |
