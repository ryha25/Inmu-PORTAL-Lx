---
name: Solana tx confirmation order
description: Best practice for Solana tx recording to avoid BlockHeightExceeded causing false failures
---

Record the transaction in the backend immediately after `sendRawTransaction` returns the signature — before calling `confirmTransaction`. Then wrap `confirmTransaction` in try/catch and treat any thrown error (BlockHeightExceeded, timeout) as non-fatal. Show success UI as long as signature was obtained.

**Why:** `confirmTransaction({signature, blockhash, lastValidBlockHeight})` throws `TransactionExpiredBlockheightExceededError` if signing + network latency consumes too many blocks. The tx itself was already submitted and will be processed on-chain. If we only record after confirmation, users see "failed" even though their funds moved.

**How to apply:** In any Solana send flow using Phantom: 1) sendRawTransaction → signature, 2) POST to backend to record with txHash, 3) try/catch confirmTransaction separately, 4) setTxHash(signature) + show success toast.

Also: use `getLatestBlockhash('confirmed')` (not 'finalized') for a fresher blockhash with more blocks of buffer.
