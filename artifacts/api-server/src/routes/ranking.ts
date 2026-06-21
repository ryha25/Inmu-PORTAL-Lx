import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, transactionsTable, missionParticipationsTable } from "@workspace/db/schema";
import { sql, inArray, eq } from "drizzle-orm";
import { requireAuthOrAdmin } from "../middlewares/session";

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

router.get("/ranking", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const profiles = await db.select().from(profileTable).limit(200);

    const receivedRows = await db
      .select({
        userId: transactionsTable.userId,
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.type, ["airdrop", "reward", "mission_reward"]))
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
        showBalance: p.showBalance,
        totalReceived: receivedMap.get(p.userId) ?? 0,
        participations: p.participationCount,
      };
    });

    entries.sort((a, b) => b.balance - a.balance);
    const top100 = entries.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));

    res.set("Cache-Control", "no-store");
    res.json(top100);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/ranking/points", requireAuthOrAdmin, async (_req, res): Promise<void> => {
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

// 総合評価ランキング: INMU保有量(40%) + ポイント保有量(40%) + ミッションクリア数(20%)
router.get("/ranking/composite", requireAuthOrAdmin, async (req, res): Promise<void> => {
  const currentUserId = req.userId;
  try {
    const [allProfiles, clearRows] = await Promise.all([
      db.select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        balance: profileTable.balance,
        monthlyPoints: profileTable.monthlyPoints,
        showBalance: profileTable.showBalance,
        participationCount: profileTable.participationCount,
      }).from(profileTable).limit(500),
      db.select({
        userId: missionParticipationsTable.userId,
        count: sql<string>`count(*)`,
      })
        .from(missionParticipationsTable)
        .where(eq(missionParticipationsTable.status, "rewarded"))
        .groupBy(missionParticipationsTable.userId),
    ]);

    const clearMap = new Map(clearRows.map((c) => [c.userId, Number(c.count)]));

    const maxBalance = Math.max(...allProfiles.map((p) => Number(p.balance)), 1);
    const maxPoints = Math.max(...allProfiles.map((p) => Number(p.monthlyPoints)), 1);
    const maxClears = Math.max(...[...clearMap.values()], 1);

    const entries = allProfiles.map((p) => {
      const bal = Number(p.balance);
      const pts = Number(p.monthlyPoints);
      const cls = clearMap.get(p.userId) ?? 0;
      const score =
        (bal / maxBalance) * 40 +
        (pts / maxPoints) * 40 +
        (cls / maxClears) * 20;
      return {
        userId: p.userId,
        displayName: p.displayName,
        balance: bal,
        points: pts,
        clears: cls,
        participations: p.participationCount,
        showBalance: p.showBalance,
        score,
      };
    });

    entries.sort((a, b) => b.score - a.score);

    const totalUsers = entries.length;
    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

    let myRank: number | null = null;
    let myEntry = null;
    if (currentUserId) {
      const found = ranked.find((r) => r.userId === currentUserId);
      myRank = found?.rank ?? totalUsers;
      myEntry = found ?? null;
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ranking: ranked.slice(0, 100),
      myRank,
      myEntry,
      totalUsers,
    });
  } catch (e) {
    console.error("[Ranking/Composite]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
