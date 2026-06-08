import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, loginStreaksTable } from "@workspace/db/schema";
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

    const allProfiles = await db.select().from(profileTable);
    const totalUsers = allProfiles.length;

    const sorted = allProfiles
      .slice()
      .sort((a, b) => Number(b.totalReceived) - Number(a.totalReceived));
    const rank = sorted.findIndex((p) => p.userId === userId) + 1;

    const streak = await db
      .select()
      .from(loginStreaksTable)
      .where(eq(loginStreaksTable.userId, userId))
      .then((r) => r[0]);

    res.json({
      participations: profile.participationCount,
      receiveCount: profile.participationCount,
      totalReceivedInmu: Number(profile.totalReceived),
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
