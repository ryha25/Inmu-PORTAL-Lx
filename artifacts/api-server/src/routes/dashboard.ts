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

type DashboardTransactionRow = {
  id: number;
  type: string;
  amount: string;
  counterparty: string | null;
  memo: string | null;
  createdAt: Date;
};

type DashboardMonthlyTransactionRow = {
  type: string;
  amount: string;
};

type DashboardJarRow = {
  balance: string;
};

type DashboardGoalRow = {
  targetAmount: string;
  currentAmount: string;
};

type DashboardTradeRow = {
  id: number;
  type: string;
  tokenAmount: string;
  dex: string | null;
  txSignature: string;
  tradedAt: Date;
};

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const profile = await db
      .select({
        balance: profileTable.balance,
        savingsBalance: profileTable.savingsBalance,
        totalReceived: profileTable.totalReceived,
        totalSent: profileTable.totalSent,
        monthlyPoints: profileTable.monthlyPoints,
      })
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
      .select({
        type: transactionsTable.type,
        amount: transactionsTable.amount,
      })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          gte(transactionsTable.createdAt, monthStart),
        ),
      )
      .catch((error) => {
        console.error("[Dashboard] monthly transactions fallback:", error);
        return [] as DashboardMonthlyTransactionRow[];
      });

    const monthlyChange = monthlyTxs.reduce((acc, tx) => {
      const amt = Number(tx.amount);
      if (["withdraw", "send"].includes(tx.type)) return acc - amt;
      return acc + amt;
    }, 0);

    const jars = await db
      .select({
        balance: jarsTable.balance,
      })
      .from(jarsTable)
      .where(eq(jarsTable.userId, userId))
      .catch((error) => {
        console.error("[Dashboard] jars fallback:", error);
        return [] as DashboardJarRow[];
      });
    const jarTotal = jars.reduce((s, j) => s + Number(j.balance), 0);

    const goals = await db
      .select({
        targetAmount: goalsTable.targetAmount,
        currentAmount: goalsTable.currentAmount,
      })
      .from(goalsTable)
      .where(eq(goalsTable.userId, userId))
      .catch((error) => {
        console.error("[Dashboard] goals fallback:", error);
        return [] as DashboardGoalRow[];
      });
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
      .select({
        id: transactionsTable.id,
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        counterparty: transactionsTable.counterparty,
        memo: transactionsTable.memo,
        createdAt: transactionsTable.createdAt,
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(20)
      .catch((error) => {
        console.error("[Dashboard] recent transactions fallback:", error);
        return [] as DashboardTransactionRow[];
      });

    const recentTrades = await db
      .select({
        id: tradeHistoryTable.id,
        type: tradeHistoryTable.type,
        tokenAmount: tradeHistoryTable.tokenAmount,
        dex: tradeHistoryTable.dex,
        txSignature: tradeHistoryTable.txSignature,
        tradedAt: tradeHistoryTable.tradedAt,
      })
      .from(tradeHistoryTable)
      .where(eq(tradeHistoryTable.userId, userId))
      .orderBy(sql`${tradeHistoryTable.tradedAt} DESC`)
      .limit(20)
      .catch((error) => {
        console.error("[Dashboard] recent trades fallback:", error);
        return [] as DashboardTradeRow[];
      });

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
  } catch (error) {
    console.error("[Dashboard] fetch error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
