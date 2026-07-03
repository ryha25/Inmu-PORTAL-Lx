import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, tradeHistoryTable } from "@workspace/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, requireAuthOrAdmin } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

// ── 既知DEX/スワッププログラム ──
const ALL_KNOWN_LABELS: Record<string, string> = {
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  "5quBtoiQqxF9Jv6KYKctB59NT3gtJD2Y65kdnB1Uev3h": "Raydium",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc":  "Orca",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca",
  "LBUZKhRxPF3XUpBCjp4YzTKgLLjLssfyqieAsxSLqqe":  "Meteora",
  "Eo7WjKq67rjJQDjr6b4T7dhAoaLENRNBpkRMHCnSwWZZ": "Meteora",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P":  "pump.fun",
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA":  "pump.fun",
  "CebN5WGQ4jvEPvsVU4EoHEpgznyQHearzZAbaeoNARs":  "pump.fun",
};

// ── 通常送金にのみ使われるプログラム群（これのみ = スワップなし） ──
const PURE_TRANSFER_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",   // SPL Token Program
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",   // Token-2022
  "11111111111111111111111111111112",                // System Program
  "ComputeBudget111111111111111111111111111111",     // Compute Budget
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bwd",  // Associated Token Account
  "SysvarRent111111111111111111111111111111111",     // Sysvar Rent
  "SysvarC1ock11111111111111111111111111111111",     // Sysvar Clock
  "SysvarEpochSchedu1e111111111111111111111111",     // Sysvar EpochSchedule
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",   // Memo v2
  "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo",   // Memo v1
]);

// SOL変化がトランザクション手数料のノイズ以上かを判定するしきい値（lamports）
const SOL_SWAP_THRESHOLD_LAMPORTS = 100_000; // ~0.0001 SOL

const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
];

async function rpcFetch(body: unknown): Promise<Response> {
  const customRpc = process.env.SOLANA_RPC;
  const endpoints = customRpc ? [customRpc, ...RPC_ENDPOINTS] : RPC_ENDPOINTS;
  let lastErr: Error = new Error("No RPC endpoint available");
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return res;
      const text = await res.text().catch(() => "");
      console.warn(`[Solana] RPC ${url} returned ${res.status}: ${text.slice(0, 100)}`);
      lastErr = new Error(`RPC ${url} error ${res.status}`);
    } catch (e) {
      console.warn(`[Solana] RPC ${url} failed:`, e);
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr;
}

export async function fetchInmuBalance(wallet: string): Promise<number> {
  const res = await rpcFetch({
    jsonrpc: "2.0", id: 1,
    method: "getTokenAccountsByOwner",
    params: [wallet, { mint: INMU_TOKEN_MINT }, { encoding: "jsonParsed" }],
  });
  const data = await res.json() as {
    result?: { value?: Array<{ pubkey: string; account: { data: { parsed: { info: { tokenAmount: { amount: string; decimals: number; uiAmount: number | null } } } } } }> };
    error?: { message: string; code?: number };
  };
  if (data.error) throw new Error(data.error.message);
  const accounts = data.result?.value ?? [];
  if (accounts.length === 0) return 0;
  const totalRaw = accounts.reduce((sum, acct) => sum + Number(acct.account.data.parsed.info.tokenAmount.amount), 0);
  return totalRaw / Math.pow(10, INMU_DECIMALS);
}

