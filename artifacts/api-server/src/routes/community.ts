import { Router } from "express";
import { db } from "@workspace/db";
import {
  profileTable,
  loginStreaksTable,
  transactionsTable,
  missionParticipationsTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

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
    const [allProfiles, clearRows] = await Promise.all([
      db.select({
        userId: profileTable.userId,
        totalBought: profileTable.totalBought,
        totalSold: profileTable.totalSold,
        monthlyPoints: profileTable.monthlyPoints,
      }).from(profileTable),
      db.select({
        userId: missionParticipationsTable.userId,
        count: sql<string>`count(*)`,
      })
        .from(missionParticipationsTable)
        .where(eq(missionParticipationsTable.status, "rewarded"))
        .groupBy(missionParticipationsTable.userId),
    ]);

    const totalUsers = allProfiles.length;
    const clearMap = new Map(clearRows.map((c) => [c.userId, Number(c.count)]));

    const inmuValues  = allProfiles.map((p) => Math.max(0, Number(p.totalBought) - Number(p.totalSold)));
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
      monthlyPoints: Number(profile.monthlyPoints),
      loginStreak: streak?.streak ?? 0,
    });
  } catch (e) {
    console.error("[Community]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
