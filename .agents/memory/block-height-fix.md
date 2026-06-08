---
name: Block height exceeded fix
description: How to handle TransactionExpiredBlockheightExceededError in Solana Token-2022 transfers
---

**Rule:** Use `'confirmed'` (not `'finalized'`) for `getLatestBlockhash`. If `confirmTransaction` throws block-height-exceeded, poll `getSignatureStatuses` up to 12 times (2.5s intervals) before giving up.

**Why:** `'finalized'` takes ~32s which can exhaust the ~150-block window under network congestion. `'confirmed'` is still safe for most use cases and leaves more headroom. The tx often lands even when confirmation times out.

**How to apply:** In `handleSendInmu` (admin-profile-page.tsx) and `sendBatchInmu` (admin-panel.tsx) — both already use this pattern via `confirmWithFallback()` helper.