async function fetchTokenAccountAddresses(wallet: string): Promise<string[]> {
  const res = await rpcFetch({
    jsonrpc: "2.0", id: 1,
    method: "getTokenAccountsByOwner",
    params: [wallet, { mint: INMU_TOKEN_MINT }, { encoding: "jsonParsed" }],
  });
  const data = await res.json() as {
    result?: { value?: Array<{ pubkey: string }> };
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  return (data.result?.value ?? []).map((a) => a.pubkey);
}

async function fetchSignatures(tokenAccountAddr: string, limit = 50, until?: string) {
  const opts: Record<string, unknown> = { limit };
  if (until) opts.until = until;
  const res = await rpcFetch({
    jsonrpc: "2.0", id: 1,
    method: "getSignaturesForAddress",
    params: [tokenAccountAddr, opts],
  });
  const data = await res.json() as {
    result?: Array<{ signature: string; blockTime: number | null; err: unknown }>;
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  return data.result ?? [];
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  uiTokenAmount: { amount: string; decimals: number };
}

interface ParsedTx {
  blockTime: number | null;
  meta: {
    err: unknown;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    innerInstructions?: Array<{ index: number; instructions: Array<{ programIdIndex: number }> }>;
    loadedAddresses?: { writable: string[]; readonly: string[] };
  };
  transaction: {
    message: {
      accountKeys: string[];
      instructions?: Array<{ programIdIndex: number }>;
    };
  };
}

async function fetchTransaction(sig: string): Promise<ParsedTx | null> {
  const res = await rpcFetch({
    jsonrpc: "2.0", id: 1,
    method: "getTransaction",
    params: [sig, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
  });
  const data = await res.json() as { result?: ParsedTx | null; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result ?? null;
}

// ── スワップ判定コア ──
// 戻り値: "buy" | "sell" | null（null = 通常送金）
function classifySwapType(params: {
  diffRaw: number;
  accountKeys: string[];
  invokedProgramIds: Set<string>;
  preBalances: number[];
  postBalances: number[];
  preTokenBalances: TokenBalance[];
  postTokenBalances: TokenBalance[];
  walletAddress: string;
}): "buy" | "sell" | null {
  const {
    diffRaw, accountKeys, invokedProgramIds,
    preBalances, postBalances,
    preTokenBalances, postTokenBalances, walletAddress,
  } = params;

  // ① 純粋な通常送金プログラムのみ → スワップなし（通常送金・エアドロ）
  const onlyPureTransfer = [...invokedProgramIds].every(id => PURE_TRANSFER_PROGRAMS.has(id));
  if (onlyPureTransfer) return null;

  // ② 既知DEXプログラムが関与 → 確実にスワップ
  const knownDex = [...invokedProgramIds].find(id => ALL_KNOWN_LABELS[id]);
  if (knownDex) return diffRaw > 0 ? "buy" : "sell";

  // ③ 未知プログラムが関与 → 非INMUトークンの残高変化のみでスワップ判定
  //    SOL変化のみでは判定しない（ATA作成・手数料等で誤検知が起きるため）
  const preOtherMap = new Map<string, number>();
  const postOtherMap = new Map<string, number>();
  for (const b of preTokenBalances) {
    if (b.mint !== INMU_TOKEN_MINT) {
      preOtherMap.set(`${b.accountIndex}:${b.mint}`, Number(b.uiTokenAmount.amount));
    }
  }
  for (const b of postTokenBalances) {
    if (b.mint !== INMU_TOKEN_MINT) {
      postOtherMap.set(`${b.accountIndex}:${b.mint}`, Number(b.uiTokenAmount.amount));
    }
  }
  const allOtherKeys = new Set([...preOtherMap.keys(), ...postOtherMap.keys()]);
  for (const key of allOtherKeys) {
    const pre = preOtherMap.get(key) ?? 0;
    const post = postOtherMap.get(key) ?? 0;
    if (Math.abs(post - pre) > 0) {
      // 他トークン（USDC等）の変化あり → スワップと判定
      return diffRaw > 0 ? "buy" : "sell";
    }
  }

  // INMUのみ移動 / 対価トークン変化なし → 通常送金・エアドロとして扱わない
  return null;
}

// ── トランザクションから呼び出されたプログラムIDセットを収集 ──
function collectInvokedPrograms(tx: ParsedTx, accountKeys: string[]): Set<string> {
  const ids = new Set<string>();
  for (const ix of (tx.transaction.message.instructions ?? [])) {
    const prog = accountKeys[ix.programIdIndex];
    if (prog) ids.add(prog);
  }
  for (const inner of (tx.meta.innerInstructions ?? [])) {
    for (const ix of inner.instructions) {
      const prog = accountKeys[ix.programIdIndex];
      if (prog) ids.add(prog);
    }
  }
  return ids;
}

// ── プロフィール統計を再計算して保存 ──
async function updateProfileStats(userId: string) {
  const [[buyRow], [sellRow], [latestBuy], [latestSell]] = await Promise.all([
    db.select({ total: sql<string>`coalesce(sum(cast("tokenAmount" as numeric)), '0')` })
      .from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"))),
    db.select({ total: sql<string>`coalesce(sum(cast("tokenAmount" as numeric)), '0')` })
      .from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "sell"))),
    db.select({ tradedAt: tradeHistoryTable.tradedAt })
      .from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy")))
      .orderBy(sql`${tradeHistoryTable.tradedAt} desc`)
      .limit(1),
    db.select({ tradedAt: tradeHistoryTable.tradedAt })
      .from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "sell")))
      .orderBy(sql`${tradeHistoryTable.tradedAt} desc`)
      .limit(1),
  ]);
  await db.update(profileTable).set({
    totalBought: buyRow?.total ?? "0",
    totalSold:   sellRow?.total ?? "0",
    lastBuyAt:   latestBuy?.tradedAt ?? null,
    lastSellAt:  latestSell?.tradedAt ?? null,
    updatedAt:   new Date(),
  }).where(eq(profileTable.userId, userId));
}

