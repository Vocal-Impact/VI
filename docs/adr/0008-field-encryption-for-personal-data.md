# 8. Encrypt sensitive personal fields in the database

- **Status:** Accepted (2026-10-04)

## Context

The database holds members' WhatsApp numbers, where they live (nearest landmark plus coordinates) and, from the 2026 form, dietary preferences. Dietary answers can reveal religion or health ("halal", "nut allergy"), which Sri Lanka's PDPA treats as special-category data. Database dumps, Neon's console, backups and a leaked `DATABASE_URL` should not expose any of it.

## Decision

- **Fields encrypted at rest:** `member.whatsappNumberEncrypted`, `member.dietaryPreferenceEncrypted`, `member_location.areaLabelEncrypted` and `member_location.coordinatesEncrypted` (stored as `"lat,lng"` text).
- **Algorithm:** AES-256-GCM with a random 12-byte IV per value, stored as `v1:` + base64url(iv ‖ ciphertext ‖ tag) (`src/shared/crypto/field-encryption.ts`). The `v1:` prefix leaves room for key rotation later.
- **Key:** `DATA_ENCRYPTION_KEY` (32 random bytes, base64), set in the environment only.
- **Lookups:** exact-match lookups use a **blind index**, an HMAC-SHA256 under a sub-key derived with HKDF. Examples are `member.whatsappNumberHash` (duplicate check, phone search) and the geocode cache key, which is a fingerprint of the landmark rather than the text.
- **Audit log:** never stores these values; old entries were scrubbed by `npm run db:encrypt`.
- **Migration:** existing plaintext stayed in the renamed columns, and reads tolerate values without the `v1:` prefix. `npm run db:encrypt` (also run on every Vercel deploy) encrypts them in place and is idempotent.
- **Python geocoder:** `scripts/geocode/geocode_locations.py` uses the same format. A shared test vector keeps both implementations in step.

**Not encrypted, on purpose:**

- **Name, IIT email and student ID:** needed for sign-in, search and matching CSV rows.
- **Date of birth:** read every day by birthday reminders. It is a candidate for the next round, using a month-day blind index.

## Consequences

- **Search:** phone search is an exact match, typed in any format. Partial phone search and sorting by area happen in memory, which is fine for a few hundred members.
- **Key loss:** losing `DATA_ENCRYPTION_KEY` makes these fields unrecoverable. It lives in the committee password manager and is part of the yearly handover.
- **Key changes:** the key must never be changed on a database that has data. Rotation would need a re-encrypt script and a `v2:` prefix.
- **Threat model:** this protects data at rest and in backups. It does not protect against someone with both the database and the app's environment.
