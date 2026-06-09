import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, transactionsTable } from "@workspace/db/schema";
import { sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

function getRpcEndpoints(): string[] {
  const custom = process.env.SOLANA_RPC;
  const defaults = [
    "https://api.mainnet-beta.solana.com",
  ];
  return custom ? [custom, ...defaults] : defaults;
}

async function fetchInmuBalance(wallet: string): Promise<number | null> {
  for (const url of getRpcEndpoints()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTokenAccountsByOwner",
          params: [
            wallet,
            { mint: INMU_TOKEN_MINT },
            { encoding: "jsonParsed" },
          ],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        result?: {
          value?: Array<{
            account: {
              data: { parsed: { info: { tokenAmount: { amount: string } } } };
            };
          }>;
        };
      };
      const accounts = data.result?.value ?? [];
      const totalRaw = accounts.reduce(
        (s, a) => s + Number(a.account.data.parsed.info.tokenAmount.amount),
        0,
      );
      return Math.max(0, totalRaw / Math.pow(10, INMU_DECIMALS));
    } catch {
      continue;
    }
  }
  return null;
}

const router = Router();

router.get("/ranking", requireAuth, async (_req, res): Promise<void> => {
  try {
    const profiles = await db.select().from(profileTable).limit(200);

    const receivedRows = await db
      .select({
        userId: transactionsTable.userId,
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.type, ["airdrop", "reward"]))
      .groupBy(transactionsTable.userId);

    const receivedMap = new Map(
      receivedRows.map((r) => [r.userId, Math.max(0, Number(r.total))]),
    );

    const balanceResults = await Promise.allSettled(
      profiles.map(async (p) => {
        if (!p.solWallet) return { userId: p.userId, balance: null };
        const balance = await fetchInmuBalance(p.solWallet);
        return { userId: p.userId, balance };
      }),
    );

    const balanceMap = new Map<string, number | null>();
    for (const r of balanceResults) {
      if (r.status === "fulfilled") {
        balanceMap.set(r.value.userId, r.value.balance);
      }
    }

    const entries = profiles.map((p) => {
      const realBalance = balanceMap.get(p.userId);
      const balance =
        realBalance !== null && realBalance !== undefined
          ? realBalance
          : Math.max(0, Number(p.totalBought) - Number(p.totalSold));
      return {
        userId: p.userId,
        displayName: p.displayName,
        balance,
        totalReceived: receivedMap.get(p.userId) ?? 0,
        participations: p.participationCount,
      };
    });

    entries.sort((a, b) => b.balance - a.balance);
    const top100 = entries.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));

    res.json(top100);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/ranking/points", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(profileTable)
      .orderBy(sql`${profileTable.monthlyPoints} DESC`)
      .limit(100);

    res.json(
      rows.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        displayName: p.displayName,
        points: Number(p.monthlyPoints),
        participations: p.participationCount,
      })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
