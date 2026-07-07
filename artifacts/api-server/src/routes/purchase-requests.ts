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
const INMU_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

type PetRebateBonus = { source: "level_reward" | "skill"; label: string; rate: number; eventOnly: boolean };

const PET_PURCHASE_BONUS_RULES = [
  { characterId: "inmu-festival", minLevel: 15, source: "level_reward" as const, label: "INMUくん Lv.15報酬", rate: 5, eventOnly: false },
  { characterId: "inmu-festival", minLevel: 1, source: "skill" as const, label: "固有スキル「810祭り‼️」", rate: 5, eventOnly: true },
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
      const bonuses = PET_PURCHASE_BONUS_RULES.filter(rule => {
        // Event-only skills must not count as used or active outside the configured event window.
        if (rule.source === "skill" && rule.eventOnly && !isEventDay) return false;
        if (!owned.has(rule.characterId)) return false;
        const level = Number(state?.pets?.[rule.characterId]?.level ?? 0);
        return level >= rule.minLevel && (rule.source !== "skill" || activePetIds.includes(rule.characterId));
      }).map(rule => ({ source: rule.source, label: rule.label, rate: rule.rate, eventOnly: rule.eventOnly }));
      result.set(userId, bonuses);
    });
  } catch (error) {
    console.error("[PurchaseRequests] PET rebate bonus lookup", error);
  }
  return result;
}

// ── JST 16日開始・翌月16日終了の申請期間 ──
function getApplicationCycle(now: Date): { start: Date; end: Date; remainingDays: number } {
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = jstNow.getUTCFullYear();
  const month = jstNow.getUTCMonth();
  const isAfterStart = jstNow.getUTCDate() >= 16;
  const startJst = Date.UTC(year, isAfterStart ? month : month - 1, 16);
  const endJst = Date.UTC(year, isAfterStart ? month + 1 : month, 16);
  const end = new Date(endJst - 9 * 60 * 60 * 1000);
  const currentJstDate = Date.UTC(year, month, jstNow.getUTCDate());
  const remainingDays = Math.max(0, Math.round((endJst - currentJstDate) / 86_400_000) - 1);
  return {
    start: new Date(startJst - 9 * 60 * 60 * 1000),
    end,
    remainingDays,
  };
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
  // Normal applications are always based on 100,000 INMU per remaining day.
  // Event limits remain configurable independently.
  if (!isEventDay) return 100_000;
  const key = "event_daily_purchase_limit";
  const defaultVal = 500000;
  try {
    const [s] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key));
    return s ? Number(s.value) : defaultVal;
  } catch { return defaultVal; }
}

