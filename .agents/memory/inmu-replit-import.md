---
name: INMU Replit import/preview setup
description: How the real ryha25/inmu-bank-lx repo is run inside the Replit workspace preview
---

The published INMU PORTAL lives in the GitHub repo `ryha25/inmu-bank-lx` (pnpm monorepo:
`artifacts/{inmu-bank,api-server,mockup-sandbox}`, `lib/{db,api-spec,api-zod,api-client-react}`).
The Replit workspace runs that same code; to refresh from GitHub, sync repo dirs over the
workspace but preserve the Replit-owned bits.

**Rule:** never copy `.replit` or `.replitignore` from the clone — they are Replit-managed and
the copy is hard-blocked. Preserve each artifact's `.replit-artifact/artifact.toml`
(the registration) — wipe artifact contents with `find <art> -mindepth 1 -maxdepth 1 ! -name .replit-artifact -exec rm -rf {} +` then `cp -a repo/<art>/. <art>/`.

**Why:** the workspace is a registered-artifact environment; artifact.toml + `.replit` define
ports/workflows/preview routing. Overwriting them breaks the preview; the repo clone doesn't
even contain `.replit-artifact` (gitignored).

**How to apply (preview bring-up):**
1. Frontend artifact = react-vite, slug `inmu-bank`, previewPath `/`. API artifact serves `/api`.
2. `pnpm install`; `ADMIN_CODE` must be set as an env var (admin-auth returns 503 without it).
   `SESSION_SECRET` + `DATABASE_URL` already present as secrets.
3. `pnpm --filter @workspace/db run push` (drizzle) to create the 12 tables in the fresh preview DB.
4. Restart both workflows. The preview DB starts empty (no seeded users) — that is expected,
   not a bug; the real users live in the deployed app's own production DB.

`rsync` is NOT installed in this environment — use `cp -a` / `tar`.
