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
