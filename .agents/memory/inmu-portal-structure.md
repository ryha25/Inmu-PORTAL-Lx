---
name: INMU PORTAL project structure
description: Key facts about the INMU PORTAL app setup and env requirements
---

## Structure
- Frontend: `artifacts/inmu-bank/` (React + Vite, port 26083, previewPath `/`)
- Backend: `artifacts/api-server/` (Express 5, port 8080, previewPath `/api`)
- DB schema: `lib/db/src/schema/index.ts` — full schema with many tables

## Required env vars
- `DATABASE_URL` — Postgres connection string (must be set for api-server to start)
- `SESSION_SECRET` — HMAC secret for cookie-based sessions (uses insecure dev default if missing)

## Key points
- Session system is custom HMAC cookie (no express-session/connect-pg-simple)
- bcryptjs is used for password hashing
- Solana web3.js packages are used in the frontend for DEX integration
- The inmu-bank vite.config requires PORT and BASE_PATH env vars (set by artifact system)
- DB lib throws at import time if DATABASE_URL is missing — api-server won't start without it

**Why:** User explicitly said not to change code for missing env vars; they set them separately.

## Dual auth model
Two independent session cookies checked in `middlewares/session.ts`:
- Regular user session → `requireAuth` (`req.userId`).
- Admin-code session (separate login at `/inmu1919-login`, not tied to a user account) → `requireAdmin` (`req.isAdminSession`).
A route written with `requireAuth` will 401 for an admin-code-only session (no user cookie present). Use `requireAuthOrAdmin` for any endpoint that must be callable from both the regular app and the admin panel (e.g. shared read-only data like live token price).
**Why:** hit this adding a live-price fetch to the admin panel — it used `requireAuth` and silently failed for admin sessions.
**How to apply:** before wiring a new admin-panel API call, check which middleware the target route uses; prefer `requireAuthOrAdmin` if the route is also used by the regular app.

## System settings pattern for admin-editable numeric constants
`systemSettingsTable` (key/value/description) + the `DEFAULTS` map in `routes/system-settings.ts` is the established way to make a previously-hardcoded numeric constant admin-editable without a schema migration: add a key to `DEFAULTS`, then read it at the call site via `getSystemSettingNumber(key, fallback)` (`services/system-settings-store.ts`, raw `pool.query`, works from both drizzle- and raw-SQL route files). Admin UI reads/writes go through the existing `GET/PUT /admin/system-settings[/:key]` endpoints — reuse rather than inventing new ones.
