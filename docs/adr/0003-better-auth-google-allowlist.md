# 3. Better Auth with Google and an allowlist

- **Status:** Accepted (2026-10-02)

## Context

Committee members have IIT Google Workspace accounts. Nobody should be able to self-register.

## Decision

- **Sign-in:** Better Auth with the Google provider and database sessions.
- **Allowlist:** a `user.create.before` hook refuses all new users. Admins pre-create users with `emailVerified = true`, and Google sign-in links to that row.
- **Disabled users:** a `session.create.before` hook blocks them.
- **Roles:** loaded fresh from the database on every request and checked by `requirePermission`.
- **Local and test sign-in:** email + password, only when `ENABLE_PASSWORD_LOGIN=true`. It is refused when `VERCEL_ENV=production`.

## Consequences

- **Access control:** adding someone is a one-step admin action. Removing them takes effect immediately because their sessions are deleted.
- **Bootstrapping:** the first admin is created with `npm run db:seed-admin`.
