import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, loginStreaksTable, transactionsTable } from "@workspace/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
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

    // トランザクションテーブルから累計受取を集計（エアドロ・報酬・還元すべて含む）
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

    // ランクは全ユーザーのトランザクション集計で算出
    const allReceivedRows = await db
      .select({
        userId: transactionsTable.userId,
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(inArray(transactionsTable.type, ["airdrop", "reward", "mission_reward"]))
      .groupBy(transactionsTable.userId);

    const receivedMap = new Map(
      allReceivedRows.map((r) => [r.userId, Math.max(0, Number(r.total))]),
    );

    const allProfiles = await db.select({ userId: profileTable.userId }).from(profileTable);
    const totalUsers = allProfiles.length;

    const sorted = allProfiles
      .slice()
      .sort((a, b) => (receivedMap.get(b.userId) ?? 0) - (receivedMap.get(a.userId) ?? 0));
    const rank = sorted.findIndex((p) => p.userId === userId) + 1;

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
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
