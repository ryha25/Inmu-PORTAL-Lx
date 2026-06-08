---
name: INMU Token-2022 batch transfer
description: Pattern for sending INMU to multiple users in one Phantom signature
---

**Rule:** Build a single `Transaction` with one `createTransferInstruction` per target user (all Token-2022 program). One Phantom `signTransaction` covers all N recipients. Then call `/admin/record-batch-inmu-transfer` with `{txSignature, transfers:[{userId, amount}], memo, type}`.

**Why:** N separate transactions would require N Phantom prompts. A single batched transaction with N instructions is UX-friendly and gas-efficient. Solana transaction size limit (~1232 bytes) caps ~15-20 recipients per tx for Token-2022 (ATA create + transfer per user).

**How to apply:** `sendBatchInmu()` in admin-panel.tsx. If recipient count exceeds ~15, split into multiple batches of 10.
