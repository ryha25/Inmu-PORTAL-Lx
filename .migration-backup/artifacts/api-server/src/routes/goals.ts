import { Router } from "express";
import { db } from "@workspace/db";
import { goalsTable, profileTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/goals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .orderBy(sql`${goalsTable.createdAt} DESC`);
    res.json(rows.map((g) => ({ ...g, createdAt: g.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/goals", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { name, targetAmount } = req.body as {
    name?: string;
    targetAmount?: number;
  };
  if (!name?.trim() || !targetAmount || targetAmount <= 0) {
    res.status(400).json({ error: "name and targetAmount required" });
    return;
  }
  try {
    const [goal] = await db
      .insert(goalsTable)
      .values({ userId, name: name.trim(), targetAmount: String(targetAmount) })
      .returning();
    res.status(201).json(goal);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/goals/:id/progress", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const goalId = Number(req.params.id);
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  try {
    const goal = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.id, goalId))
      .then((r) => r[0]);
    if (!goal || goal.userId !== userId) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (!profile || Number(profile.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    await db
      .update(goalsTable)
      .set({
        currentAmount: sql`${goalsTable.currentAmount} + ${amount}`,
      })
      .where(eq(goalsTable.id, goalId));
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/goals/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const goalId = Number(req.params.id);
  try {
    const goal = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.id, goalId))
      .then((r) => r[0]);
    if (!goal || goal.userId !== userId) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    if (Number(goal.currentAmount) > 0) {
      await db
        .update(profileTable)
        .set({
          balance: sql`${profileTable.balance} + ${goal.currentAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, userId));
    }
    await db.delete(goalsTable).where(eq(goalsTable.id, goalId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
