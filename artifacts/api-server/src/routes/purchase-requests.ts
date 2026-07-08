import { Router } from "express";
import { db, pool } from "@workspace/db";
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
import { ensurePetStateTable } from "../services/pet-state-store";
import { hasActivePetSkill } from "../services/pet-skills";

const router = Router();

type PetRebateBonus = { source: "level_reward" | "skill"; label: string; rate: number; eventOnly: boolean };

const PET_PURCHASE_BONUS_RULES = [
  { characterId: "inmu-festival", minLevel: 15, source: "level_reward" as const, label: "INMUくん Lv.15報酬", rate: 5, eventOnly: false },
  { characterId: "inmu-festival", minLevel: 1, source: "skill" as const, label: "固有スキル「810祭り‼️」", rate: 5, eventOnly: true },
  { characterId: "nyarushian", minLevel: 10, source: "level_reward" as const, label: "ニャルシアン Lv.10報酬", rate: 5, eventOnly: false },
  { characterId: "nyarushian", minLevel: 30, source: "level_reward" as const, label: "ニャルシアン Lv.30報酬", rate: 5, eventOnly: false },
  { characterId: "takuya", minLevel: 10, source: "level_reward" as const, label: "拓也 Lv.10報酬", rate: 5, eventOnly: false },
  { characterId: "takuya", minLevel: 30, source: "level_reward" as const, label: "拓也 Lv.30報酬", rate: 5, eventOnly: false },
  { characterId: "leon", minLevel: 10, source: "level_reward" as const, label: "レオン Lv.10報酬", rate: 5, eventOnly: false },
  { characterId: "leon", minLevel: 30, source: "level_reward" as const, label: "レオン Lv.30報酬", rate: 5, eventOnly: false },
] as const;

async function getPetPurchaseBonuses(userIds: string[], isEventDay: boolean) {
  const result = new Map<string, PetRebateBonus[]>();
  userIds.forEach(userId => result.set(userId, []));
  if (userIds.length === 0) return result;
  try {
    await ensurePetStateTable();
    const [states, ownership] = await Promise.all([
      pool.query(`SELECT "userId", state FROM "userPetStates" WHERE "userId" = ANY($1::text[])`, [userIds]),
      pool.query(`SELECT "userId", "characterId" FROM "userPetCharacters" WHERE "userId" = ANY($1::text[])`, [userIds]),
    ]);
    const stateByUser = new Map(states.rows.map(row => [String(row.userId), row.state ?? {}]));
    const ownedByUser = new Map<string, Set<string>>();
    ownership.rows.forEach(row => {
      const userId = String(row.userId);
      const owned = ownedByUser.get(userId) ?? new Set<string>();
      owned.add(String(row.characterId));
      ownedByUser.set(userId, owned);
    });

    userIds.forEach(userId => {
      const state = stateByUser.get(userId) as Record<string, any> | undefined;
      const owned = ownedByUser.get(userId) ?? new Set<string>();
      const activePetIds = Array.isArray(state?.activePetIds) ? state.activePetIds.slice(0, 3).map(String) : [];
      const legacySkillSingle = state?.skillActiveCharacterId;
      const skillActiveCharacterIds: string[] = (Array.isArray(state?.skillActiveCharacterIds)
        ? state.skillActiveCharacterIds
        : legacySkillSingle != null ? [legacySkillSingle] : []
      ).slice(0, 3).map(String);
      const bonuses = PET_PURCHASE_BONUS_RULES.filter(rule => {
        if (!owned.has(rule.characterId) || (rule.eventOnly && !isEventDay)) return false;
        const level = Number(state?.pets?.[rule.characterId]?.level ?? 0);
        if (level < rule.minLevel) return false;
        // レベル報酬は育成枠（activePetIds）、固有スキルは「固有スキル発動」で選択された最大3体に紐づく。
        return rule.source === "skill"
          ? skillActiveCharacterIds.includes(rule.characterId)
          : activePetIds.includes(rule.characterId);
      }).map(rule => ({ source: rule.source, label: rule.label, rate: rule.rate, eventOnly: rule.eventOnly }));
      result.set(userId, bonuses);
    });
  } catch (error) {
    console.error("[PurchaseRequests] PET rebate bonus lookup", error);
  }
  return result;
}