const TX_FETCH_CONCURRENCY = 5;

async function doScanTrades(
  userId: string,
  walletAddress: string,
): Promise<{ added: number; total: number; skipped: number }> {
  const t0 = Date.now();

  const [existingRows, tokenAccounts] = await Promise.all([
    db.select({ txSignature: tradeHistoryTable.txSignature })
      .from(tradeHistoryTable)
      .where(eq(tradeHistoryTable.userId, userId)),
    fetchTokenAccountAddresses(walletAddress),
  ]);

  const existingSet = new Set(existingRows.map((e) => e.txSignature));
  if (tokenAccounts.length === 0) return { added: 0, total: existingSet.size, skipped: 0 };

  let added = 0;
  let skipped = 0;

  for (const tokenAccount of tokenAccounts) {
    let signatures: Awaited<ReturnType<typeof fetchSignatures>>;
    try {
      signatures = await fetchSignatures(tokenAccount, 200);
    } catch (e) {
      console.warn("[Scan] fetchSignatures failed:", e);
      continue;
    }

    const newSigs = signatures.filter(
      (s) => s.err === null && s.blockTime !== null && !existingSet.has(s.signature),
    );
    if (newSigs.length === 0) continue;

    for (let i = 0; i < newSigs.length; i += TX_FETCH_CONCURRENCY) {
      const batch = newSigs.slice(i, i + TX_FETCH_CONCURRENCY);
      const txResults = await Promise.allSettled(batch.map((s) => fetchTransaction(s.signature)));

      for (let j = 0; j < batch.length; j++) {
        const sigInfo = batch[j];
        const result  = txResults[j];
        const tx      = result.status === "fulfilled" ? result.value : null;
        if (!tx || tx.meta?.err !== null) continue;

        // アカウントキー（静的 + ALT）
        const staticKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
        const altWritable: string[] = tx.meta.loadedAddresses?.writable ?? [];
        const altReadonly: string[] = tx.meta.loadedAddresses?.readonly ?? [];
        const accountKeys = [...staticKeys, ...altWritable, ...altReadonly];

        // INMUトークンアカウントのインデックスを特定
        const tokenIdx = accountKeys.indexOf(tokenAccount);
        if (tokenIdx === -1) continue;

        // INMU残高差分を計算
        const preBal = (tx.meta.preTokenBalances ?? []).find(
          (b) => b.accountIndex === tokenIdx && b.mint === INMU_TOKEN_MINT,
        );
        const postBal = (tx.meta.postTokenBalances ?? []).find(
          (b) => b.accountIndex === tokenIdx && b.mint === INMU_TOKEN_MINT,
        );
        const preRaw  = preBal  ? Number(preBal.uiTokenAmount.amount)  : 0;
        const postRaw = postBal ? Number(postBal.uiTokenAmount.amount) : 0;
        const diffRaw = postRaw - preRaw;
        if (diffRaw === 0) continue;

        // 呼び出されたプログラムIDを収集
        const invokedProgramIds = collectInvokedPrograms(tx, accountKeys);

        // DEXスワップ判定
        const swapType = classifySwapType({
          diffRaw,
          accountKeys,
          invokedProgramIds,
          preBalances:      tx.meta.preBalances  ?? [],
          postBalances:     tx.meta.postBalances ?? [],
          preTokenBalances:  tx.meta.preTokenBalances  ?? [],
          postTokenBalances: tx.meta.postTokenBalances ?? [],
          walletAddress,
        });

        if (swapType === null) {
          // 通常送金・エアドロ → 購入/売却履歴に含めない
          existingSet.add(sigInfo.signature); // 次回スキャンで再チェックしない
          skipped++;
          continue;
        }

        // DEXラベル
        const matchedProgram = [...invokedProgramIds].find((k) => ALL_KNOWN_LABELS[k]);
        const dexLabel = matchedProgram ? ALL_KNOWN_LABELS[matchedProgram] : "DEX";
        const tokenAmount = (Math.abs(diffRaw) / Math.pow(10, INMU_DECIMALS)).toString();

        try {
          await db.insert(tradeHistoryTable).values({
            userId,
            walletAddress,
            type: swapType,
            tokenAmount,
            txSignature: sigInfo.signature,
            dex: dexLabel,
            tradedAt: new Date(sigInfo.blockTime! * 1000),
          });
          existingSet.add(sigInfo.signature);
          added++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("unique") && !msg.includes("duplicate")) {
            console.warn("[Scan] insert error:", e);
          }
        }
      }
    }
  }

  await updateProfileStats(userId);

  const elapsed = Date.now() - t0;
  console.info(`[Scan] userId=${userId} added=${added} skipped=${skipped} elapsed=${elapsed}ms`);
  return { added, total: existingSet.size, skipped };
}

