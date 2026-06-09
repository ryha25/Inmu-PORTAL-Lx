import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, tradeHistoryTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
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
  "https://rpc.hellomoon.io/public",
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

async function fetchSignatures(tokenAccountAddr: string, limit = 50) {
  const res = await rpcFetch({
    jsonrpc: "2.0",
    id: 1,
    method: "getSignaturesForAddress",
    params: [tokenAccountAddr, { limit }],
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
      meta: { err: unknown; preTokenBalances: TokenBalance[]; postTokenBalances: TokenBalance[] };
      transaction: { message: { accountKeys: string[] } };
    } | null;
    error?: { message: string };
  };
  if (data.error) throw new Error(data.error.message);
  return data.result ?? null;
}

async function doScanTrades(userId: string, walletAddress: string): Promise<{ added: number; total: number }> {
  const existing = await db
    .select({ txSignature: tradeHistoryTable.txSignature })
    .from(tradeHistoryTable)
    .where(eq(tradeHistoryTable.userId, userId));
  const existingSet = new Set(existing.map((e) => e.txSignature));

  const tokenAccounts = await fetchTokenAccountAddresses(walletAddress);
  if (tokenAccounts.length === 0) return { added: 0, total: 0 };

  let added = 0;

  for (const tokenAccount of tokenAccounts) {
    let signatures: Awaited<ReturnType<typeof fetchSignatures>>;
    try {
      signatures = await fetchSignatures(tokenAccount, 100);
    } catch (e) {
      console.warn("[Scan] fetchSignatures failed:", e);
      continue;
    }

    const newSigs = signatures
      .filter((s) => s.err === null && s.blockTime !== null && !existingSet.has(s.signature))
      .slice(0, 30);

    for (const sigInfo of newSigs) {
      const tx = await fetchTransaction(sigInfo.signature).catch(() => null);
      if (!tx || tx.meta?.err !== null) continue;

      const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
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

  const allTrades = await db
    .select()
    .from(tradeHistoryTable)
    .where(eq(tradeHistoryTable.userId, userId));

  const totalBought = allTrades.filter((t) => t.type === "buy").reduce((s, t) => s + Number(t.tokenAmount), 0);
  const totalSold = allTrades.filter((t) => t.type === "sell").reduce((s, t) => s + Number(t.tokenAmount), 0);
  const buyTrades = allTrades.filter((t) => t.type === "buy").sort((a, b) => b.tradedAt.getTime() - a.tradedAt.getTime());
  const sellTrades = allTrades.filter((t) => t.type === "sell").sort((a, b) => b.tradedAt.getTime() - a.tradedAt.getTime());

  await db
    .update(profileTable)
    .set({
      totalBought: String(totalBought),
      totalSold: String(totalSold),
      lastBuyAt: buyTrades[0]?.tradedAt ?? null,
      lastSellAt: sellTrades[0]?.tradedAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(profileTable.userId, userId));

  return { added, total: allTrades.length };
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
