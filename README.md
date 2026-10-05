<p align="center">
  <img src="public/brand/logo-primary-black.png" alt="Vocal Impact" width="320">
</p>

<p align="center"><b>Member, attendance, WhatsApp-invite, birthday and carpool management for the Vocal Impact choir (IIT).</b><br>
Built only with open-source tools and free hosting tiers.</p>

---

## What it does

| Feature                       | Summary                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🎤 **Members**                | Import Google Form CSVs (with a dry-run preview), or add people by hand with duplicate detection. Search, filter and export to CSV                                                                                                                                                                                                            |
| 🎼 **Practices & attendance** | Admins/committee schedule practices (date, time, venue). Members see them on their dashboard and reply **Going / Can't make it**, and the committee sees who replied what. Attendance can only be taken on the scheduled day. New members who reach 3 practices land on the **"Ready for WhatsApp"** list                                     |
| 💬 **WhatsApp invites**       | Store the choir's group links. Pick groups per member and send them by **email** (bulk), a **pre-filled WhatsApp chat** or **copy**. Mark "Joined", and a main group makes them Active                                                                                                                                                        |
| 🎂 **Birthdays**              | Dashboard and calendar. A daily email to opted-in committee members (07:00 Sri Lanka time) that never sends twice                                                                                                                                                                                                                             |
| 🚗 **Lifts home**             | For late practices: shows who lives near whom (approximate areas, with consent) on an OpenStreetMap map, for the people actually at that practice. Suggests which driver can drop whom on their way home (venue → drop-offs → driver's home) with an **Open in Google Maps** route, and groups people without a driver who could share a taxi |
| 🔐 **Access & roles**         | Google sign-in only. Every current member can sign in (to see practices and reply), and admins promote members to **Committee** or **Admin** on the Access & roles page. Every change goes to the audit log                                                                                                                                   |

Read the full design in **[docs/PROJECT_BLUEPRINT.md](docs/PROJECT_BLUEPRINT.md)**: architecture, data model, security and roadmap.

## Tech stack

Next.js 16 (App Router, TypeScript) · PostgreSQL (Neon) + Prisma 7 · Better Auth (Google) · Tailwind CSS 4 · Leaflet + OpenStreetMap · Nodemailer · Vitest + Playwright · hosted on Vercel.
The code is a **modular monolith**: each feature lives in `src/modules/<feature>` and exposes only public entry points. Lint rules enforce those boundaries.

```
src/
  app/                 # routes only (thin): pages, server actions, API routes
  modules/
    auth/ members/ imports/ attendance/ whatsapp-groups/ birthdays/ carpool/ notifications/
      domain/          # pure rules (unit-tested, client-safe)
      application/     # use cases
      infrastructure/  # adapters (Better Auth, SMTP, Nominatim, OpenRouteService)
      ui/              # feature components
      index.ts         # public server API
  shared/              # db client, config, settings, audit log, UI kit
prisma/                # schema, migrations, dev seed
tests/                 # integration + e2e (unit tests sit next to the code)
```

## Run it locally

Prerequisites: **Node.js 24** (see `.nvmrc`) and Git. Docker is not needed.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then edit if needed (the defaults work locally)

npm run db:local            # terminal 1: local PostgreSQL on port 5433 (leave it running)

npm run db:migrate          # terminal 2: create the tables
npm run db:seed             # fake demo data + a dev admin
npm run dev                 # http://localhost:3000
```

Sign in with **admin@example.com / vocal-impact-dev**. This password sign-in only exists when `ENABLE_PASSWORD_LOGIN=true`, and the app refuses to start with it in production.
In development, emails print to the terminal (`EMAIL_TRANSPORT=console`).

### Useful commands

| Command                                                       | What it does                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run lint` / `npm run typecheck` / `npm run format`       | Code quality                                                                                |
| `npm test`                                                    | Unit tests (pure domain rules)                                                              |
| `npm run test:integration`                                    | Integration tests against the local `vocal_impact_test` database (needs `db:local` running) |
| `npm run build && npm run test:e2e`                           | Browser tests (Playwright; first run `npx playwright install chromium`)                     |
| `npm run db:studio`                                           | Browse the database in Prisma Studio                                                        |
| `npm run db:seed-admin -- --email you@iit.ac.lk --name "You"` | Make someone an admin                                                                       |
| `npm run db:encrypt`                                          | Encrypt data saved before field encryption existed (safe to repeat; runs on every deploy)   |

### Encryption key

WhatsApp numbers, locations (landmark + coordinates) and dietary preferences are **encrypted in the database** (AES-256-GCM, see `docs/adr/0008`). The key is `DATA_ENCRYPTION_KEY` in `.env` / Vercel; generate one with `openssl rand -base64 32`.
**Keep a copy in the committee password manager.** If it's lost, that data can't be read; never change it on a database that already has data.

### Finding coordinates for landmarks (Python script)

Whenever a location is saved (Add member form, profile, CSV import) the app looks up its coordinates straight away in the background, and the daily job retries any left over. `scripts/geocode/geocode_locations.py` does the same lookups on its own, so you can run and check them yourself. It uses Google Maps first if `GOOGLE_MAPS_API_KEY` is set, then OpenStreetMap.

```bash
pip install -r scripts/geocode/requirements.txt      # only needed for the `db` command

python scripts/geocode/geocode_locations.py lookup "Kohuwala junction"   # try one landmark
python scripts/geocode/geocode_locations.py csv responses.csv            # -> responses-with-coordinates.csv
python scripts/geocode/geocode_locations.py db --dry-run                 # what would be filled in
python scripts/geocode/geocode_locations.py db [--retry-failed]          # fill in the database
python -m unittest discover -s scripts/geocode -v                        # its tests
```

The `csv` command adds a **Location Coordinates** column next to the location column. Import that file (Members → Import → Registration form) and those members go straight onto the map. Fill any blanks by right-clicking the spot in Google Maps and copying the numbers. The `db` command reads `.env` (`DATABASE_URL`, `DATA_ENCRYPTION_KEY`) and writes encrypted coordinates, exactly like the app.

## Deploy (free) — one-time setup

> The full step-by-step guide, with troubleshooting, is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Do this from a **committee IIT Google account**, and give **at least two committee members** owner access to every service (see [docs/HANDOVER.md](docs/HANDOVER.md)).

1. **GitHub:** create an organisation (e.g. `vocal-impact-iit`) and push this repository to it as a **private** repo.
2. **Neon** ([neon.tech](https://neon.tech), free plan):
   - Create a project in region _AWS Asia Pacific (Singapore)_.
   - Copy the **pooled** connection string → `DATABASE_URL`.
   - Copy the **direct** connection string → `DIRECT_URL`.
3. **Google sign-in** ([console.cloud.google.com](https://console.cloud.google.com), no billing account):
   - Create a project.
   - Set up the OAuth consent screen as **Internal** if IIT allows it, otherwise External.
   - Go to Credentials → _OAuth client ID_ → Web application.
   - Authorised redirect URI: `https://<your-app>.vercel.app/api/auth/callback/google`.
   - Copy the client ID and secret.
4. **Email (Brevo, free: 300 emails/day):**
   - In Brevo, go to **Senders, domains & dedicated IPs → Senders** and add and verify the committee email you'll send from.
   - Go to **SMTP & API → API keys → Generate a new API key**.
   - Set `EMAIL_TRANSPORT=brevo`, `BREVO_API_KEY=<the key>` and `EMAIL_FROM="Vocal Impact <that-verified-address>"`.
   - **Email logo:** upload `public/brand/logo-primary-white.png` to Brevo's image library (or any public image host). Copy its link into `EMAIL_LOGO_URL`. Once deployed this is optional, because the app serves the logo itself.
   - Check it in the app: **Settings → System & data → Send me a test email**. Use **Settings → Email designs** to preview the emails.
   - (SMTP, e.g. a Gmail App Password, also works with `EMAIL_TRANSPORT=smtp`. See `.env.example`.)
5. **Vercel** ([vercel.com](https://vercel.com), Hobby plan):
   - Import the GitHub repo.
   - Add the environment variables from `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (your app URL), Google keys, `EMAIL_TRANSPORT`/`BREVO_API_KEY`/`EMAIL_FROM`, `CRON_SECRET`, `DATA_ENCRYPTION_KEY` (the **same** key as in your local `.env` if you move local data across), `NOMINATIM_USER_AGENT` and `ALLOWED_EMAIL_DOMAIN`. Optional: `ORS_API_KEY`, `GOOGLE_MAPS_API_KEY`, `EMAIL_LOGO_URL`.
   - Do **not** set `ENABLE_PASSWORD_LOGIN`.
   - Deploy. The `vercel-build` script applies database migrations automatically, and `vercel.json` schedules the daily job.
6. **First admin:** run `npm run db:seed-admin -- --email your.name@iit.ac.lk --name "Your Name"` with `DATABASE_URL` pointing at Neon. Then sign in and add the rest of the committee in **Settings → Users**.
7. **In the app:**
   - Settings → General: set the practice venue coordinates.
   - WhatsApp: add the group links.
   - Settings → Users: tick "Birthday emails" for whoever should get reminders.
   - Members → Import CSV: upload the Google Form export.
8. **Optional:**
   - A free [OpenRouteService](https://openrouteservice.org) key → `ORS_API_KEY` (**recommended**). Without it, "Lifts home" estimates distances as straight line × 1.3. With it, matching uses real road distances and the map shows the actual routes. The free plan allows 500 distance lookups and 2,000 routes a day, which is plenty.
   - GitHub secrets `BACKUP_DATABASE_URL` + `BACKUP_PASSPHRASE` turn on the weekly encrypted backup workflow.

## Contributing

- Branch from `main` (`feat/…`, `fix/…`) and open a pull request. CI must pass and one review is needed.
- Use [Conventional Commits](https://www.conventionalcommits.org) (`feat(attendance): …`). A Git hook checks the message.
- Keep route files thin and put logic in `src/modules/*`, importing other modules only through their public entry points.
- Never commit real member data. `*.csv` files are git-ignored except the fake fixtures in `tests/fixtures/`.
- Record significant decisions as ADRs in [docs/adr](docs/adr).