// ── 既存取引履歴の再分類（誤分類をtransferに更新） ──
async function doReclassifyTrades(
  userId: string,
  walletAddress: string,
): Promise<{ reclassified: number; unchanged: number; failed: number }> {
  const t0 = Date.now();

  // buy / sell のみ対象（transfer はすでに除外済み）
  const existing = await db
    .select({ id: tradeHistoryTable.id, txSignature: tradeHistoryTable.txSignature, type: tradeHistoryTable.type })
    .from(tradeHistoryTable)
    .where(and(
      eq(tradeHistoryTable.userId, userId),
      sql`${tradeHistoryTable.type} IN ('buy', 'sell')`,
    ));

  if (existing.length === 0) return { reclassified: 0, unchanged: 0, failed: 0 };

  // トークンアカウントを取得（walletAddressを使う）
  let tokenAccounts: string[] = [];
  try {
    tokenAccounts = await fetchTokenAccountAddresses(walletAddress);
  } catch (e) {
    console.warn("[Reclassify] fetchTokenAccountAddresses failed:", e);
    // トークンアカウントが取れなくても、accountKeysからwalletAddressで判定する
  }

  let reclassified = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < existing.length; i += TX_FETCH_CONCURRENCY) {
    const batch = existing.slice(i, i + TX_FETCH_CONCURRENCY);
    const txResults = await Promise.allSettled(batch.map((r) => fetchTransaction(r.txSignature)));

    for (let j = 0; j < batch.length; j++) {
      const record = batch[j];
      const result = txResults[j];

      if (result.status === "rejected") {
        // RPC失敗（古いTX等）→ 変更しない
        failed++;
        continue;
      }

      const tx = result.value;
      if (!tx || tx.meta?.err !== null) {
        failed++;
        continue;
      }

      const staticKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
      const altWritable: string[] = tx.meta.loadedAddresses?.writable ?? [];
      const altReadonly: string[] = tx.meta.loadedAddresses?.readonly ?? [];
      const accountKeys = [...staticKeys, ...altWritable, ...altReadonly];

      // INMUトークンアカウントのインデックスを特定
      // walletAddressが保有するトークンアカウント or walletAddress自体を探す
      const candidateAccounts = [...new Set([...tokenAccounts, walletAddress])];
      let tokenIdx = -1;
      let diffRaw = 0;

      for (const candidate of candidateAccounts) {
        const idx = accountKeys.indexOf(candidate);
        if (idx === -1) continue;
        const preBal = (tx.meta.preTokenBalances ?? []).find(
          (b) => b.accountIndex === idx && b.mint === INMU_TOKEN_MINT,
        );
        const postBal = (tx.meta.postTokenBalances ?? []).find(
          (b) => b.accountIndex === idx && b.mint === INMU_TOKEN_MINT,
        );
        const pre  = preBal  ? Number(preBal.uiTokenAmount.amount)  : 0;
        const post = postBal ? Number(postBal.uiTokenAmount.amount) : 0;
        const diff = post - pre;
        if (diff !== 0) { tokenIdx = idx; diffRaw = diff; break; }
      }

      if (tokenIdx === -1) {
        // INMU変化が見つからない → 再分類できない
        failed++;
        continue;
      }

      const invokedProgramIds = collectInvokedPrograms(tx, accountKeys);
      const newType = classifySwapType({
        diffRaw,
        accountKeys,
        invokedProgramIds,
        preBalances:       tx.meta.preBalances  ?? [],
        postBalances:      tx.meta.postBalances ?? [],
        preTokenBalances:  tx.meta.preTokenBalances  ?? [],
        postTokenBalances: tx.meta.postTokenBalances ?? [],
        walletAddress,
      });

      if (newType === null) {
        // 通常送金と判定 → typeを"transfer"に更新（削除しない）
        await db.update(tradeHistoryTable)
          .set({ type: "transfer" })
          .where(eq(tradeHistoryTable.id, record.id));
        reclassified++;
      } else if (newType !== record.type) {
        // buy↔sell の変更（稀だが念のため）
        await db.update(tradeHistoryTable)
          .set({ type: newType })
          .where(eq(tradeHistoryTable.id, record.id));
        reclassified++;
      } else {
        unchanged++;
      }
    }
  }

  await updateProfileStats(userId);

  const elapsed = Date.now() - t0;
  console.info(`[Reclassify] userId=${userId} reclassified=${reclassified} unchanged=${unchanged} failed=${failed} elapsed=${elapsed}ms`);
  return { reclassified, unchanged, failed };
}

