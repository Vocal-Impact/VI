<p align="center">
  <img src="public/brand/logo-primary-black.png" alt="Vocal Impact" width="320">
</p>

<p align="center"><b>Member, attendance, WhatsApp-invite, birthday and carpool management for the Vocal Impact choir (IIT).</b><br>
Built only with open-source tools and free hosting tiers.</p>

---

## What it does

| Feature                 | Summary                                                                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🎤 **Members**          | Import Google Form CSVs (with a dry-run preview), or add people by hand with duplicate detection. Search, filter and export to CSV                                                      |
| 🎼 **Attendance**       | One tap starts today's practice, and a phone-friendly checklist marks people present. New members who reach 3 practices land on the **"Ready for WhatsApp"** list                       |
| 💬 **WhatsApp invites** | Store the choir's group links. Pick groups per member and send them by **email** (bulk), a **pre-filled WhatsApp chat** or **copy**. Mark "Joined", and a main group makes them Active  |
| 🎂 **Birthdays**        | Dashboard and calendar. A daily email to opted-in committee members (07:00 Sri Lanka time) that never sends twice                                                                       |
| 🚗 **Carpool**          | Approximate home areas (with consent) on an OpenStreetMap map. Suggests driver groups and neighbour groups, each with **Open in Google Maps** directions                                |
| 🔐 **Access & roles**   | Google sign-in for approved people only. Admins promote choir members to **Committee** or **Admin** (or remove access) from the Access & roles page. Every change goes to the audit log |

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

Prerequisites: **Node.js 22** (see `.nvmrc`) and Git. Docker is not needed.

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

## Deploy (free) — one-time setup

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
4. **Email:**
   - On the committee Google account, turn on 2-Step Verification, then create an **App Password** → `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_TRANSPORT=smtp`.
   - If IIT blocks App Passwords, use a free **Brevo** SMTP key instead (`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`).
5. **Vercel** ([vercel.com](https://vercel.com), Hobby plan):
   - Import the GitHub repo.
   - Add the environment variables from `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` (your app URL), Google keys, SMTP settings, `CRON_SECRET`, `NOMINATIM_USER_AGENT` and `ALLOWED_EMAIL_DOMAIN`.
   - Do **not** set `ENABLE_PASSWORD_LOGIN`.
   - Deploy. The `vercel-build` script applies database migrations automatically, and `vercel.json` schedules the daily job.
6. **First admin:** run `npm run db:seed-admin -- --email your.name@iit.ac.lk --name "Your Name"` with `DATABASE_URL` pointing at Neon. Then sign in and add the rest of the committee in **Settings → Users**.
7. **In the app:**
   - Settings → General: set the practice venue coordinates.
   - WhatsApp: add the group links.
   - Settings → Users: tick "Birthday emails" for whoever should get reminders.
   - Members → Import CSV: upload the Google Form export.
8. **Optional:**
   - A free [OpenRouteService](https://openrouteservice.org) key → `ORS_API_KEY` for road-route carpool matching.
   - GitHub secrets `BACKUP_DATABASE_URL` + `BACKUP_PASSPHRASE` turn on the weekly encrypted backup workflow.

## Contributing

- Branch from `main` (`feat/…`, `fix/…`) and open a pull request. CI must pass and one review is needed.
- Use [Conventional Commits](https://www.conventionalcommits.org) (`feat(attendance): …`). A Git hook checks the message.
- Keep route files thin and put logic in `src/modules/*`, importing other modules only through their public entry points.
- Never commit real member data. `*.csv` files are git-ignored except the fake fixtures in `tests/fixtures/`.
- Record significant decisions as ADRs in [docs/adr](docs/adr).
