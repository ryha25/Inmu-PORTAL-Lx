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

## CRLF file gotcha (pet-page.tsx)
`artifacts/inmu-bank/src/pages/pet-page.tsx` is CRLF-encoded (rest of the codebase is LF). The `edit` tool's exact-string match is unreliable against it — sometimes succeeds, sometimes fails on visually-identical text.
**Why:** raw byte/line-ending mismatch between what `read` displays (LF-normalized) and the tool's internal comparison.
**How to apply:** for this file, script edits in python: `io.open(path,'r',encoding='utf-8')` (auto-normalizes CRLF→LF) → exact string replace with an assert-count==1 check → write back with `io.open(path,'w',encoding='utf-8',newline='\r\n')` to preserve CRLF. Check a file's line endings before assuming the `edit` tool is safe on it.

## Pet feature: unique-skill vs training-slot mechanics are separate
`skillActiveCharacterIds` (array, max 3, PetSaveData field — migrated 2026-07-04 from a single `skillActiveCharacterId` field) drives a standalone "固有スキル発動" unique-skill-activation UI, distinct from `activePetIds` (array, up to `unlockedSlots`) which drives the "レベル報酬スキル発動" training-slot/level-reward mechanic (renamed from "育成＆レベル報酬スキル発動"). A character can be active in both arrays simultaneously — they're independent. All 3 server-side consumers (frontend save/load, `pet-skills.ts` hasActivePetSkill, `purchase-requests.ts` rebate bonus lookup) must read the new array field but also fall back to the legacy singular field for old saved states (no DB migration was run). Purchase-request rebate rate = admin-configured base rate (`normal_rebate_rate`/`event_rebate_rate` system settings) + PET-derived bonuses (level-reward achievements and/or any active unique skill), computed server-side and returned as `baseRebateRate`/`petRebateBonuses`/`petRebateBonusRate`/`totalRebateRate` from `GET /api/purchase-requests`.

## Testing gotcha: runTest retries can find state already mutated
The `runTest` testing subagent sometimes internally retries a full test plan against the same shared dev DB. A retry can see state already mutated by an earlier (successful) pass, producing a spurious failure that looks like a real bug ("expected empty slot, found it already filled") when the feature actually worked.
**How to apply:** if a test fails with observed state matching the *end* state of the plan rather than the seeded initial state, check the DB directly, reset the seed row(s), and re-run once before concluding there's a real bug.
