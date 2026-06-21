import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable,
  systemSettingsTable,
  transactionsTable,
  notificationsTable,
  profileTable,
  auditLogTable,
  tradeHistoryTable,
} from "@workspace/db/schema";
import { eq, desc, and, or, gte, lt, inArray, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

// ── JST当月の開始UTC日時を返す ──
function getMonthStartUTC(now: Date): Date {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // JSTの月初 00:00:00 → UTC変換
  const jstMonthStartMs = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 1);
  return new Date(jstMonthStartMs - 9 * 60 * 60 * 1000);
}

// ── JST当月の終了UTC日時（翌月初）を返す ──
function getMonthEndUTC(now: Date): Date {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jstNextMonthStartMs = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1, 1);
  return new Date(jstNextMonthStartMs - 9 * 60 * 60 * 1000);
}

// ── JST当月の日数 ──
function getDaysInCurrentMonth(now: Date): number {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1, 0)).getUTCDate();
}

// ── 全体申請上限（管理者設定） ──
async function getPurchaseAdminLimit(): Promise<number> {
  try {
    const [s] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "purchase_request_limit"));
    return s ? Number(s.value) : 1000000;
  } catch { return 1000000; }
}

// ── 通常日の1日申請上限 ──
async function getNormalDailyLimit(): Promise<number> {
  try {
    const [s] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "normal_daily_purchase_limit"));
    return s ? Number(s.value) : 300000;
  } catch { return 300000; }
}

// ── イベントモード設定を取得 ──
async function getEventSettings(): Promise<{
  eventModeEnabled: boolean;
  eventStartDate: string;
  eventEndDate: string;
  isEventDay: boolean;
}> {
  try {
    const rows = await db.select().from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, ["event_mode_enabled", "event_start_date", "event_end_date"]));
    const map = new Map(rows.map(r => [r.key, r.value]));
    const eventModeEnabled = map.get("event_mode_enabled") === "true";
    const eventStartDate = map.get("event_start_date") ?? "";
    const eventEndDate = map.get("event_end_date") ?? "";

    let isEventDay = false;
    if (eventModeEnabled && eventStartDate && eventEndDate) {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, "0")}-${String(jstNow.getUTCDate()).padStart(2, "0")}`;
      isEventDay = todayStr >= eventStartDate && todayStr <= eventEndDate;
    }
    return { eventModeEnabled, eventStartDate, eventEndDate, isEventDay };
  } catch {
    return { eventModeEnabled: false, eventStartDate: "", eventEndDate: "", isEventDay: false };
  }
}

// ── 1日の申請上限を取得（通常 or イベント） ──
async function getDailyLimit(isEventDay: boolean): Promise<number> {
  const key = isEventDay ? "event_daily_purchase_limit" : "normal_daily_purchase_limit";
  const defaultVal = isEventDay ? 500000 : 300000;
  try {
    const [s] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
    return s ? Number(s.value) : defaultVal;
  } catch { return defaultVal; }
}

// ── JST当月の購入実績合計（tradeHistoryTable の buy）──
async function getMonthlyBought(userId: string, monthStart: Date, monthEnd: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(cast("tokenAmount" as numeric)), '0')` })
    .from(tradeHistoryTable)
    .where(and(
      eq(tradeHistoryTable.userId, userId),
      eq(tradeHistoryTable.type, "buy"),
      gte(tradeHistoryTable.tradedAt, monthStart),
      lt(tradeHistoryTable.tradedAt, monthEnd),
    ));
  return Number(row?.total ?? 0);
}

// ── JST当月の申請済み総額（pending + approved） ──
async function getMonthlyApplied(userId: string, monthStart: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(purchaseRequestsTable)
    .where(and(
      eq(purchaseRequestsTable.userId, userId),
      or(eq(purchaseRequestsTable.status, "pending"), eq(purchaseRequestsTable.status, "approved")),
      gte(purchaseRequestsTable.createdAt, monthStart),
    ));
  return Number(row?.total ?? 0);
}

// ── 本日の申請済み総額（JST基準、pending + approved） ──
async function getDailyUsed(userId: string): Promise<number> {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jstMidnight = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());
  const todayStartUTC = new Date(jstMidnight - 9 * 60 * 60 * 1000);

  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(purchaseRequestsTable)
    .where(and(
      eq(purchaseRequestsTable.userId, userId),
      or(eq(purchaseRequestsTable.status, "pending"), eq(purchaseRequestsTable.status, "approved")),
      gte(purchaseRequestsTable.createdAt, todayStartUTC),
    ));
  return Number(row?.total ?? 0);
}

