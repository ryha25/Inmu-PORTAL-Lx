---
name: Gacha feature implementation
description: gachaResults table schema, free daily gacha, Phantom INMU send flow, DB migration pattern
---

## gachaResults table
- Created via `CREATE TABLE IF NOT EXISTS` in gacha.ts `ensureTable()` at module init
- New columns added via `ALTER TABLE ADD COLUMN IF NOT EXISTS` (safe migration pattern):
  - `isFree BOOLEAN DEFAULT false` — marks free daily gacha
  - `txHash TEXT` — Solana tx signature after admin sends INMU
  - `solWallet TEXT` — recipient wallet recorded at send time
  - `failureReason TEXT` — stored when inmuSentStatus='failed'
- inmuSentStatus values: `'pending'` | `'sent'` | `'failed'` (frontend-only: `'sending'`)

## Prizes & probabilities
- 880/80/30/10 per 1000 (pts100/pts1000/pts5000/inmu10k)
- GUARANTEED_RATE = 1/114 for jackpot screen

## Free daily gacha (JST-based reset)
- `GET /api/gacha/free-status` → `{ used, nextReset }`
- `POST /api/gacha/free-spin` → same response shape as regular spin
- Uses `jstTodayStartUtc()` helper for JST 00:00 boundary check
- No points consumed; only point rewards are given (no cost deducted)
- Saved with `pullType='free'`, `costPoints=0`, `isFree=true`

## Admin Phantom INMU send flow
- `markGachaSent(row: GachaResultRow)` in admin-panel.tsx does full Phantom wallet flow:
  1. Check solWallet exists
  2. Connect Phantom
  3. Build SPL token transfer tx (inmuCount × 10000 INMU, TOKEN_2022_PROGRAM_ID)
  4. Sign + send via phantom.signTransaction + connection.sendRawTransaction
  5. On success: call `PUT /api/admin/gacha/results/:id/mark-sent` with `{ txHash, solWallet }`
  6. On user reject: revert local state to 'pending' (no DB write)
  7. On other error: call `PUT /api/admin/gacha/results/:id/mark-failed`, local state='failed'
- `markGachaRetry(id)` calls `PUT /api/admin/gacha/results/:id/reset-pending` to reset 'failed'→'pending'

## mark-sent side effects (backend)
- Updates gachaResults: status='sent', txHash, solWallet, inmuSentAt, inmuSentByAdminId
- Inserts into transactionsTable with type='gacha_reward', amount=inmuCount*10000, txHash
- Updates profileTable: balance + totalReceived + inmuAmount
- Inserts notification to user

## Transaction type
- `gacha_reward` added to TX_TYPE_LABEL ('ガチャ報酬') and TX_INCOME_TYPES in admin-panel.tsx

## drizzle-kit push
- Blocked by TTY — use raw SQL `ALTER TABLE ADD COLUMN IF NOT EXISTS` for all migrations
