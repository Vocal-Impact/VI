# 2. PostgreSQL on Neon with Prisma

- **Status:** Accepted (2026-10-02)

## Context

We need a free, relational, durable database that doesn't pause for long periods. (Supabase's free tier pauses after a week of inactivity.)

## Decision

- **Database:** Neon free tier (scales to zero and wakes on request).
- **ORM:** Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`), with versioned migrations applied by `vercel-build`.
- **Local development:** `embedded-postgres` (`npm run db:local`), so no Docker is needed.

## Consequences

- **Schema changes** always go through `prisma migrate dev`, and CI fails on drift.
- **Cold starts:** Neon can take about a second to wake after idling.
