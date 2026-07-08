import { Router } from "express";
import { db } from "@workspace/db";
import {
  profileTable,
  loginStreaksTable,
  transactionsTable,
  missionParticipationsTable,
  pointsTable,
} from "@workspace/db/schema";
import { eq, sql, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";

async function fetchOnChainInmuBalance(wallet: string): Promise<number | null> {
  const rpcUrl = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccountsByOwner",
        params: [wallet, { mint: INMU_TOKEN_MINT }, { encoding: "jsonParsed" }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: { value?: Array<{ account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } } } }> }
    };
    const accounts = data.result?.value ?? [];
    let total = 0;
    for (const a of accounts) {
      total += a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}

router.get("/community", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const receivedRow = await db
      .select({
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(
        sql`${transactionsTable.userId} = ${userId} AND ${transactionsTable.type} IN ('airdrop', 'reward', 'mission_reward')`,
      )
      .then((r) => r[0]);
    const totalReceivedInmu = Math.max(0, Number(receivedRow?.total ?? 0));

    // 総合評価ランキング（/ranking/composite と完全同一ロジック）
    // スコア = INMU保有量(40%) + ポイント保有量(40%) + ミッションクリア数(20%)
    const [allProfiles, clearRows, cumulativeRow] = await Promise.all([
      db.select({
        userId: profileTable.userId,
        balance: profileTable.balance,
        solWallet: profileTable.solWallet,
        monthlyPoints: profileTable.monthlyPoints,
      }).from(profileTable).where(ne(profileTable.displayName, 'ガチャテスト')),
      db.select({
        userId: missionParticipationsTable.userId,
        count: sql<string>`count(*)`,
      })
        .from(missionParticipationsTable)
        .where(eq(missionParticipationsTable.status, "rewarded"))
        .groupBy(missionParticipationsTable.userId),
      db.select({
        total: sql<string>`coalesce(sum(cast(${pointsTable.amount} as numeric)), '0')`,
      })
        .from(pointsTable)
        .where(sql`${pointsTable.userId} = ${userId} AND cast(${pointsTable.amount} as numeric) > 0`)
        .then((r) => r[0]),
    ]);
    const cumulativePoints = Math.max(0, Number(cumulativeRow?.total ?? 0));

    const totalUsers = allProfiles.length;
    const clearMap = new Map(clearRows.map((c) => [c.userId, Number(c.count)]));

    // オンチェーン残高を並列取得（タイムアウト付き）
    const onChainResults = await Promise.allSettled(
      allProfiles.map((p) =>
        p.solWallet ? fetchOnChainInmuBalance(p.solWallet) : Promise.resolve(null)
      )
    );

    const inmuValues  = allProfiles.map((p, i) => {
      const onChain = onChainResults[i].status === "fulfilled" ? onChainResults[i].value : null;
      return Math.max(0, onChain ?? Number(p.balance));
    });
    const pointValues = allProfiles.map((p) => Math.max(0, Number(p.monthlyPoints)));
    const clearValues = allProfiles.map((p) => clearMap.get(p.userId) ?? 0);

    const maxInmu   = Math.max(...inmuValues,  1);
    const maxPoints = Math.max(...pointValues, 1);
    const maxClears = Math.max(...clearValues, 1);

    const entries = allProfiles.map((p, i) => {
      const score =
        (inmuValues[i]  / maxInmu)   * 40 +
        (pointValues[i] / maxPoints) * 40 +
        (clearValues[i] / maxClears) * 20;
      return { userId: p.userId, score };
    });

    entries.sort((a, b) => b.score - a.score);
    const rank = (entries.findIndex((e) => e.userId === userId) + 1) || totalUsers;

    const streak = await db
      .select()
      .from(loginStreaksTable)
      .where(eq(loginStreaksTable.userId, userId))
      .then((r) => r[0]);

    res.json({
      participations: profile.participationCount,
      receiveCount: profile.participationCount,
      totalReceivedInmu,
      rank,
      totalUsers,
      monthlyPoints: cumulativePoints,
      loginStreak: streak?.streak ?? 0,
    });
  } catch (e) {
    console.error("[Community]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
