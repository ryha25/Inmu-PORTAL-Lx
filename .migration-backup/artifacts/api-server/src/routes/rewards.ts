import { Router } from "express";
import { db } from "@workspace/db";
import { rewardsTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/rewards", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(rewardsTable)
      .where(eq(rewardsTable.userId, userId))
      .orderBy(sql`${rewardsTable.createdAt} DESC`);
    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/airdrops", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(100);
    const airdrops = rows.filter((t) => t.type === "airdrop");
    res.json(
      airdrops.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
