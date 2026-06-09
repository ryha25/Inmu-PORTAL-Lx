---
name: Admin configurable settings
description: systemSettingsTable KV store pattern for runtime configuration without redeploy
---

## Pattern
Use `systemSettingsTable` (key TEXT PK, value TEXT, description TEXT, updatedAt) for any setting that should be changeable by the admin without code changes or redeploy.

## Current keys
- `purchase_request_limit`: max INMU per purchase request (default 1000000)

## Adding a new setting
1. Add a DB migration: `INSERT INTO "systemSettings" (key, value, description) VALUES (...) ON CONFLICT (key) DO NOTHING`
2. Add to `DEFAULTS` map in `system-settings.ts`
3. Add to `SYSTEM_SETTING_PRESETS` in `admin-panel.tsx` if preset buttons are useful
4. Read in relevant API route via a helper like `getPurchaseLimit()` pattern

## Frontend location
Admin panel → 「設定」タブ (8th tab) — shows all settings with edit UI and preset buttons.

**Why:** User explicitly requested "コード修正なしで運営できる状態" — all key operational numbers should be editable from admin UI.
