import { Router } from "express";
import { db } from "@workspace/db";
import {
  profileTable,
  transactionsTable,
  jarsTable,
  goalsTable,
  tradeHistoryTable,
} from "@workspace/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
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

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlyTxs = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          gte(transactionsTable.createdAt, monthStart),
        ),
      );

    const monthlyChange = monthlyTxs.reduce((acc, tx) => {
      const amt = Number(tx.amount);
      if (["withdraw", "send"].includes(tx.type)) return acc - amt;
      return acc + amt;
    }, 0);

    const jars = await db
      .select()
      .from(jarsTable)
      .where(eq(jarsTable.userId, userId));
    const jarTotal = jars.reduce((s, j) => s + Number(j.balance), 0);

    const goals = await db
      .select()
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId));
    let goalRate = 0;
    if (goals.length > 0) {
      const rates = goals.map((g) => {
        const t = Number(g.targetAmount);
        return t > 0
          ? Math.min(100, (Number(g.currentAmount) / t) * 100)
          : 0;
      });
      goalRate = rates.reduce((s, r) => s + r, 0) / rates.length;
    }

    const recent = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(20);

    const recentTrades = await db
      .select()
      .from(tradeHistoryTable)
      .where(eq(tradeHistoryTable.userId, userId))
      .orderBy(sql`${tradeHistoryTable.tradedAt} DESC`)
      .limit(20);

    const merged = [
      ...recent.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        counterparty: t.counterparty ?? null,
        memo: t.memo ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      ...recentTrades.map((t) => ({
        id: t.id + 1_000_000,
        type: t.type,
        amount: t.tokenAmount,
        counterparty: t.dex ?? null,
        memo: t.txSignature,
        createdAt: t.tradedAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    res.json({
      balance: Number(profile.balance),
      savingsBalance: Number(profile.savingsBalance),
      monthlyChange,
      totalReceived: Number(profile.totalReceived),
      totalSent: Number(profile.totalSent),
      jarTotal,
      goalRate,
      monthlyPoints: Number(profile.monthlyPoints),
      recent: merged,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