// ── ユーザー: 自分の申請一覧 ──
router.get("/purchase-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const now = new Date();
    const monthStart = getMonthStartUTC(now);
    const monthEnd   = getMonthEndUTC(now);
    const daysInMonth = getDaysInCurrentMonth(now);

    const [eventSettings, requests, normalDailyLimit] = await Promise.all([
      getEventSettings(),
      db.select().from(purchaseRequestsTable)
        .where(eq(purchaseRequestsTable.userId, userId))
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(50),
      getNormalDailyLimit(),
    ]);

    const monthlyCapacity = normalDailyLimit * daysInMonth;

    const [monthlyBought, monthlyApplied, dailyLimit, dailyUsed] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart),
      getDailyLimit(eventSettings.isEventDay),
      getDailyUsed(userId),
    ]);

    // 購入済み枚数 = min(実購入, 通常日上限 × 月日数)
    const effectiveTotalBought = Math.min(monthlyBought, monthlyCapacity);
    const available = Math.max(0, effectiveTotalBought - monthlyApplied);
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const effectiveLimit = effectiveTotalBought > 0
      ? Math.min(dailyRemaining, available)
      : dailyRemaining;

    res.json({
      requests,
      totalBought: effectiveTotalBought,      // 購入済み枚数（キャップ適用後）
      monthlyBought,                           // 当月の実購入合計（情報表示用）
      monthlyCapacity,                         // 当月の購入反映上限 = 通常日上限 × 月日数
      totalApplied: monthlyApplied,            // 当月の申請済み
      available,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
      isEventMode: eventSettings.isEventDay,
      effectiveLimit,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー: 申請送信 ──
router.post("/purchase-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amount, txHash, comment } = req.body as { amount?: number | string; txHash?: string; comment?: string };

  const numAmount = Number(amount);
  if (!amount || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: "有効な枚数を入力してください" });
    return;
  }

  try {
    const now = new Date();
    const monthStart = getMonthStartUTC(now);
    const monthEnd   = getMonthEndUTC(now);
    const daysInMonth = getDaysInCurrentMonth(now);

    const [eventSettings, normalDailyLimit] = await Promise.all([
      getEventSettings(),
      getNormalDailyLimit(),
    ]);

    const monthlyCapacity = normalDailyLimit * daysInMonth;

    const [monthlyBought, monthlyApplied, dailyLimit, dailyUsed] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart),
      getDailyLimit(eventSettings.isEventDay),
      getDailyUsed(userId),
    ]);

    const effectiveTotalBought = Math.min(monthlyBought, monthlyCapacity);
    const available = Math.max(0, effectiveTotalBought - monthlyApplied);
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

    // ① 1日の申請上限チェック
    if (numAmount > dailyRemaining) {
      res.status(400).json({
        error: `本日の申請上限を超えています（本日残り: ${dailyRemaining.toLocaleString()} INMU / 1日上限: ${dailyLimit.toLocaleString()} INMU）`,
        dailyLimit, dailyUsed, dailyRemaining,
      });
      return;
    }

    // ② 今月の購入済み枚数残りチェック（購入実績がある場合のみ）
    if (effectiveTotalBought > 0 && numAmount > available) {
      res.status(400).json({
        error: `申請可能枚数を超えています（今月の申請可能: ${available.toLocaleString()} INMU = 購入済み ${effectiveTotalBought.toLocaleString()} - 申請済み ${monthlyApplied.toLocaleString()}）`,
        dailyLimit, dailyUsed, dailyRemaining, available, monthlyCapacity,
      });
      return;
    }

    const [created] = await db.insert(purchaseRequestsTable).values({
      userId,
      amount: String(numAmount),
      txHash: txHash?.trim() || null,
      comment: comment?.trim() || null,
    }).returning();

    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理者: 全申請一覧（pending） ──
