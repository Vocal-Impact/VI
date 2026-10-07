# Hosting the Vocal Impact App

A step-by-step guide to putting the app online for free. Allow about an hour the first time.

| Piece                           | Service                                          | Plan           | Cost                             |
| ------------------------------- | ------------------------------------------------ | -------------- | -------------------------------- |
| App (website + API + daily job) | [Vercel](https://vercel.com)                     | Hobby          | Free                             |
| Database (PostgreSQL)           | [Neon](https://neon.tech)                        | Free           | Free                             |
| Sign-in                         | Google Cloud (OAuth)                             | —              | Free, no card                    |
| Email                           | [Brevo](https://brevo.com)                       | Free (300/day) | Free                             |
| Road distances (optional)       | [OpenRouteService](https://openrouteservice.org) | Free           | Free                             |
| Landmark lookup (optional)      | Google Maps Geocoding API                        | Pay-as-you-go  | Free allowance; **needs a card** |
| Code + CI + backups             | GitHub                                           | Free           | Free                             |

> **Account ownership:** create every account with a **committee IIT Google account**, and add at least one more committee member as an owner of each service, so the app never depends on one person (see [HANDOVER.md](HANDOVER.md)).

---

## Before you start

- [ ] All your changes are committed and pushed: `git push origin main`
- [ ] The GitHub repository is **private**
- [ ] You have your local `.env` open. You'll copy several values from it, especially `DATA_ENCRYPTION_KEY`
- [ ] A password manager entry ready for the secrets you're about to create

---

## Step 1 — Database on Neon

1. Sign up at [neon.tech](https://neon.tech) and create a project:
   - **Name:** `vocal-impact`
   - **Region:** **AWS Asia Pacific (Singapore)**, the closest to Sri Lanka
   - **Postgres version:** the default is fine
2. Open **Dashboard → Connect** and copy two connection strings:
   - **Pooled connection: ON** → this is `DATABASE_URL` (the host contains `-pooler`)
   - **Pooled connection: OFF** → this is `DIRECT_URL` (used for migrations)
3. Save both in the password manager.

You don't create any tables yourself. The first deploy creates them.

---

## Step 2 — Google sign-in

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project called `Vocal Impact`. No billing account is needed.
2. Go to **APIs & Services → OAuth consent screen**:
   - **User type:** **Internal** if IIT's Google Workspace allows it (only IIT accounts can sign in), otherwise **External**.
   - Fill in the app name, support email and developer email. The default scopes (email, profile) are enough.
   - If you chose **External**, click **Publish app** when you're done. In "Testing" mode only listed test users can sign in, and they're signed out every 7 days.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - **Application type:** Web application
   - **Authorised redirect URIs:** leave this for now. You'll add it in Step 5 once you know the app's address.
4. Copy the **Client ID** and **Client secret**.

---

## Step 3 — Email with Brevo

1. In Brevo, go to **Senders, domains & dedicated IPs → Senders → Add a sender**. Use the committee email that emails should come from, then click the verification link Brevo sends you.
2. Go to **SMTP & API → API keys → Generate a new API key**. It starts with `xkeysib-`. Copy it.
3. Go to **Security → Authorised IPs** (account menu, top right) and **deactivate IP blocking**. Vercel sends from changing addresses, so with blocking on, Brevo rejects the app's emails with _"unrecognised IP address"_.
4. **Optional, for the email logo:** once the app is live it serves its own logo, so you can skip this.

---

## Step 4 — Create the secrets

Generate two new random values. Run each line in a terminal, or use the password manager's generator, and save them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # BETTER_AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))" # CRON_SECRET
```

For **`DATA_ENCRYPTION_KEY`**, use the **exact value from your local `.env`** if you'll copy your local data across (Step 7). Otherwise generate a fresh one the same way as `BETTER_AUTH_SECRET`.

> ⚠️ `DATA_ENCRYPTION_KEY` decrypts WhatsApp numbers, locations and dietary preferences. **Store it in the password manager and never change it** once the database has data. If it's lost, that data is lost.

---

## Step 5 — Deploy on Vercel

1. Sign in to [vercel.com](https://vercel.com) **with GitHub**. Click **Add New → Project** and import the repository.
2. **Framework preset:** Next.js (detected automatically). Leave the build settings as they are; the project's `vercel-build` script is used.
3. Open **Environment Variables** and add these for **Production**:

   | Variable               | Value                                                                                             |
   | ---------------------- | ------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`         | Neon **pooled** string (Step 1)                                                                   |
   | `DIRECT_URL`           | Neon **direct** string (Step 1)                                                                   |
   | `BETTER_AUTH_SECRET`   | from Step 4                                                                                       |
   | `BETTER_AUTH_URL`      | `https://<project-name>.vercel.app`, the address Vercel shows for the project (no trailing slash) |
   | `GOOGLE_CLIENT_ID`     | from Step 2                                                                                       |
   | `GOOGLE_CLIENT_SECRET` | from Step 2                                                                                       |
   | `DATA_ENCRYPTION_KEY`  | from Step 4                                                                                       |
   | `CRON_SECRET`          | from Step 4                                                                                       |
   | `EMAIL_TRANSPORT`      | `brevo`                                                                                           |
   | `BREVO_API_KEY`        | from Step 3                                                                                       |
   | `EMAIL_FROM`           | `Vocal Impact <the-verified-sender@...>`                                                          |
   | `NOMINATIM_USER_AGENT` | `VocalImpactApp/1.0 (contact: <committee email>)`                                                 |
   | `ALLOWED_EMAIL_DOMAIN` | `iit.ac.lk`                                                                                       |
   | `ORS_API_KEY`          | _optional:_ OpenRouteService key, for real road distances in "Lifts home"                         |

| `FEATURE_LIFTS_HOME` | `false` while Lifts home is still experimental (hides it; set to `true` to switch it on) |
| `GOOGLE_MAPS_API_KEY` | _optional:_ Google Geocoding key (needs billing; see Step 9) |

**Do not add `ENABLE_PASSWORD_LOGIN`.** The app refuses to start with it in production.

4. Click **Deploy**. The build:
   - creates and updates the database tables (`prisma migrate deploy`)
   - encrypts any unencrypted data (`npm run db:encrypt`)
   - builds the app

   `vercel.json` also schedules the **daily job** (birthday emails, location lookups, the 1 September year-of-study move). It runs once a day, between about 07:00 and 08:00 Sri Lanka time.

5. **Node version:** the project asks for Node 24 (`"engines"` in `package.json`). In **Project → Settings → General → Node.js Version**, choose **24.x** so the two match.

6. **Back in Google Cloud**, open the OAuth client from Step 2 and add:
   - **Authorised redirect URI:** `https://<project-name>.vercel.app/api/auth/callback/google`

   Save. It can take a few minutes to take effect.

7. Check it's alive: open `https://<project-name>.vercel.app/api/health`. It should show `{"status":"ok"}`. That means the app and the database are connected.

---

## Step 6 — Make yourself the first admin

Skip this if you copy your local database in Step 7 (your admin login comes with it).

Run this on your laptop, pointing the script at **Neon's direct string**.

**PowerShell:**

```powershell
$env:DATABASE_URL="<Neon DIRECT_URL>"; npm run db:seed-admin -- --email your.name@iit.ac.lk --name "Your Name"
```

**Git Bash:**

```bash
DATABASE_URL="<Neon DIRECT_URL>" npm run db:seed-admin -- --email your.name@iit.ac.lk --name "Your Name"
```

Then open the app, click **Sign in with Google** with that IIT account, and you're in as admin.

---

## Step 7 — Bring your members across (choose one)

**Option A: re-enter or re-import (recommended while there are only a few members).**

- Add people with **Members → Add member**, or
- Upload the Google Form CSV with **Members → Import → Registration form**. Landmarks are located automatically after the import.

**Option B: copy your local database with DBeaver.** This keeps everything exactly as it is locally.

1. In Vercel, `DATA_ENCRYPTION_KEY` **must be the same as your local `.env`**. Otherwise the copied phone numbers and locations can't be read.
2. Deploy first (Step 5), so the tables already exist in Neon.
3. In DBeaver, add a connection to Neon using the **direct** string, and keep your local connection (`localhost:5433`, database `vocal_impact`, user and password `postgres`). Start the local database first with `npm run db:local`.
4. Select the local tables, right-click → **Export Data → Database table(s)**, and choose the matching Neon tables as the target. Copy them in this order so links between tables resolve:
   1. `member`
   2. `user`
   3. `account`
   4. `member_location`
   5. `practice`
   6. `practice_rsvp`
   7. `attendance`
   8. `whatsapp_group`
   9. `group_invite`
   10. `import_batch`
   11. `email_log`
   12. `setting`
   13. `audit_log`
   14. `geocode_cache`

   **Do not copy:**
   - `_prisma_migrations`: Neon already has its own
   - `session`, `verification`, `cron_run`: these are temporary

5. Your local test login `admin@example.com` is copied too. That's harmless, because password login is switched off in production. Delete it under **Access & roles** if you prefer.

---

## Step 8 — Set up the app

Signed in as admin:

- [ ] **Settings → General:** set the **practice venue**. Paste coordinates from Google Maps by right-clicking the venue and clicking the numbers.
- [ ] **Access & roles:** add the committee and make at least **two** people Admin.
- [ ] **Access & roles:** tick **Birthday emails** for whoever should get reminders.
- [ ] **WhatsApp:** add the group invite links and their voice parts.
- [ ] **Settings → System:**
  - [ ] click **Send me a test email**, and check it arrives with the logo
  - [ ] check the **Years of study** card shows the right academic year
- [ ] **Practices:** schedule the next practice and check members can see it.

---

## Step 9 — Optional extras

**Real road distances for "Lifts home":**

1. Create a free account at openrouteservice.org and copy the API key from the dashboard.
2. In Vercel, set `ORS_API_KEY` and redeploy.

**Google Maps for landmarks.** OpenStreetMap misses some local landmarks.

1. In Google Cloud, go to **Billing** and add a card.
2. Set a **budget alert of $1** under **Billing → Budgets & alerts**.
3. Enable the **Geocoding API**, then create an API key under **Credentials**.
4. Restrict the key to the **Geocoding API**.
5. In Vercel, set `GOOGLE_MAPS_API_KEY` and redeploy.

The monthly free allowance covers a choir many times over.

**Weekly encrypted database backups (GitHub Actions):**

1. Go to GitHub → **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `BACKUP_DATABASE_URL`: the Neon **direct** string
   - `BACKUP_PASSPHRASE`: a long random passphrase. Store it in the password manager.
2. Go to **Actions → Weekly database backup → Run workflow** to test it. Backups are kept for 90 days as downloadable artifacts.

**A custom domain** (e.g. `vocalimpact.example.com`):

1. In Vercel, open **Settings → Domains**.
2. **Update both:**
   - `BETTER_AUTH_URL` in Vercel
   - the Google redirect URI

---

## After launch — making changes

1. Work and test **locally** (`npm run db:local`, `npm run dev`, `npm test`).
2. `git push origin main`. Vercel redeploys in about 2 minutes and applies any database changes automatically.
3. CI runs on every push (lint, type check, tests, build). A red ❌ means look before relying on that version.
4. **Something broke?** Go to Vercel → **Deployments**, open the last good one, and use **⋯ → Promote to Production** to roll back instantly. A rollback doesn't undo database migrations, so avoid deleting columns in a hurry.
5. **Dependabot** opens pull requests for package updates. Merge them one at a time. If one shows a merge conflict, comment `@dependabot rebase` on it.

Avoid Vercel **preview deployments** for now. They would use the live database, and Google sign-in doesn't work on their addresses. Test locally instead.

---

## Troubleshooting

| Symptom                                                                    | Likely cause / fix                                                                                                                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build fails: _"Invalid environment configuration"_                         | A variable is missing or malformed; the log names it. Common ones: `DATA_ENCRYPTION_KEY` must be 32 bytes base64; `BETTER_AUTH_SECRET` must be at least 32 characters.    |
| Build fails during `prisma migrate deploy`                                 | `DIRECT_URL` is missing or wrong (it must be the **non-pooled** Neon string).                                                                                             |
| Google says **redirect_uri_mismatch**                                      | The redirect URI in Google Cloud must exactly match `BETTER_AUTH_URL` + `/api/auth/callback/google`.                                                                      |
| Signed in with Google but get "not allowed"                                | That email isn't linked to an access level yet. Add it under **Access & roles** (or run Step 6 for the first admin). Members can sign in only if they're current members. |
| Email fails: _401 … unrecognised IP address_                               | Brevo's **Authorised IPs** blocking is on. In Brevo, go to **Security → Authorised IPs** and deactivate blocking (or add the IP it names, for local testing only).        |
| Test email fails: _Key not found_ / 401                                    | `BREVO_API_KEY` is wrong. It must be the `xkeysib-…` API key, not an SMTP key.                                                                                            |
| Test email fails: _sender not valid_                                       | `EMAIL_FROM` must be a sender verified in Brevo.                                                                                                                          |
| Phone numbers / locations show as `v1:…` or pages error after copying data | `DATA_ENCRYPTION_KEY` in Vercel differs from the key that encrypted the data. Put the original key back.                                                                  |
| Daily job doesn't run                                                      | Check **Settings → System → Daily job runs** and Vercel → **Cron Jobs**. `CRON_SECRET` must be set in Vercel.                                                             |
| First page load is slow after a quiet period                               | Normal: Neon's free database pauses when idle and takes a second or two to wake.                                                                                          |

---

## Where secrets live (for the handover)

| Secret                                       | Where it's used              | Can it be changed?                                       |
| -------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `DATA_ENCRYPTION_KEY`                        | Vercel                       | **Never.** Data becomes unreadable.                      |
| `BETTER_AUTH_SECRET`                         | Vercel                       | Yes; everyone is signed out.                             |
| `CRON_SECRET`                                | Vercel                       | Yes.                                                     |
| `BREVO_API_KEY`                              | Vercel                       | Yes; create a new one in Brevo, then delete the old one. |
| `GOOGLE_CLIENT_SECRET`                       | Vercel                       | Yes; create a new secret in Google Cloud.                |
| Neon password (`DATABASE_URL`, `DIRECT_URL`) | Vercel, GitHub backup secret | Yes; reset it in Neon, then update both places.          |
| `BACKUP_PASSPHRASE`                          | GitHub secret                | Keep the old one until old backups expire (90 days).     |