// ── RPC プロキシ ──
router.get("/solana/rpc-proxy", (_req, res): void => {
  res.json({ jsonrpc: "2.0", result: "ok", id: null });
});

router.post("/solana/rpc-proxy", async (req, res): Promise<void> => {
  try {
    const rpcRes = await rpcFetch(req.body);
    const data = await rpcRes.json();
    res.json(data);
  } catch (e) {
    console.error("[Solana/Proxy] RPC proxy error:", e);
    res.status(502).json({ error: "RPC proxy error", message: e instanceof Error ? e.message : String(e) });
  }
});

// ── ユーザー用: INMU残高取得 ──
router.get("/solana/inmu-balance", requireAuth, async (req, res): Promise<void> => {
  const wallet = req.query.wallet as string | undefined;
  if (!wallet) { res.status(400).json({ error: "wallet query param required" }); return; }
  try {
    const balance = await fetchInmuBalance(wallet);
    res.json({ balance });
  } catch (e) {
    console.error("[Solana] Failed to fetch INMU token balance:", e);
    res.status(502).json({ error: "Failed to reach Solana RPC", balance: 0 });
  }
});

// ── 管理者用: INMU残高取得 ──
router.get("/admin/solana/inmu-balance", requireAdmin, async (req, res): Promise<void> => {
  const wallet = req.query.wallet as string | undefined;
  if (!wallet) { res.status(400).json({ error: "wallet query param required" }); return; }
  try {
    const balance = await fetchInmuBalance(wallet);
    res.json({ balance });
  } catch (e) {
    console.error("[Solana/Admin] Failed to fetch INMU token balance:", e);
    res.status(502).json({ error: "Failed to reach Solana RPC", balance: 0 });
  }
});

