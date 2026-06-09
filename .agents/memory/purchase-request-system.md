---
name: Purchase request system
description: purchaseRequestsTable and systemSettingsTable design and how the configurable limit works
---

## Tables
- `purchaseRequests`: userId, amount, txHash, comment, status (pending/approved/rejected), rebateAmount, rebateRate, adminNote, reviewedAt
- `systemSettings`: key (PK), value, description, updatedAt

## API routes
- `GET /purchase-requests/limit` — public limit fetch (falls back to 1000000 if not in DB)
- `POST /purchase-requests` — user submit; validated against current limit; returns 400 with limit info if exceeded
- `GET /admin/purchase-requests` — joined with profile for displayName/solWallet
- `PUT /admin/purchase-requests/:id` — status update + optional rebate; if approved+rebateAmount>0, inserts transaction (type="reward") and notification

## Configurable limit
- Stored as `systemSettings.key = "purchase_request_limit"`, `value = "1000000"`
- `getPurchaseLimit()` helper in purchase-requests.ts reads from DB, fallback 1000000
- Admin changes via `PUT /admin/system-settings/purchase_request_limit`; instantly reflected for next requests

**Why:** User requested admin-configurable limit to avoid code changes for campaign/event adjustments.
**How to apply:** For any new numeric setting, add a key to systemSettings with INSERT...ON CONFLICT DO NOTHING in migration, then add to DEFAULTS map in system-settings.ts and SYSTEM_SETTING_PRESETS in admin-panel.tsx.
