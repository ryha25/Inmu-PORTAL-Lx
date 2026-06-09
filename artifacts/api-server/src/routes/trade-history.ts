import { Router } from "express";
import { db } from "@workspace/db";
import { tradeHistoryTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

function periodStart(period: string): Date | null {
  const now = new Date();
  if (period === "daily") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "weekly") {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return null;
}

// ── ユーザー: 売買履歴一覧 ──
router.get("/trade-history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const type = req.query.type as string | undefined;
  const period = req.query.period as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 200);

  try {
    const conditions = [eq(tradeHistoryTable.userId, userId)];
    if (type === "buy" || type === "sell") {
      conditions.push(eq(tradeHistoryTable.type, type));
    }
    const start = period ? periodStart(period) : null;
    if (start) {
      conditions.push(gte(tradeHistoryTable.tradedAt, start));
    }

    const rows = await db
      .select()
      .from(tradeHistoryTable)
      .where(and(...conditions))
      .orderBy(sql`${tradeHistoryTable.tradedAt} DESC`)
      .limit(limit);

    res.json(
      rows.map((r) => ({
        ...r,
        tokenAmount: r.tokenAmount,
        tradedAt: r.tradedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (e) {
    console.error("[TradeHistory] fetch error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー: 売買統計（ミッション条件チェック用） ──
router.get("/trade-history/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = req.query.period as string | undefined;

  try {
    const start = period ? periodStart(period) : null;
    const conditions = [eq(tradeHistoryTable.userId, userId)];
    if (start) {
      conditions.push(gte(tradeHistoryTable.tradedAt, start));
    }

    const rows = await db
      .select()
      .from(tradeHistoryTable)
      .where(and(...conditions));

    const totalBought = rows
      .filter((r) => r.type === "buy")
      .reduce((s, r) => s + Number(r.tokenAmount), 0);
    const totalSold = rows
      .filter((r) => r.type === "sell")
      .reduce((s, r) => s + Number(r.tokenAmount), 0);

    res.json({ totalBought, totalSold, period: period ?? "all" });
  } catch (e) {
    console.error("[TradeHistory] stats error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理者: 全売買履歴（ユーザー別フィルタ可能） ──
router.get("/admin/trade-history", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.query.userId as string | undefined;
  const type = req.query.type as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);

  try {
    const conditions = [];
    if (userId) conditions.push(eq(tradeHistoryTable.userId, userId));
    if (type === "buy" || type === "sell") conditions.push(eq(tradeHistoryTable.type, type));

    const rows = await db
      .select()
      .from(tradeHistoryTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${tradeHistoryTable.tradedAt} DESC`)
      .limit(limit);

    res.json(
      rows.map((r) => ({
        ...r,
        tradedAt: r.tradedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    );
  } catch (e) {
    console.error("[Admin/TradeHistory] fetch error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
