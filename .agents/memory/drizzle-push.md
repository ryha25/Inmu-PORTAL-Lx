---
name: Drizzle push non-interactive
description: drizzle-kit push fails in non-TTY environments (Replit CI/sandbox)
---

**Rule:** Never run `pnpm --filter @workspace/db run push` unattended when schema diffs include data-loss warnings (e.g. extra tables detected). Use `psql "$DATABASE_URL" -c "ALTER TABLE ... ADD COLUMN IF NOT EXISTS ..."` instead.

**Why:** drizzle-kit push requires interactive TTY confirmation for data-loss statements. Replit sandbox stdin is not a TTY, so it fails with "Interactive prompts require a TTY terminal".

**How to apply:** For simple column additions, use direct SQL. For full migration, use `drizzle-kit generate` + `psql < migration.sql`.
