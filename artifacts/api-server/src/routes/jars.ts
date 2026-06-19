import { Router } from "express";
import { db } from "@workspace/db";
import { jarsTable, transactionsTable, profileTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/jars", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.userId, userId))
      .orderBy(sql`${jarsTable.createdAt} DESC`);
    res.json(
      rows.map((j) => ({
        ...j,
        createdAt: j.createdAt.toISOString(),
        lockStart: j.lockStart?.toISOString() ?? null,
        unlockDate: j.unlockDate?.toISOString() ?? null,
      })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/jars", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { name } = req.body as { name?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  try {
    const [jar] = await db
      .insert(jarsTable)
      .values({ userId, name: name.trim() })
      .returning();
    res.status(201).json(jar);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/jars/:id/deposit", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const jarId = Number(req.params.id);
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  try {
    const jar = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.id, jarId))
      .then((r) => r[0]);
    if (!jar || jar.userId !== userId) {
      res.status(404).json({ error: "Jar not found" });
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
      .update(jarsTable)
      .set({ balance: sql`${jarsTable.balance} + ${amount}` })
      .where(eq(jarsTable.id, jarId));
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
      category: "jar",
      jarId,
      memo: `貯金箱「${jar.name}」へ預け入れ`,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/jars/:id/withdraw", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const jarId = Number(req.params.id);
  const { amount } = req.body as { amount?: number };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  try {
    const jar = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.id, jarId))
      .then((r) => r[0]);
    if (!jar || jar.userId !== userId) {
      res.status(404).json({ error: "Jar not found" });
      return;
    }
    if (jar.isLocked) {
      const now = new Date();
      if (!jar.unlockDate || jar.unlockDate > now) {
        res.status(400).json({ error: "Jar is locked" });
        return;
      }
      await db
        .update(jarsTable)
        .set({ isLocked: false, unlockDate: null })
        .where(eq(jarsTable.id, jarId));
    }
    if (Number(jar.balance) < amount) {
      res.status(400).json({ error: "Insufficient jar balance" });
      return;
    }
    await db
      .update(jarsTable)
      .set({ balance: sql`${jarsTable.balance} - ${amount}` })
      .where(eq(jarsTable.id, jarId));
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, userId));
    await db.insert(transactionsTable).values({
      userId,
      type: "deposit",
      amount: String(amount),
      category: "jar",
      jarId,
      memo: `貯金箱「${jar.name}」から引き出し`,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/jars/:id/lock", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const jarId = Number(req.params.id);
  const { days } = req.body as { days?: number };
  if (!days || ![30, 90, 180, 365].includes(days)) {
    res.status(400).json({ error: "days must be 30, 90, 180, or 365" });
    return;
  }
  try {
    const jar = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.id, jarId))
      .then((r) => r[0]);
    if (!jar || jar.userId !== userId) {
      res.status(404).json({ error: "Jar not found" });
      return;
    }
    const now = new Date();
    const unlockDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await db
      .update(jarsTable)
      .set({ isLocked: true, lockDays: days, lockStart: now, unlockDate })
      .where(eq(jarsTable.id, jarId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/jars/:id/unlock", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const jarId = Number(req.params.id);
  try {
    const jar = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.id, jarId))
      .then((r) => r[0]);
    if (!jar || jar.userId !== userId) {
      res.status(404).json({ error: "Jar not found" });
      return;
    }
    if (jar.isLocked && jar.unlockDate && jar.unlockDate > new Date()) {
      res.status(400).json({ error: "Lock period not yet expired" });
      return;
    }
    const amount = Number(jar.balance);
    await db
      .update(jarsTable)
      .set({ isLocked: false, unlockDate: null, balance: "0" })
      .where(eq(jarsTable.id, jarId));
    if (amount > 0) {
      await db
        .update(profileTable)
        .set({
          balance: sql`${profileTable.balance} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, userId));
      await db.insert(transactionsTable).values({
        userId,
        type: "deposit",
        amount: String(amount),
        category: "lock",
        memo: "ロック解除",
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/jars/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const jarId = Number(req.params.id);
  try {
    const jar = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.id, jarId))
      .then((r) => r[0]);
    if (!jar || jar.userId !== userId) {
      res.status(404).json({ error: "Jar not found" });
      return;
    }
    if (Number(jar.balance) > 0) {
      await db
        .update(profileTable)
        .set({
          balance: sql`${profileTable.balance} + ${jar.balance}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, userId));
    }
    await db.delete(jarsTable).where(eq(jarsTable.id, jarId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
