import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

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
    params: [
      wallet,
      { mint: INMU_TOKEN_MINT },
      { encoding: "jsonParsed" },
    ],
  });

  const data = await res.json() as {
    result?: {
      value?: Array<{
        account: {
          data: {
            parsed: {
              info: {
                tokenAmount: {
                  amount: string;
                  decimals: number;
                  uiAmount: number | null;
                };
              };
            };
          };
        };
      }>;
    };
    error?: { message: string; code?: number };
  };

  if (data.error) {
    console.error("[Solana] RPC returned error:", data.error);
    throw new Error(data.error.message);
  }

  const accounts = data.result?.value ?? [];
  if (accounts.length === 0) return 0;

  const totalRaw = accounts.reduce((sum, acct) => {
    const raw = acct.account.data.parsed.info.tokenAmount.amount;
    return sum + Number(raw);
  }, 0);

  return totalRaw / Math.pow(10, INMU_DECIMALS);
}

// ── RPC プロキシ (フロントエンドからの Solana JSON-RPC を中継) ──
// 秘密鍵不要。blockhash取得・トランザクション送信のみ対応。
// GET: @solana/web3.js の WebSocket 接続試行を無害に返す
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
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  try {
    const balance = await fetchInmuBalance(wallet);
    console.info(`[Solana] wallet=${wallet} INMU balance=${balance}`);
    res.json({ balance });
  } catch (e) {
    console.error("[Solana] Failed to fetch INMU token balance:", e);
    res.status(502).json({ error: "Failed to reach Solana RPC", balance: 0 });
  }
});

// ── 管理者用: INMU残高取得 ──
router.get("/admin/solana/inmu-balance", requireAdmin, async (req, res): Promise<void> => {
  const wallet = req.query.wallet as string | undefined;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  try {
    const balance = await fetchInmuBalance(wallet);
    console.info(`[Solana/Admin] wallet=${wallet} INMU balance=${balance}`);
    res.json({ balance });
  } catch (e) {
    console.error("[Solana/Admin] Failed to fetch INMU token balance:", e);
    res.status(502).json({ error: "Failed to reach Solana RPC", balance: 0 });
  }
});

export default router;
