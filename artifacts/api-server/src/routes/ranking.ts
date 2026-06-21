import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, transactionsTable, missionParticipationsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { requireAuthOrAdmin } from "../middlewares/session";

const router = Router();

// ── INMU保有ランキング（DB値ベース・高速版）──
// on-chain RPCは全ユーザー並列呼び出しでタイムアウトするためDB値を使用
router.get("/ranking", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const profiles = await db.select().from(profileTable).limit(200);

    const receivedRows = await db
      .select({
        userId: transactionsTable.userId,
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(sql`${transactionsTable.type} in ('airdrop', 'reward', 'mission_reward')`)
      .groupBy(transactionsTable.userId);

    const receivedMap = new Map(receivedRows.map((r) => [r.userId, Math.max(0, Number(r.total))]));

    const entries = profiles.map((p) => {
      const balance = Math.max(0, Number(p.totalBought) - Number(p.totalSold));
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

// ── ポイントランキング ──
router.get("/ranking/points", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(profileTable)
      .orderBy(sql`${profileTable.monthlyPoints} DESC`)
      .limit(100);

    res.set("Cache-Control", "no-store");
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

// ── 総合評価ランキング ──
// スコア = INMU保有量(40%) + ポイント保有量(40%) + ミッションクリア数(20%)
router.get("/ranking/composite", requireAuthOrAdmin, async (req, res): Promise<void> => {
  const currentUserId = req.userId;
  try {
    const [allProfiles, clearRows] = await Promise.all([
      db.select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        totalBought: profileTable.totalBought,
        totalSold: profileTable.totalSold,
        monthlyPoints: profileTable.monthlyPoints,
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

    if (allProfiles.length === 0) {
      res.json({ ranking: [], myRank: null, myEntry: null, totalUsers: 0 });
      return;
    }

    const clearMap = new Map(clearRows.map((c) => [c.userId, Number(c.count)]));

    // 各指標を計算
    const inmuValues  = allProfiles.map((p) => Math.max(0, Number(p.totalBought) - Number(p.totalSold)));
    const pointValues = allProfiles.map((p) => Math.max(0, Number(p.monthlyPoints)));
    const clearValues = allProfiles.map((p) => clearMap.get(p.userId) ?? 0);

    // 正規化のための最大値（0除算防止で最低1）
    const maxInmu   = Math.max(...inmuValues,  1);
    const maxPoints = Math.max(...pointValues, 1);
    const maxClears = Math.max(...clearValues, 1);

    const entries = allProfiles.map((p, i) => {
      const inmu = inmuValues[i];
      const pts  = pointValues[i];
      const cls  = clearValues[i];
      // INMU保有量(40%) + ポイント(40%) + ミッションクリア数(20%)
      const score = (inmu / maxInmu)   * 40
                  + (pts  / maxPoints) * 40
                  + (cls  / maxClears) * 20;
      return {
        userId: p.userId,
        displayName: p.displayName,
        balance: inmu,
        points: pts,
        clears: cls,
        score: Math.round(score * 10) / 10,
      };
    });

    entries.sort((a, b) => b.score - a.score || b.balance - a.balance || b.points - a.points);

    const totalUsers = entries.length;
    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

    let myRank: number | null = null;
    let myEntry = null;
    if (currentUserId) {
      const found = ranked.find((r) => r.userId === currentUserId);
      if (found) {
        myRank = found.rank;
        myEntry = found;
      } else {
        myRank = totalUsers > 0 ? totalUsers : 1;
      }
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