// ── ユーザー用: DEX取引スキャン ──
router.post("/solana/scan-trades", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const [profile] = await db
      .select({ solWallet: profileTable.solWallet })
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .limit(1);

    if (!profile?.solWallet) {
      res.status(400).json({ error: "SOLウォレットが登録されていません" });
      return;
    }

    const result = await doScanTrades(userId, profile.solWallet);
    res.json(result);
  } catch (e) {
    console.error("[Scan] Unexpected error:", e);
    res.status(500).json({ error: "スキャン中にエラーが発生しました", added: 0, skipped: 0 });
  }
});

// ── 管理者用: 対象ユーザーのDEX取引スキャン ──
router.post("/admin/solana/scan-trades", requireAdmin, async (req, res): Promise<void> => {
  const { targetUserId } = req.body as { targetUserId?: string };
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  try {
    const [profile] = await db
      .select({ solWallet: profileTable.solWallet })
      .from(profileTable)
      .where(eq(profileTable.userId, targetUserId))
      .limit(1);
    if (!profile?.solWallet) { res.status(400).json({ error: "SOLウォレット未登録" }); return; }
    const result = await doScanTrades(targetUserId, profile.solWallet);
    res.json(result);
  } catch (e) {
    console.error("[Admin/Scan] error:", e);
    res.status(500).json({ error: "スキャンエラー" });
  }
});

// ── 管理者用: 既存取引履歴の再分類（通常送金を除外） ──
router.post("/admin/solana/reclassify-trades", requireAdmin, async (req, res): Promise<void> => {
  const { targetUserId } = req.body as { targetUserId?: string };
  if (!targetUserId) { res.status(400).json({ error: "targetUserId required" }); return; }
  try {
    const [profile] = await db
      .select({ solWallet: profileTable.solWallet })
      .from(profileTable)
      .where(eq(profileTable.userId, targetUserId))
      .limit(1);
    if (!profile?.solWallet) { res.status(400).json({ error: "SOLウォレット未登録" }); return; }
    const result = await doReclassifyTrades(targetUserId, profile.solWallet);
    res.json(result);
  } catch (e) {
    console.error("[Admin/Reclassify] error:", e);
    res.status(500).json({ error: "再分類エラー" });
  }
});

// ── INMU価格取得（Jupiter + ExchangeRate） ──
let priceCache: { usdPrice: number; jpyRate: number; cachedAt: number } | null = null;
const PRICE_CACHE_MS = 5 * 60 * 1000;

router.get("/solana/inmu-price", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const now = Date.now();
    if (priceCache && now - priceCache.cachedAt < PRICE_CACHE_MS) {
      res.json({ usdPrice: priceCache.usdPrice, jpyRate: priceCache.jpyRate });
      return;
    }

    const [jupRes, fxRes] = await Promise.all([
      fetch(`https://lite-api.jup.ag/price/v2?ids=${INMU_TOKEN_MINT}`).catch(() => null),
      fetch("https://open.er-api.com/v6/latest/USD").catch(() => null),
    ]);

    let usdPrice = 0;
    if (jupRes?.ok) {
      const jupData = await jupRes.json() as { data?: Record<string, { price?: string }> };
      const tokenData = jupData?.data?.[INMU_TOKEN_MINT];
      usdPrice = tokenData?.price ? parseFloat(tokenData.price) : 0;
    }

    let jpyRate = 150;
    if (fxRes?.ok) {
      const fxData = await fxRes.json() as { rates?: Record<string, number> };
      jpyRate = fxData?.rates?.JPY ?? 150;
    }

    priceCache = { usdPrice, jpyRate, cachedAt: now };
    res.json({ usdPrice, jpyRate });
  } catch {
    res.status(502).json({ error: "価格取得に失敗しました", usdPrice: 0, jpyRate: 150 });
  }
});

export default router;
