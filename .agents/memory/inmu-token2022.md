---
name: INMU Token-2022 program
description: INMU token is owned by Token-2022 program, not standard SPL Token program
---

The INMU token mint `4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump` is owned by the **Token-2022 program** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`), verified on-chain via `getAccountInfo`.

**Why this matters:** Any `@solana/spl-token` function that accepts a `programId` parameter must be passed `TOKEN_2022_PROGRAM_ID`, otherwise Solana runtime throws "incorrect program id for instruction".

**How to apply:** In every SPL token operation involving INMU:
- `getAssociatedTokenAddress(mint, owner, false, TOKEN_2022_PROGRAM_ID)`
- `getAccount(connection, ata, commitment, TOKEN_2022_PROGRAM_ID)`
- `createAssociatedTokenAccountInstruction(payer, ata, owner, mint, TOKEN_2022_PROGRAM_ID)`
- `createTransferInstruction(from, to, authority, amount, [], TOKEN_2022_PROGRAM_ID)`

Backend raw RPC (`getTokenAccountsByOwner` with `{ mint }` filter) works for Token-2022 without extra params — the RPC node handles program routing automatically.

Applied in: `artifacts/inmu-bank/src/pages/admin-profile-page.tsx` and `artifacts/inmu-bank/src/components/admin-panel.tsx`
