# 1. Modular monolith on Next.js

- **Status:** Accepted (2026-10-02)

## Context

A small student committee maintains the app. It must be free to host and still easy to extend for several years.

## Decision

- **One deployable app:** a single Next.js (App Router, TypeScript) app with UI and API together.
- **Feature modules:** code is split into modules under `src/modules/*`. Each module exposes public entry points (`index.ts`, `domain/`, `ui/`, `client.ts`), and ESLint `no-restricted-imports` blocks deep imports.
- **Thin routes:** `src/app` only parses input, checks permissions and calls module services.

## Consequences

- **Hosting:** a single Vercel project and one database.
- **Extracting later:** possible but unlikely to be needed.
- **Discipline:** new features follow the same `domain → application → infrastructure → ui` layout.
