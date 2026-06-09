---
name: Admin profile INMU send removed
description: INMU on-chain send was removed from admin profile page; send lives only in Actions tab
---

The admin profile page (/inmu1919/profile) no longer has on-chain INMU send functionality. All @solana/* imports, Dialog, UserRow type, send state, handleSendInmu, and related JSX were removed.

**Why:** User requested admin INMU send to be unified under the Actions tab in the admin panel. The Actions tab has distribute-airdrop (selected users) and distribute-airdrop-all (all users) which update DB balances.

**How to apply:** Do not re-add send functionality to admin-profile-page.tsx. If on-chain send from admin is needed, add it to admin-panel.tsx Actions section instead.
