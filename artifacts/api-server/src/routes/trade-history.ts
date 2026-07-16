import { Router } from "express";
import { db, pool } from "@workspace/db";
import { tradeHistoryTable } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

pool.query(`
  ALTER TABLE "tradeHistory"
  ADD COLUMN IF NOT EXISTS "usdPrice" NUMERIC,
  ADD COLUMN IF NOT EXISTS "usdValue" NUMERIC
`).catch((e: unknown) => console.error("[TradeHistory] ALTER TABLE error:", e));

// ── 購入履歴の有効期間開始日（2026-05-01以降のみ対象）──
const HISTORY_CUTOFF = new Date("2026-05-01T00:00:00.000Z");

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

// periodStart と HISTORY_CUTOFF の新しい方を返す
function effectiveStart(period: string | undefined): Date {
  if (!period) return HISTORY_CUTOFF;
  const ps = periodStart(period);
  if (!ps) return HISTORY_CUTOFF;
  return ps > HISTORY_CUTOFF ? ps : HISTORY_CUTOFF;
}

// ── ユーザー: 売買履歴一覧（2026-05-01以降のみ）──
router.get("/trade-history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const type = req.query.type as string | undefined;
  const period = req.query.period as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 100), 200);

  try {
    const startDate = effectiveStart(period);
    const conditions = [
      eq(tradeHistoryTable.userId, userId),
      gte(tradeHistoryTable.tradedAt, startDate),
    ];
    if (type === "buy" || type === "sell") {
      conditions.push(eq(tradeHistoryTable.type, type));
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

// ── ユーザー: 売買統計（ミッション条件チェック用）──
router.get("/trade-history/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const period = req.query.period as string | undefined;

  try {
    const startDate = effectiveStart(period);
    const conditions = [
      eq(tradeHistoryTable.userId, userId),
      gte(tradeHistoryTable.tradedAt, startDate),
    ];

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

// ── 管理者: 全売買履歴（全期間・ユーザー別フィルタ可能）──
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
