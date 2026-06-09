import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/ranking", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(profileTable)
      .orderBy(sql`${profileTable.balance} DESC`)
      .limit(100);

    res.json(
      rows.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        displayName: p.displayName,
        balance: Number(p.balance),
        totalReceived: Number(p.totalReceived),
        participations: p.participationCount,
      })),
    );
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
