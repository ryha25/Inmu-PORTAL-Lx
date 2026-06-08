import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactionsTable,
  profileTable,
} from "@workspace/db/schema";
import { eq, sql, and, or, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { type, search, limit = "100" } = req.query as Record<string, string>;
  try {
    let q = db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .$dynamic();

    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(Number(limit));

    const filtered = rows.filter((tx) => {
      if (type && type !== "all" && tx.type !== type) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          tx.memo?.toLowerCase().includes(q) ||
          tx.counterparty?.toLowerCase().includes(q) ||
          tx.category?.toLowerCase().includes(q)
        );
      }
      return true;
    });

    res.json(
      filtered.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/transfers", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          sql`${transactionsTable.type} IN ('send','receive')`,
        ),
      )
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(100);
    res.json(rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/transfers", requireAuth, async (req, res): Promise<void> => {
  const senderId = req.userId!;
  const { recipientId, amount, memo } = req.body as {
    recipientId?: string;
    amount?: number;
    memo?: string;
  };
  if (!recipientId || !amount || amount <= 0) {
    res.status(400).json({ error: "recipientId and amount required" });
    return;
  }
  try {
    const sender = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, senderId))
      .then((r) => r[0]);
    if (!sender || Number(sender.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    const recipient = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, recipientId))
      .then((r) => r[0]);
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    await db.insert(transactionsTable).values({
      userId: senderId,
      type: "send",
      amount: String(amount),
      counterparty: recipient.displayName,
      counterpartyId: recipientId,
      memo,
    });
    await db.insert(transactionsTable).values({
      userId: recipientId,
      type: "receive",
      amount: String(amount),
      counterparty: sender.displayName,
      counterpartyId: senderId,
      memo,
    });

    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} - ${amount}`,
        totalSent: sql`${profileTable.totalSent} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, senderId));
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} + ${amount}`,
        totalReceived: sql`${profileTable.totalReceived} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, recipientId));

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