async function getUserDailyLimit(userId: string, isEventDay: boolean): Promise<number> {
  const baseLimit = await getDailyLimit(isEventDay);
  return baseLimit + (await hasActivePetSkill(userId, "leon") ? 100_000 : 0);
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyOutboundInmuTransfer(signature: string, recipientWallet: string, expectedAmount: number) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) throw new Error("TXIDの形式が不正です");
  const rpcUrl = process.env.SOLANA_RPC;
  if (!rpcUrl) throw new Error("SOLANA_RPCが設定されていません");
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    const rpc = await response.json() as any;
    const transaction = rpc?.result;
    if (transaction) {
      if (transaction.meta?.err) throw new Error("送金トランザクションが失敗しています");
      const sumForRecipient = (balances: any[]) => (balances ?? [])
        .filter(balance => balance?.mint === INMU_MINT && balance?.owner === recipientWallet)
        .reduce((sum, balance) => sum + BigInt(balance?.uiTokenAmount?.amount ?? "0"), 0n);
      const before = sumForRecipient(transaction.meta?.preTokenBalances);
      const after = sumForRecipient(transaction.meta?.postTokenBalances);
      const expectedRaw = BigInt(Math.round(expectedAmount * 10 ** INMU_DECIMALS));
      if (after - before !== expectedRaw) throw new Error("送金先または送金額が申請内容と一致しません");
      return;
    }
    await wait(1_500);
  }
  throw new Error("送金成功を確認できませんでした。申請状態は変更されていません");
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
async function getMonthlyApplied(userId: string, monthStart: Date, monthEnd: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(purchaseRequestsTable)
    .where(and(
      eq(purchaseRequestsTable.userId, userId),
      or(eq(purchaseRequestsTable.status, "pending"), eq(purchaseRequestsTable.status, "approved")),
      gte(purchaseRequestsTable.createdAt, monthStart),
      lt(purchaseRequestsTable.createdAt, monthEnd),
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
    const cycle = getApplicationCycle(now);
    const monthStart = cycle.start;
    const monthEnd = cycle.end;

    const [eventSettings, requests] = await Promise.all([
      getEventSettings(),
      db.select().from(purchaseRequestsTable)
        .where(eq(purchaseRequestsTable.userId, userId))
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(50),
    ]);

    const [monthlyBought, monthlyApplied, baseDailyLimit, dailyUsed, hasLeonSkill] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart, monthEnd),
      getDailyLimit(eventSettings.isEventDay),
      getDailyUsed(userId),
      hasActivePetSkill(userId, "leon"),
    ]);
    const dailyLimit = baseDailyLimit + (hasLeonSkill ? 100_000 : 0);
    const monthlyCapacity = dailyLimit * cycle.remainingDays;

    const effectiveTotalBought = Math.min(monthlyBought, monthlyCapacity);
    // During the 16th-start migration, past purchases/applications must not
    // reduce the capacity calculated only from the days still remaining.
    const available = monthlyCapacity;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);
    const effectiveLimit = Math.min(dailyRemaining, available);

    res.json({
      requests,
      totalBought: effectiveTotalBought,      // 購入済み枚数（キャップ適用後）
      monthlyBought,                           // 当月の実購入合計（情報表示用）
      monthlyCapacity,                         // 当月の購入反映上限 = 通常日上限 × 月日数
      remainingDays: cycle.remainingDays,
      periodStart: cycle.start.toISOString(),
      periodEnd: cycle.end.toISOString(),
      totalApplied: monthlyApplied,            // 当月の申請済み
      available,
      dailyLimit,
      dailyUsed,
      dailyRemaining,
      isEventMode: eventSettings.isEventDay,
      hasLeonSkill,
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
    const cycle = getApplicationCycle(now);
    const monthStart = cycle.start;
    const monthEnd = cycle.end;

    const eventSettings = await getEventSettings();

    const [monthlyBought, monthlyApplied, dailyLimit, dailyUsed] = await Promise.all([
      getMonthlyBought(userId, monthStart, monthEnd),
      getMonthlyApplied(userId, monthStart, monthEnd),
      getUserDailyLimit(userId, eventSettings.isEventDay),
      getDailyUsed(userId),
    ]);
    const monthlyCapacity = dailyLimit * cycle.remainingDays;

    const effectiveTotalBought = Math.min(monthlyBought, monthlyCapacity);
    const available = monthlyCapacity;
    const dailyRemaining = Math.max(0, dailyLimit - dailyUsed);

    // ① 1日の申請上限チェック
    if (numAmount > dailyRemaining) {
      res.status(400).json({
        error: `本日の申請上限を超えています（本日残り: ${dailyRemaining.toLocaleString()} INMU / 1日上限: ${dailyLimit.toLocaleString()} INMU）`,
        dailyLimit, dailyUsed, dailyRemaining,
      });
      return;
    }

    // ② 16日開始の申請期間における残り上限チェック
    if (numAmount > available) {
      res.status(400).json({
        error: `申請可能枚数を超えています（今月の申請可能: ${available.toLocaleString()} INMU / 残り${cycle.remainingDays}日）`,
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

    if (status === "approved" && numRebate != null && numRebate > 0 && request.status !== "approved") {
      const signature = rebateTxSignature?.trim() ?? "";
      if (!signature) { res.status(400).json({ error: "送金成功後のTXIDが必要です" }); return; }
      const [recipient] = await db.select({ solWallet: profileTable.solWallet })
        .from(profileTable).where(eq(profileTable.userId, request.userId));
      if (!recipient?.solWallet) { res.status(400).json({ error: "送金先ウォレットが未設定です" }); return; }
      try {
        await verifyOutboundInmuTransfer(signature, recipient.solWallet, numRebate);
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "送金確認に失敗しました" });
        return;
      }
    }

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

    if (status === "approved" && request.status !== "approved" && numRebate != null && numRebate > 0) {
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
