import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, transactionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/balance", requireAuth, async (req, res): Promise<void> => {
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
    res.json({
      balance: Number(profile.balance),
      savingsBalance: Number(profile.savingsBalance),
      totalReceived: Number(profile.totalReceived),
      totalSent: Number(profile.totalSent),
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/balance/move-to-savings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  try {
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
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} - ${amount}`,
        savingsBalance: sql`${profileTable.savingsBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    await db.insert(transactionsTable).values({
      userId,
      type: "withdraw",
      amount: String(amount),
      category: "savings",
      memo: "貯蓄へ移動",
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/balance/move-from-savings", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (!profile || Number(profile.savingsBalance) < amount) {
      res.status(400).json({ error: "Insufficient savings balance" });
      return;
    }
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} + ${amount}`,
        savingsBalance: sql`${profileTable.savingsBalance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    await db.insert(transactionsTable).values({
      userId,
      type: "deposit",
      amount: String(amount),
      category: "savings",
      memo: "貯蓄から引き出し",
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/balance/lock", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount, days } = req.body as { amount?: number; days?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  if (!days || ![30, 90, 180, 365].includes(days)) {
    res.status(400).json({ error: "days must be 30, 90, 180, or 365" });
    return;
  }
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId))
      .then((r) => r[0]);
    if (!profile || Number(profile.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    const { jarsTable } = await import("@workspace/db/schema");
    const now = new Date();
    const unlockDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const [jar] = await db
      .insert(jarsTable)
      .values({
        userId,
        name: `ロック (${days}日)`,
        balance: String(amount),
        isLocked: true,
        lockDays: days,
        lockStart: now,
        unlockDate,
      })
      .returning();
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    await db.insert(transactionsTable).values({
      userId,
      type: "withdraw",
      amount: String(amount),
      category: "lock",
      memo: `${days}日ロック`,
    });
    res.status(201).json({ ok: true, jar });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