// ── JSTの購入サイクル開始UTC日時を返す（毎月16日0時始まり〜翌月15日23:59終わり） ──
function getMonthStartUTC(now: Date): Date {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  // 16日以降なら当月16日始まり、16日未満（15日以前）なら前月16日始まり
  const jstCycleStartMs = d >= 16 ? Date.UTC(y, m, 16) : Date.UTC(y, m - 1, 16);
  return new Date(jstCycleStartMs - 9 * 60 * 60 * 1000);
}

// ── JSTの購入サイクル終了UTC日時（次の16日0時＝15日23:59の直後）を返す ──
function getMonthEndUTC(now: Date): Date {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate();
  const jstCycleEndMs = d >= 16 ? Date.UTC(y, m + 1, 16) : Date.UTC(y, m, 16);
  return new Date(jstCycleEndMs - 9 * 60 * 60 * 1000);
}

// ── 現在の購入サイクル（16日〜翌月15日）の日数 ──
function getDaysInCurrentMonth(now: Date): number {
  const start = getMonthStartUTC(now);
  const end = getMonthEndUTC(now);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
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

// ── 購入申請 基本還元率（管理者設定・通常/イベント） ──
async function getBaseRebateRate(isEventDay: boolean): Promise<number> {
  const key = isEventDay ? "event_rebate_rate" : "normal_rebate_rate";
  try {
    const [s] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
    return s ? Number(s.value) || 0 : 0;
  } catch { return 0; }
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

async function getUserDailyLimit(userId: string, isEventDay: boolean): Promise<number> {
  const baseLimit = await getDailyLimit(isEventDay);
  return baseLimit + (await hasActivePetSkill(userId, "leon") ? 100_000 : 0);
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

    const [eventSettings, requests, normalDailyLimit, hasLeonSkill] = await Promise.all([
      getEventSettings(),
      db.select().from(purchaseRequestsTable)
        .where(eq(purchaseRequestsTable.userId, userId))
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(50),
      getNormalDailyLimit(),
      hasActivePetSkill(userId, "leon"),
    ]);

    const monthlyCapacity = (normalDailyLimit + (hasLeonSkill ? 100_000 : 0)) * daysInMonth;

    const [monthlyBought, monthlyApplied, dailyLimit, dailyUsed, baseRebateRate, petBonusesByUser] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart),
      getUserDailyLimit(userId, eventSettings.isEventDay),
      getDailyUsed(userId),
      getBaseRebateRate(eventSettings.isEventDay),
      getPetPurchaseBonuses([userId], eventSettings.isEventDay),
    ]);

    // 購入済み枚数 = min(実購入, 通常日上限 × 月日数)
    const effectiveTotalBought = Math.min(monthlyBought, monthlyCapacity);
    const available = Math.max(0, effectiveTotalBought - monthlyApplied);
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const effectiveLimit = effectiveTotalBought > 0
      ? Math.min(dailyRemaining, available)
      : dailyRemaining;

    const petRebateBonuses = petBonusesByUser.get(userId) ?? [];
    const petRebateBonusRate = petRebateBonuses.reduce((total, bonus) => total + bonus.rate, 0);

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
      baseRebateRate,                          // 管理者設定の基本還元率（通常/イベント）
      petRebateBonuses,                        // PET由来の還元率内訳（レベル報酬・固有スキル）
      petRebateBonusRate,
      totalRebateRate: baseRebateRate + petRebateBonusRate,
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

    const [eventSettings, normalDailyLimit, hasLeonSkill] = await Promise.all([
      getEventSettings(),
      getNormalDailyLimit(),
      hasActivePetSkill(userId, "leon"),
    ]);

    const monthlyCapacity = (normalDailyLimit + (hasLeonSkill ? 100_000 : 0)) * daysInMonth;

    const [monthlyBought, monthlyApplied, dailyLimit, dailyUsed] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart),
      getUserDailyLimit(userId, eventSettings.isEventDay),
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
    const [requests, eventSettings] = await Promise.all([db.select({
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
      .limit(500), getEventSettings()]);
    const bonuses = await getPetPurchaseBonuses(
      [...new Set(requests.map(request => request.userId))],
      eventSettings.isEventDay,
    );
    res.json(requests.map(request => {
      const petRebateBonuses = bonuses.get(request.userId) ?? [];
      return {
        ...request,
        petRebateBonuses,
        petRebateBonusRate: petRebateBonuses.reduce((total, bonus) => total + bonus.rate, 0),
        isEventPurchase: eventSettings.isEventDay,
      };
    }));
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
