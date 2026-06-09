import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, tradeHistoryTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

const DEX_PROGRAMS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP",
  "LBUZKhRxPF3XUpBCjp4YzTKgLLjLssfyqieAsxSLqqe",
]);

const DEX_LABELS: Record<string, string> = {
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": "Jupiter",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": "Orca",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca",
  "LBUZKhRxPF3XUpBCjp4YzTKgLLjLssfyqieAsxSLqqe": "Meteora",
};

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

async function fetchInmuBalance(wallet: string): Promise<number> {
  const res = await rpcFetch({
    jsonrpc: "2.0",
    id: 1,
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
    jsonrpc: "2.0",
    id: 1,
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
    jsonrpc: "2.0",
    id: 1,
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

async function fetchTransaction(sig: string) {
  const res = await rpcFetch({
    jsonrpc: "2.0",
    id: 1,
    method: "getTransaction",
    params: [sig, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
  });
  const data = await res.json() as {
    result?: {
      blockTime: number | null;
      meta: {
        err: unknown;
        preTokenBalances: TokenBalance[];
        postTokenBalances: TokenBalance[];
        // バージョン付きトランザクション（ALT）でロードされたアカウント
        loadedAddresses?: { writable: string[]; readonly: string[] };
      };
      transaction: { message: { accountKeys: string[] } };
    } | null;
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  return data.result ?? null;
}

// 並列TX取得のバッチサイズ
const TX_FETCH_CONCURRENCY = 5;

async function doScanTrades(userId: string, walletAddress: string): Promise<{ added: number; total: number; differential: boolean }> {
  const t0 = Date.now();

  // ① 既存シグネチャ一覧 と トークンアカウント を並列取得
  const [existingRows, tokenAccounts] = await Promise.all([
    db.select({ txSignature: tradeHistoryTable.txSignature, tradedAt: tradeHistoryTable.tradedAt })
      .from(tradeHistoryTable)
      .where(eq(tradeHistoryTable.userId, userId)),
    fetchTokenAccountAddresses(walletAddress),
  ]);

  const existingSet = new Set(existingRows.map((e) => e.txSignature));
  if (tokenAccounts.length === 0) return { added: 0, total: existingSet.size, differential: false };

  // ② 差分取得のアンカー: 最新既知シグネチャを "until" に使う
  //    → 次回スキャンでその署名以前は読まなくて済む
  const latestKnown = existingRows.sort((a, b) => b.tradedAt.getTime() - a.tradedAt.getTime())[0];
  const untilSig = latestKnown?.txSignature;
  const differential = !!untilSig;

  let added = 0;

  for (const tokenAccount of tokenAccounts) {
    let signatures: Awaited<ReturnType<typeof fetchSignatures>>;
    try {
      // "until" を渡すと、その署名より新しいものだけを返す（差分取得）
      signatures = await fetchSignatures(tokenAccount, 100, untilSig);
    } catch (e) {
      console.warn("[Scan] fetchSignatures failed:", e);
      continue;
    }

    const newSigs = signatures.filter(
      (s) => s.err === null && s.blockTime !== null && !existingSet.has(s.signature),
    );

    if (newSigs.length === 0) continue;

    // ③ TX を並列バッチ取得（直列30回 → 並列5本ずつ）
    for (let i = 0; i < newSigs.length; i += TX_FETCH_CONCURRENCY) {
      const batch = newSigs.slice(i, i + TX_FETCH_CONCURRENCY);
      const txResults = await Promise.allSettled(batch.map((s) => fetchTransaction(s.signature)));

      for (let j = 0; j < batch.length; j++) {
        const sigInfo = batch[j];
        const result = txResults[j];
        const tx = result.status === "fulfilled" ? result.value : null;
        if (!tx || tx.meta?.err !== null) continue;

        // 静的アカウント + ALT（アドレスルックアップテーブル）でロードされたアカウントを結合
        // Jupiter等のバージョン付きTXではINMUトークンアカウントがALT経由で参照される
        const staticKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
        const altWritable: string[] = tx.meta.loadedAddresses?.writable ?? [];
        const altReadonly: string[] = tx.meta.loadedAddresses?.readonly ?? [];
        const accountKeys = [...staticKeys, ...altWritable, ...altReadonly];

        const matchedDex = accountKeys.find((k) => DEX_PROGRAMS.has(k));
        if (!matchedDex) continue;

        const tokenIdx = accountKeys.indexOf(tokenAccount);
        if (tokenIdx === -1) continue;

        const preBal = (tx.meta.preTokenBalances ?? []).find(
          (b) => b.accountIndex === tokenIdx && b.mint === INMU_TOKEN_MINT,
        );
        const postBal = (tx.meta.postTokenBalances ?? []).find(
          (b) => b.accountIndex === tokenIdx && b.mint === INMU_TOKEN_MINT,
        );

        const preRaw = preBal ? Number(preBal.uiTokenAmount.amount) : 0;
        const postRaw = postBal ? Number(postBal.uiTokenAmount.amount) : 0;
        const diffRaw = postRaw - preRaw;
        if (diffRaw === 0) continue;

        const type = diffRaw > 0 ? "buy" : "sell";
        const tokenAmount = (Math.abs(diffRaw) / Math.pow(10, INMU_DECIMALS)).toString();

        try {
          await db.insert(tradeHistoryTable).values({
            userId,
            walletAddress,
            type,
            tokenAmount,
            txSignature: sigInfo.signature,
            dex: DEX_LABELS[matchedDex] ?? "DEX",
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

  // ④ 統計を SQL 集計で並列取得（全行読み込みを廃止）
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
    totalSold: sellRow?.total ?? "0",
    lastBuyAt: latestBuy?.tradedAt ?? null,
    lastSellAt: latestSell?.tradedAt ?? null,
    updatedAt: new Date(),
  }).where(eq(profileTable.userId, userId));

  const elapsed = Date.now() - t0;
  console.info(`[Scan] userId=${userId} added=${added} total=${existingSet.size + added} differential=${differential} elapsed=${elapsed}ms`);

  return { added, total: existingSet.size + added, differential };
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
    console.info(`[Scan] userId=${userId} added=${result.added}`);
    res.json(result);
  } catch (e) {
    console.error("[Scan] Unexpected error:", e);
    res.status(500).json({ error: "スキャン中にエラーが発生しました", added: 0 });
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

export default router;