router.get("/admin/purchase-requests", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const requests = await db.select({
      id: purchaseRequestsTable.id,
      userId: purchaseRequestsTable.userId,
      amount: purchaseRequestsTable.amount,
      txHash: purchaseRequestsTable.txHash,
      comment: purchaseRequestsTable.comment,
      status: purchaseRequestsTable.status,
      reviewedByAdminId: purchaseRequestsTable.reviewedByAdminId,
      reviewedAt: purchaseRequestsTable.reviewedAt,
      rebateAmount: purchaseRequestsTable.rebateAmount,
      rebateRate: purchaseRequestsTable.rebateRate,
      adminNote: purchaseRequestsTable.adminNote,
      rebateTxSignature: purchaseRequestsTable.rebateTxSignature,
      createdAt: purchaseRequestsTable.createdAt,
      displayName: profileTable.displayName,
      solWallet: profileTable.solWallet,
    })
      .from(purchaseRequestsTable)
      .leftJoin(profileTable, eq(purchaseRequestsTable.userId, profileTable.userId))
      .where(eq(purchaseRequestsTable.status, "pending"))
      .orderBy(desc(purchaseRequestsTable.createdAt))
      .limit(500);
    res.json(requests);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理者: 申請ステータス更新 ──
router.put("/admin/purchase-requests/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { status, rebateAmount, rebateRate, adminNote, rebateTxSignature } = req.body as {
    status?: string; rebateAmount?: number | string | null; rebateRate?: number | string | null;
    adminNote?: string; rebateTxSignature?: string | null;
  };

  if (!status || !["approved", "rejected", "pending"].includes(status)) {
    res.status(400).json({ error: "status は approved / rejected / pending のいずれか" });
    return;
  }

  try {
    const [request] = await db.select().from(purchaseRequestsTable).where(eq(purchaseRequestsTable.id, id));
    if (!request) { res.status(404).json({ error: "申請が見つかりません" }); return; }

    const now = new Date();
    const numRebate = rebateAmount != null && rebateAmount !== "" ? Number(rebateAmount) : null;
    const numRate   = rebateRate   != null && rebateRate   !== "" ? Number(rebateRate)   : null;

    const reviewerId = req.adminId ?? req.userId ?? "admin";
    await db.update(purchaseRequestsTable).set({
      status,
      reviewedByAdminId: reviewerId,
      reviewedAt: now,
      rebateAmount: numRebate != null ? String(numRebate) : null,
      rebateRate:   numRate   != null ? String(numRate)   : null,
      adminNote: adminNote?.trim() || null,
      rebateTxSignature: rebateTxSignature?.trim() || null,
    }).where(eq(purchaseRequestsTable.id, id));

    if (status === "approved" && numRebate != null && numRebate > 0) {
      const txSig = rebateTxSignature?.trim() || null;
      await db.insert(transactionsTable).values({
        userId: request.userId,
        type: "reward",
        amount: String(numRebate),
        memo: `購入申請還元 (申請${Number(request.amount).toLocaleString()} INMU${numRate != null ? `・還元率 ${numRate}%` : ""})`,
        txHash: txSig,
        createdAt: now,
      });
      await db.insert(notificationsTable).values({
        userId: request.userId,
        type: "purchase_approved",
        title: "購入申請が承認されました",
        message: `${Number(request.amount).toLocaleString()} INMU の購入申請が承認され、${numRebate.toLocaleString()} INMU が還元されました。${txSig ? `TxSignature: ${txSig}` : ""}`,
      });
      await db.insert(auditLogTable).values({
        adminId: reviewerId, action: "purchase_request_approved", targetUserId: request.userId,
        details: { requestId: id, requestAmount: request.amount, rebateAmount: numRebate, rebateRate: numRate, rebateTxSignature: txSig } as Record<string, unknown>,
        createdAt: now,
      }).catch(() => {});
    } else if (status === "rejected") {
      await db.insert(notificationsTable).values({
        userId: request.userId,
        type: "purchase_rejected",
        title: "購入申請が却下されました",
        message: `${Number(request.amount).toLocaleString()} INMU の購入申請が却下されました。${adminNote?.trim() ? `理由: ${adminNote.trim()}` : ""}`,
      });
      await db.insert(auditLogTable).values({
        adminId: reviewerId, action: "purchase_request_rejected", targetUserId: request.userId,
        details: { requestId: id, requestAmount: request.amount, adminNote: adminNote?.trim() || null } as Record<string, unknown>,
        createdAt: now,
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
