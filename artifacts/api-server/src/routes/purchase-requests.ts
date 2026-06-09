import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchaseRequestsTable,
  systemSettingsTable,
  transactionsTable,
  notificationsTable,
  profileTable,
  auditLogTable,
} from "@workspace/db/schema";
import { eq, desc, and, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

async function getPurchaseAdminLimit(): Promise<number> {
  try {
    const [setting] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, "purchase_request_limit"));
    return setting ? Number(setting.value) : 1000000;
  } catch {
    return 1000000;
  }
}

// Fetch user's applied amount (pending + approved — not rejected)
async function getTotalApplied(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(cast(amount as numeric)), 0)` })
    .from(purchaseRequestsTable)
    .where(and(
      eq(purchaseRequestsTable.userId, userId),
      or(eq(purchaseRequestsTable.status, "pending"), eq(purchaseRequestsTable.status, "approved")),
    ));
  return Number(row?.total ?? 0);
}

// ── ユーザー: 自分の申請一覧 ──
router.get("/purchase-requests", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const [requests, adminLimit, profile, totalApplied] = await Promise.all([
      db.select().from(purchaseRequestsTable)
        .where(eq(purchaseRequestsTable.userId, userId))
        .orderBy(desc(purchaseRequestsTable.createdAt))
        .limit(50),
      getPurchaseAdminLimit(),
      db.select({ totalBought: profileTable.totalBought }).from(profileTable).where(eq(profileTable.userId, userId)).then(r => r[0]),
      getTotalApplied(userId),
    ]);

    const totalBought = Number(profile?.totalBought ?? 0);
    const available = Math.max(0, totalBought - totalApplied);
    const effectiveLimit = Math.min(adminLimit, available > 0 || totalBought > 0 ? available : adminLimit);

    res.json({ requests, adminLimit, totalBought, totalApplied, effectiveLimit });
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
    const [adminLimit, profile, totalApplied] = await Promise.all([
      getPurchaseAdminLimit(),
      db.select({ totalBought: profileTable.totalBought }).from(profileTable).where(eq(profileTable.userId, userId)).then(r => r[0]),
      getTotalApplied(userId),
    ]);

    const totalBought = Number(profile?.totalBought ?? 0);
    const available = Math.max(0, totalBought - totalApplied);

    if (numAmount > adminLimit) {
      res.status(400).json({
        error: `申請上限を超えています（管理者設定上限: ${adminLimit.toLocaleString()} INMU）`,
        adminLimit, totalBought, totalApplied,
      });
      return;
    }

    if (totalBought > 0 && numAmount > available) {
      res.status(400).json({
        error: `申請可能枚数を超えています（申請可能: ${available.toLocaleString()} INMU = 購入済み ${totalBought.toLocaleString()} - 申請済み ${totalApplied.toLocaleString()}）`,
        adminLimit, totalBought, totalApplied,
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

// ── 管理者: 全申請一覧 ──
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

    await db.update(purchaseRequestsTable).set({
      status,
      reviewedByAdminId: "admin",
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
        adminId: "admin", action: "purchase_request_approved", targetUserId: request.userId,
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
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
