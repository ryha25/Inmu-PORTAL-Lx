---
name: INMU admin wallet & transfers
description: How the INMU Bank admin wallet is stored, and why agents cannot produce a real transfer TxHash.
---

# Admin wallet persistence
- The admin's connected Phantom wallet address is stored **server-side** in an `app_settings` KV table (key `admin_wallet`), exposed via `GET/POST/DELETE /api/admin/wallet` (all `requireAdmin`).
- **Why:** `localStorage` is per-browser/per-webview, so the address only showed up in the Phantom in-app browser and looked "disconnected" in Safari/other tabs. Server storage makes it visible in any browser with a valid admin session.
- **How to apply:** On init the frontend treats the server value as authoritative — if the server returns `wallet: null`, clear the localStorage cache too, so a disconnect in one browser propagates everywhere. localStorage is only a fallback when the fetch fails (network error or 5xx).

# Transfers cannot be signed by the agent
- INMU transfers require the admin's Phantom **private key**, which is never stored server-side (by design).
- **Why:** Only the wallet owner can sign. There is no admin private key in the DB or env.
- **How to apply:** An agent CANNOT perform a signed transfer or produce a real TxHash. Do not fabricate one. The most you can do is prove correctness via on-chain checks / `simulateTransaction` and give the user exact steps to sign in Phantom.
