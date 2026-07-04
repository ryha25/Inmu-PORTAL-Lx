import { Router } from "express";
import { db } from "@workspace/db";
import {
  pointsTable,
  profileTable,
  loginStreaksTable,
} from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";
import { hasActivePetSkill } from "../services/pet-skills";

const router = Router();

// ── JST（日本時間）基準の日付文字列（YYYY-MM-DD）を返す ──
// ログインボーナスの「本日」判定は 0:00 JST でリセットされる必要があるため、
// UTCの日付境界（JST 9:00相当）ではなくJSTの日付境界で比較すること。
function jstDateString(date: Date): string {
  const jstOffset = 9 * 3600 * 1000;
  return new Date(date.getTime() + jstOffset).toISOString().slice(0, 10);
}

router.get("/points", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);

    const streak = await db
      .select()
      .from(loginStreaksTable)
      .where(eq(loginStreaksTable.userId, userId))
      .then((r) => r[0]);

    const history = await db
      .select()
      .from(pointsTable)
      .where(eq(pointsTable.userId, userId))
      .orderBy(desc(pointsTable.createdAt))
      .limit(50);

    const leaderboard = await db
      .select()
      .from(profileTable)
      .orderBy(sql`${profileTable.monthlyPoints} DESC`)
      .limit(20);

    const today = jstDateString(new Date());
    const alreadyClaimed = streak?.lastLogin
      ? jstDateString(streak.lastLogin) === today
      : false;

    res.json({
      totalPoints: Number(profile?.monthlyPoints ?? 0),
      streak: streak?.streak ?? 0,
      alreadyClaimed,
      history: history.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
      })),
      leaderboard: leaderboard.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        displayName: p.displayName,
        points: Number(p.monthlyPoints),
      })),
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/points/claim-daily", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const today = jstDateString(new Date());
    const streak = await db
      .select()
      .from(loginStreaksTable)
      .where(eq(loginStreaksTable.userId, userId))
      .then((r) => r[0]);

    if (
      streak?.lastLogin &&
      jstDateString(streak.lastLogin) === today
    ) {
      res.status(400).json({ error: "Already claimed today" });
      return;
    }

    const now = new Date();
    const yesterday = jstDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const isConsecutive =
      streak?.lastLogin &&
      jstDateString(streak.lastLogin) === yesterday;

    const newStreak = isConsecutive ? (streak?.streak ?? 0) + 1 : 1;
    const basePoints = 10;
    const streakBonus = Math.min(newStreak - 1, 6) * 5;
    const hasLuckyPaw = await hasActivePetSkill(userId, "nyarushian");
    const totalPoints = (basePoints + streakBonus) * (hasLuckyPaw ? 2 : 1);

    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (!streak) {
      await db
        .insert(loginStreaksTable)
        .values({ userId, streak: newStreak, lastLogin: now });
    } else {
      await db
        .update(loginStreaksTable)
        .set({ streak: newStreak, lastLogin: now, updatedAt: now })
        .where(eq(loginStreaksTable.userId, userId));
    }

    await db.insert(pointsTable).values({
      userId,
      amount: String(totalPoints),
      type: "daily_login",
      month,
    });

    await db
      .update(profileTable)
      .set({
        monthlyPoints: sql`${profileTable.monthlyPoints} + ${totalPoints}`,
        updatedAt: now,
      })
      .where(eq(profileTable.userId, userId));

    res.json({ points: totalPoints, streak: newStreak, petSkillMultiplier: hasLuckyPaw ? 2 : 1 });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
