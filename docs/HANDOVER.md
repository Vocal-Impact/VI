# Yearly handover checklist

IIT Google accounts are switched off when students graduate. The app keeps running only if **every service always has at least two current owners**. Run through this list each year **before** the outgoing committee leaves.

## Who owns what

Fill this table in and keep it up to date (names, not passwords):

| Service                       | What it holds                        | Owners (≥ 2) |
| ----------------------------- | ------------------------------------ | ------------ |
| GitHub organisation           | Code, CI, backups                    |              |
| Vercel team                   | Hosting, environment variables, cron |              |
| Neon organisation             | Database                             |              |
| Google Cloud project          | "Sign in with Google" OAuth client   |              |
| Brevo account (email sending) | Birthday and invite emails           |              |
| OpenRouteService (optional)   | Carpool route matching               |              |
| App admins (Settings → Users) | Who can manage the app               |              |

## Checklist

- [ ] **Add the incoming owners** to every service above, _before_ removing anyone.
- [ ] In the app: **add the new committee** in Settings → Users, make at least two of them **Admin**, and set who gets **birthday emails**.
- [ ] **Rotate secrets** in Vercel → Settings → Environment Variables, then redeploy:
  - `BETTER_AUTH_SECRET` (signs everyone out, which is expected)
  - `CRON_SECRET`
  - `BREVO_API_KEY` (generate a new key in Brevo, then delete the old one)
  - `BACKUP_PASSPHRASE` (GitHub secret). Keep the old one until the old backups expire after 90 days.
- [ ] **Review WhatsApp group links.** If any old committee member might still share them, reset the links in WhatsApp and update them under WhatsApp → groups.
- [ ] **Re-check free-tier limits** (blueprint §8.3): Vercel Hobby, Neon Free, Gmail/Brevo and Nominatim usage policy.
- [ ] **Tidy members:** set graduated members to _Alumni_ and leavers to _Inactive_.
- [ ] **Remove the outgoing committee** from Settings → Users (untick "Can sign in") and from every service.
- [ ] Check **Settings → System & data → Daily job runs** shows recent successful runs.
- [ ] Download a fresh **CSV export** (Settings → System & data) and store it in the committee's shared drive.

## If something breaks

- **Nobody can sign in:** an owner with database access runs `npm run db:seed-admin -- --email someone@iit.ac.lk` against the production `DATABASE_URL`.
- **Emails stopped:** check Settings → System & data for failed runs. Use **Send me a test email**: it shows Brevo's exact error (e.g. an invalid key or an unverified sender).
- **Restore a backup:** download the newest `db-backup-*` artifact from GitHub Actions, then run `gpg --decrypt backup.sql.gz.gpg | gunzip | psql "$DATABASE_URL"`.
