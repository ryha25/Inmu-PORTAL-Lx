import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  profileTable,
  userTable,
  transactionsTable,
  rewardsTable,
  jarsTable,
  goalsTable,
  notificationsTable,
  pointsTable,
  loginStreaksTable,
  auditLogTable,
  emergencyAuthTable,
  purchaseRequestsTable,
  missionParticipationsTable,
  missionCompletionsTable,
  tradeHistoryTable,
  systemSettingsTable,
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/session";
import { resolveAdminCode } from "./admin-auth";
import bcrypt from "bcryptjs";

const router = Router();

// ── Rate limiting: admin passcode verify (5 fails → 30 min lock) ──
interface FailRecord { count: number; lockedUntil: number }
const passcodeFailMap = new Map<string, FailRecord>();

function checkPasscodeLock(): { locked: boolean; remainingMs: number } {
  const rec = passcodeFailMap.get("admin_verify");
  if (!rec) return { locked: false, remainingMs: 0 };
  if (rec.lockedUntil > Date.now()) return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  return { locked: false, remainingMs: 0 };
}
function recordPasscodeFail(): boolean {
  const rec = passcodeFailMap.get("admin_verify") ?? { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= 5) {
    rec.lockedUntil = Date.now() + 30 * 60 * 1000;
    rec.count = 0;
    passcodeFailMap.set("admin_verify", rec);
    return true;
  }
  passcodeFailMap.set("admin_verify", rec);
  return false;
}
function clearPasscodeFail() { passcodeFailMap.delete("admin_verify"); }

async function logAudit(
  adminId: string,
  action: string,
  targetUserId?: string,
  details?: unknown,
) {
  await db.insert(auditLogTable).values({
    adminId,
    action,
    targetUserId,
    details: details as Record<string, unknown>,
    createdAt: new Date(),
  });
}

async function notify(
  userId: string,
  type: string,
  title: string,
  message?: string,
) {
  await db.insert(notificationsTable).values({ userId, type, title, message });
}

// ── アプリ設定（KV）テーブル: マイグレーション不要で自動作成 ──
function adminWalletKey(adminType?: string): string {
  return `admin_wallet_${adminType ?? "owner"}`;
}
let settingsTableReady = false;
async function ensureSettingsTable() {
  if (settingsTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  settingsTableReady = true;
}

// ── 管理ウォレットアドレス取得（adminTypeごとに分離） ──
router.get("/admin/wallet", requireAdmin, async (req, res): Promise<void> => {
  const key = adminWalletKey(req.adminType);
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [key],
    );
    res.json({ wallet: (r.rows[0]?.value as string | undefined) ?? null, adminType: req.adminType ?? "owner" });
  } catch (e) {
    console.error("[Admin] get wallet error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理ウォレットアドレス保存 ──
router.post("/admin/wallet", requireAdmin, async (req, res): Promise<void> => {
  const { wallet } = req.body as { wallet?: string };
  const key = adminWalletKey(req.adminType);
  // Solanaアドレスは base58 32〜44文字
  if (!wallet || typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
    res.status(400).json({ error: "valid wallet address required" });
    return;
  }
  try {
    await ensureSettingsTable();
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, wallet],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Admin] save wallet error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理ウォレットアドレス削除（切断時） ──
router.delete("/admin/wallet", requireAdmin, async (req, res): Promise<void> => {
  const key = adminWalletKey(req.adminType);
  try {
    await ensureSettingsTable();
    await pool.query("DELETE FROM app_settings WHERE key = $1", [key]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[Admin] delete wallet error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        p."userId",
        p."displayName",
        p.role,
        p.balance,
        p."savingsBalance",
        p."totalReceived",
        p."totalSent",
        p."monthlyPoints",
        p."participationCount",
        p."xId",
        p."discordId",
        p."solWallet",
        p."totalBought",
        p."totalSold",
        p."lastBuyAt",
        p."lastSellAt",
        p."createdAt",
        ls."lastLogin",
        ls.streak AS "loginStreak",
        COALESCE((
          SELECT sum(amount)
          FROM points
          WHERE "userId" = p."userId"
            AND amount > 0
        ), 0)::numeric AS "totalPoints",
        COALESCE((
          SELECT count(*) FROM points WHERE "userId" = p."userId" AND type = 'daily_login'
        ), 0)::int AS "totalLoginDays",
        COALESCE((
          SELECT count(*)
          FROM "missionParticipations" mp
          JOIN missions m ON m.id = mp."missionId"
          WHERE mp."userId" = p."userId"
            AND mp.status = 'rewarded'
            AND m.type = 'achievement'
        ), 0)::int AS "achievementCount"
      FROM profile p
      LEFT JOIN "loginStreaks" ls ON ls."userId" = p."userId"
      ORDER BY p."createdAt" DESC
    `);
    res.json(
      result.rows.map((u) => ({
        ...u,
        createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        lastBuyAt: u.lastBuyAt ? new Date(u.lastBuyAt).toISOString() : null,
        lastSellAt: u.lastSellAt ? new Date(u.lastSellAt).toISOString() : null,
        lastLogin: u.lastLogin ? new Date(u.lastLogin).toISOString() : null,
        loginStreak: u.loginStreak ?? 0,
        totalLoginDays: u.totalLoginDays ?? 0,
        achievementCount: u.achievementCount ?? 0,
        totalPoints: u.totalPoints ?? "0",
      })),
    );
  } catch (e) {
    console.error("[Admin] users query error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー削除（管理者用） ──
router.delete("/admin/users/:userId", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const targetUserId = req.params.userId;
  try {
    await logAudit(adminId, "deleteUser", targetUserId);
    await db.delete(missionParticipationsTable).where(eq(missionParticipationsTable.userId, targetUserId));
    await db.delete(missionCompletionsTable).where(eq(missionCompletionsTable.userId, targetUserId));
    await db.delete(purchaseRequestsTable).where(eq(purchaseRequestsTable.userId, targetUserId));
    await db.delete(tradeHistoryTable).where(eq(tradeHistoryTable.userId, targetUserId));
    await db.delete(transactionsTable).where(eq(transactionsTable.userId, targetUserId));
    await db.delete(rewardsTable).where(eq(rewardsTable.userId, targetUserId));
    await db.delete(jarsTable).where(eq(jarsTable.userId, targetUserId));
    await db.delete(goalsTable).where(eq(goalsTable.userId, targetUserId));
    await db.delete(notificationsTable).where(eq(notificationsTable.userId, targetUserId));
    await db.delete(pointsTable).where(eq(pointsTable.userId, targetUserId));
    await db.delete(loginStreaksTable).where(eq(loginStreaksTable.userId, targetUserId));
    await db.delete(emergencyAuthTable).where(eq(emergencyAuthTable.userId, targetUserId));
    await db.delete(profileTable).where(eq(profileTable.userId, targetUserId));
    await db.delete(userTable).where(eq(userTable.id, targetUserId));
    res.json({ ok: true });
  } catch (e) {
    console.error("[DeleteUser]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー取引履歴（管理者用）: INMU送受信 + ポイント + エアドロ + DEX取引を統合 ──
router.get("/admin/user-transactions", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  try {
    const [txRows, tradeRows] = await Promise.all([
      db.select().from(transactionsTable)
        .where(eq(transactionsTable.userId, userId))
        .orderBy(sql`${transactionsTable.createdAt} DESC`)
        .limit(100),
      db.select().from(tradeHistoryTable)
        .where(eq(tradeHistoryTable.userId, userId))
        .orderBy(sql`${tradeHistoryTable.tradedAt} DESC`)
        .limit(100),
    ]);

    type UnifiedRow = {
      id: number;
      source: "tx" | "trade";
      type: string;
      amount: string;
      memo: string | null;
      counterparty: string | null;
      txHash: string | null;
      createdAt: string;
    };

    const unified: UnifiedRow[] = [
      ...txRows.map((t) => ({
        id: t.id,
        source: "tx" as const,
        type: t.type,
        amount: t.amount,
        memo: t.memo ?? null,
        counterparty: t.counterparty ?? null,
        txHash: t.txHash ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
      ...tradeRows.map((t) => ({
        id: t.id + 1000000,
        source: "trade" as const,
        type: t.type === "buy" ? "dex_buy" : "dex_sell",
        amount: t.tokenAmount,
        memo: t.dex ? `DEX: ${t.dex}` : "DEX取引",
        counterparty: t.walletAddress,
        txHash: t.txSignature,
        createdAt: t.tradedAt.toISOString(),
      })),
    ];

    unified.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json(unified.slice(0, 100));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── SOL実送金記録（管理者用） ──
router.post("/admin/record-sol-transfer", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserId, amount, txSignature, targetWallet } = req.body as {
    targetUserId?: string;
    amount?: number;
    txSignature?: string;
    targetWallet?: string;
  };
  if (!targetUserId || !amount || amount <= 0 || !txSignature) {
    res.status(400).json({ error: "targetUserId, amount, txSignature required" });
    return;
  }
  try {
    // オンチェーンでトランザクションが確定済みか確認してからDBを更新する
    const rpcUrl = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
    let txConfirmed = false;
    try {
      const rpcRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getTransaction",
          params: [txSignature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (rpcRes.ok) {
        const rpcData = await rpcRes.json() as { result?: { meta?: { err: unknown } | null } | null };
        const txResult = rpcData?.result;
        if (txResult && txResult.meta !== undefined) {
          txConfirmed = txResult.meta?.err === null;
        }
      }
    } catch (rpcError) {
      console.warn("[AdminSolTransfer] RPC verification failed, proceeding with caution:", rpcError);
      // RPC 接続失敗時は処理を中断して管理者に確認を求める
      res.status(502).json({ error: "オンチェーン送金の確認に失敗しました。ネットワークを確認して再試行してください。" });
      return;
    }
    if (!txConfirmed) {
      res.status(400).json({ error: "指定された txSignature はオンチェーンで確定していないか、トランザクションが失敗しています。送金完了後に再度記録してください。" });
      return;
    }

    // 取引履歴に記録
    await db.insert(transactionsTable).values({
      userId: targetUserId,
      type: "airdrop",
      amount: String(amount),
      memo: `実INMU送金 (tx: ${txSignature.slice(0, 12)}…)`,
      counterparty: "管理者ウォレット",
    });
    // 残高更新
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} + ${amount}`,
        totalReceived: sql`${profileTable.totalReceived} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, targetUserId));
    // 通知
    await notify(
      targetUserId,
      "airdrop",
      `${amount} INMU を受け取りました`,
      `オンチェーン送金完了 (sig: ${txSignature.slice(0, 16)}…)`,
    );
    // 監査ログ
    await logAudit(adminId, "adminSolTransfer", targetUserId, {
      amount,
      txSignature,
      targetWallet,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/record-airdrop-batch", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { users: targetUsers, amount, txSignature, memo } = req.body as {
    users?: Array<{ userId: string; wallet: string }>;
    amount?: number;
    txSignature?: string;
    memo?: string;
  };
  if (!targetUsers?.length || !amount || amount <= 0 || !txSignature) {
    res.status(400).json({ error: "users, amount, txSignature required" });
    return;
  }
  try {
    for (const u of targetUsers) {
      await db.insert(transactionsTable).values({
        userId: u.userId,
        type: "airdrop",
        amount: String(amount),
        memo: memo ?? `エアドロップ (tx: ${txSignature.slice(0, 12)}…)`,
        counterparty: "管理者ウォレット",
      });
      await db
        .update(profileTable)
        .set({
          balance: sql`${profileTable.balance} + ${amount}`,
          totalReceived: sql`${profileTable.totalReceived} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, u.userId));
      await notify(u.userId, "airdrop", "エアドロップを受け取りました", `${amount} INMU (オンチェーン)`);
    }
    await logAudit(adminId, "adminAirdropBatch", undefined, {
      count: targetUsers.length,
      amount,
      txSignature,
    });
    res.json({ ok: true, count: targetUsers.length });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/balance", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserId, newBalance, reason } = req.body as {
    targetUserId?: string;
    newBalance?: number;
    reason?: string;
  };
  if (!targetUserId || newBalance === undefined) {
    res.status(400).json({ error: "targetUserId and newBalance required" });
    return;
  }
  try {
    await db
      .update(profileTable)
      .set({ balance: String(newBalance), updatedAt: new Date() })
      .where(eq(profileTable.userId, targetUserId));
    await logAudit(adminId, "adminSetBalance", targetUserId, {
      newBalance,
      reason,
    });
    await notify(
      targetUserId,
      "balance",
      "残高が更新されました",
      reason ?? `新しい残高: ${newBalance}`,
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post(
  "/admin/register-tx",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    const { targetUserId, type, amount, memo } = req.body as {
      targetUserId?: string;
      type?: string;
      amount?: number;
      memo?: string;
    };
    if (!targetUserId || !type || !amount) {
      res.status(400).json({ error: "targetUserId, type, amount required" });
      return;
    }
    try {
      await db.insert(transactionsTable).values({
        userId: targetUserId,
        type,
        amount: String(amount),
        memo,
      });
      const isIncoming = !["withdraw", "send"].includes(type);
      if (isIncoming) {
        await db
          .update(profileTable)
          .set({
            balance: sql`${profileTable.balance} + ${amount}`,
            totalReceived: sql`${profileTable.totalReceived} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(profileTable.userId, targetUserId));
      } else {
        await db
          .update(profileTable)
          .set({
            balance: sql`${profileTable.balance} - ${amount}`,
            totalSent: sql`${profileTable.totalSent} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(profileTable.userId, targetUserId));
      }
      await logAudit(adminId, "adminRegisterTx", targetUserId, {
        type,
        amount,
        memo,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.post(
  "/admin/distribute-reward",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    const { targetUserId, rewardType, amount, memo } = req.body as {
      targetUserId?: string;
      rewardType?: string;
      amount?: number;
      memo?: string;
    };
    if (!targetUserId || !rewardType || !amount) {
      res.status(400).json({ error: "targetUserId, rewardType, amount required" });
      return;
    }
    try {
      await db.insert(rewardsTable).values({
        userId: targetUserId,
        type: rewardType,
        amount: String(amount),
        memo,
      });
      await db.insert(transactionsTable).values({
        userId: targetUserId,
        type: "reward",
        amount: String(amount),
        category: rewardType,
        memo,
      });
      await db
        .update(profileTable)
        .set({
          balance: sql`${profileTable.balance} + ${amount}`,
          totalReceived: sql`${profileTable.totalReceived} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, targetUserId));
      await notify(
        targetUserId,
        "reward",
        "報酬を受け取りました",
        `${amount} INMU (${memo ?? rewardType})`,
      );
      await logAudit(adminId, "adminDistributeReward", targetUserId, {
        rewardType,
        amount,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.post(
  "/admin/distribute-airdrop",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    const { targetUserIds, amount, memo } = req.body as {
      targetUserIds?: string[];
      amount?: number;
      memo?: string;
    };
    if (!targetUserIds?.length || !amount) {
      res.status(400).json({ error: "targetUserIds and amount required" });
      return;
    }
    try {
      for (const uid of targetUserIds) {
        await db.insert(transactionsTable).values({
          userId: uid,
          type: "inmu_send",
          amount: String(amount),
          memo,
        });
        await db
          .update(profileTable)
          .set({
            balance: sql`${profileTable.balance} + ${amount}`,
            updatedAt: new Date(),
          })
          .where(eq(profileTable.userId, uid));
        await notify(uid, "airdrop", "エアドロップを受け取りました", `${amount} INMU`);
      }
      await logAudit(adminId, "adminDistributeAirdrop", undefined, {
        count: targetUserIds.length,
        amount,
      });
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.post(
  "/admin/reset-user",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    const { targetUserId, resetType } = req.body as {
      targetUserId?: string;
      resetType?: "balance" | "history" | "all";
    };
    if (!targetUserId || !resetType) {
      res.status(400).json({ error: "targetUserId and resetType required" });
      return;
    }
    try {
      if (resetType === "balance" || resetType === "all") {
        await db
          .update(profileTable)
          .set({ balance: "0", savingsBalance: "0", updatedAt: new Date() })
          .where(eq(profileTable.userId, targetUserId));
      }
      if (resetType === "history" || resetType === "all") {
        await db
          .delete(transactionsTable)
          .where(eq(transactionsTable.userId, targetUserId));
        await db
          .delete(rewardsTable)
          .where(eq(rewardsTable.userId, targetUserId));
      }
      if (resetType === "all") {
        await db.delete(jarsTable).where(eq(jarsTable.userId, targetUserId));
        await db.delete(goalsTable).where(eq(goalsTable.userId, targetUserId));
        await db
          .delete(notificationsTable)
          .where(eq(notificationsTable.userId, targetUserId));
        await db.delete(pointsTable).where(eq(pointsTable.userId, targetUserId));
        await db
          .update(profileTable)
          .set({
            totalReceived: "0",
            totalSent: "0",
            monthlyPoints: "0",
            participationCount: 0,
            updatedAt: new Date(),
          })
          .where(eq(profileTable.userId, targetUserId));
      }
      await logAudit(adminId, `adminReset_${resetType}`, targetUserId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.post(
  "/admin/reset-all",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    try {
      await db.delete(transactionsTable);
      await db.delete(rewardsTable);
      await db.delete(jarsTable);
      await db.delete(goalsTable);
      await db.delete(notificationsTable);
      await db.delete(pointsTable);
      await db.delete(loginStreaksTable);
      await db
        .update(profileTable)
        .set({
          balance: "0",
          savingsBalance: "0",
          totalReceived: "0",
          totalSent: "0",
          monthlyPoints: "0",
          participationCount: 0,
        });
      await logAudit(adminId, "adminResetAll");
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.get("/admin/audit", requireAdmin, async (req, res): Promise<void> => {
  try {
    // adminTypeごとに操作履歴を分離
    // owner: "admin_owner" + 移行前レガシー "admin" も含む
    // operator: "admin_operator" のみ
    const adminId = req.adminId ?? "admin_owner";
    const rows = await pool.query(
      adminId === "admin_owner"
        ? `SELECT * FROM "auditLog" WHERE "adminId" IN ('admin_owner', 'admin') ORDER BY "createdAt" DESC LIMIT 500`
        : `SELECT * FROM "auditLog" WHERE "adminId" = $1 ORDER BY "createdAt" DESC LIMIT 500`,
      adminId === "admin_owner" ? [] : [adminId],
    );
    res.json(rows.rows.map((r: { createdAt: Date | string; [k: string]: unknown }) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get(
  "/admin/backup-csv",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? req.adminId ?? "admin";
    try {
      const users = await db
        .select({
          userId: profileTable.userId,
          displayName: profileTable.displayName,
          role: profileTable.role,
          balance: profileTable.balance,
          savingsBalance: profileTable.savingsBalance,
          xId: profileTable.xId,
          discordId: profileTable.discordId,
          discordUsername: profileTable.discordUsername,
          solWallet: profileTable.solWallet,
          participationCount: profileTable.participationCount,
        })
        .from(profileTable);

      const header = [
        "userId",
        "displayName",
        "role",
        "balance",
        "savingsBalance",
        "xId",
        "discordId",
        "discordUsername",
        "solWallet",
        "participationCount",
      ];
      const escape = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [header.join(",")];
      for (const u of users) {
        lines.push(
          [
            u.userId,
            u.displayName,
            u.role,
            u.balance,
            u.savingsBalance,
            u.xId,
            u.discordId,
            u.discordUsername,
            u.solWallet,
            u.participationCount,
          ]
            .map(escape)
            .join(","),
        );
      }
      await logAudit(adminId, "adminBackupCsv");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="inmu-backup.csv"',
      );
      res.send(lines.join("\n"));
    } catch {
      res.status(500).json({ error: "Internal error" });
    }
  },
);

router.post("/admin/verify-code", requireAdmin, async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };
  if (!code) { res.status(400).json({ error: "Code required" }); return; }

  const lock = checkPasscodeLock();
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `パスコードがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  try {
    const adminType = await resolveAdminCode(code);
    if (!adminType) {
      const locked = recordPasscodeFail();
      if (locked) {
        res.status(429).json({ error: "5回失敗しました。30分間ロックされます。" });
      } else {
        res.status(403).json({ error: "パスコードが違います" });
      }
      return;
    }
    clearPasscodeFail();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/grant-points", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserIds, amount, reason } = req.body as {
    targetUserIds?: string[];
    amount?: number;
    reason?: string;
  };
  if (!targetUserIds?.length || !amount || amount <= 0) {
    res.status(400).json({ error: "targetUserIds and amount required" });
    return;
  }
  try {
    for (const uid of targetUserIds) {
      await db
        .update(profileTable)
        .set({
          monthlyPoints: sql`${profileTable.monthlyPoints} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(profileTable.userId, uid));
      await db.insert(transactionsTable).values({
        userId: uid,
        type: "points_send",
        amount: String(amount),
        memo: reason ?? "ポイント送金",
      });
      await notify(uid, "points", `${amount}ポイントが付与されました`, reason ?? `${amount} pts`);
    }
    await logAudit(adminId, "adminGrantPoints", undefined, { targetUserIds, amount, reason });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

async function grantSleepTeaToUser(userId: string, amount: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
    const now = Date.now();
    const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
    const items = state.items && typeof state.items === "object" ? state.items : { sleepTea: 0 };
    state.items = { ...items, sleepTea: Math.max(0, Number(items.sleepTea ?? 0)) + amount };
    await client.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
      ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
    `, [userId, JSON.stringify(state), now]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

router.post("/admin/grant-sleep-tea", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserIds, amount, reason } = req.body as {
    targetUserIds?: string[];
    amount?: number;
    reason?: string;
  };
  if (!targetUserIds?.length || !amount || amount <= 0) {
    res.status(400).json({ error: "targetUserIds and amount required" });
    return;
  }
  try {
    for (const uid of targetUserIds) {
      await grantSleepTeaToUser(uid, amount);
      await notify(uid, "pet", `アイスティーが${amount}個付与されました`, reason ?? `${amount}個`);
    }
    await logAudit(adminId, "adminGrantSleepTea", undefined, { targetUserIds, amount, reason });
    res.json({ ok: true, count: targetUserIds.length });
  } catch (e) {
    console.error("[Admin] grant-sleep-tea error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/grant-sleep-tea-all", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  try {
    const allUsers = await db.select({ userId: profileTable.userId }).from(profileTable);
    for (const u of allUsers) {
      await grantSleepTeaToUser(u.userId, amount);
      await notify(u.userId, "pet", `アイスティーが${amount}個付与されました`, reason ?? `${amount}個`);
    }
    await logAudit(adminId, "adminGrantSleepTeaAll", undefined, { count: allUsers.length, amount, reason });
    res.json({ ok: true, count: allUsers.length });
  } catch (e) {
    console.error("[Admin] grant-sleep-tea-all error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/send-notification", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserIds, title, message } = req.body as {
    targetUserIds?: string[];
    title?: string;
    message?: string;
  };
  if (!targetUserIds?.length || !title?.trim()) {
    res.status(400).json({ error: "targetUserIds and title required" });
    return;
  }
  try {
    for (const uid of targetUserIds) {
      await notify(uid, "admin", title.trim(), message ?? "");
    }
    await logAudit(adminId, "adminSendNotification", undefined, { count: targetUserIds.length, title });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/deduct-balance", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserId, amount, reason } = req.body as {
    targetUserId?: string;
    amount?: number;
    reason?: string;
  };
  if (!targetUserId || !amount || amount <= 0) {
    res.status(400).json({ error: "targetUserId and amount required" });
    return;
  }
  try {
    const profile = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, targetUserId))
      .then((r) => r[0]);
    if (!profile || Number(profile.balance) < amount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }
    await db
      .update(profileTable)
      .set({
        balance: sql`${profileTable.balance} - ${amount}`,
        totalSent: sql`${profileTable.totalSent} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(profileTable.userId, targetUserId));
    await db.insert(transactionsTable).values({
      userId: targetUserId,
      type: "withdraw",
      amount: String(amount),
      memo: reason ?? "管理者による減算",
    });
    await notify(targetUserId, "balance", "残高が減算されました", reason ?? `${amount} INMU`);
    await logAudit(adminId, "adminDeductBalance", targetUserId, { amount, reason });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/grant-points-all", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { amount, reason } = req.body as { amount?: number; reason?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  try {
    const allUsers = await db.select({ userId: profileTable.userId }).from(profileTable);
    for (const u of allUsers) {
      await db
        .update(profileTable)
        .set({ monthlyPoints: sql`${profileTable.monthlyPoints} + ${amount}`, updatedAt: new Date() })
        .where(eq(profileTable.userId, u.userId));
      await db.insert(transactionsTable).values({
        userId: u.userId,
        type: "points_send",
        amount: String(amount),
        memo: reason ?? "全員ポイント送金",
      });
      await notify(u.userId, "points", `${amount}ポイントが付与されました`, reason ?? `${amount} pts`);
    }
    await logAudit(adminId, "adminGrantPointsAll", undefined, { count: allUsers.length, amount, reason });
    res.json({ ok: true, count: allUsers.length });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/distribute-airdrop-all", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { amount, memo } = req.body as { amount?: number; memo?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  try {
    const allUsers = await db.select({ userId: profileTable.userId }).from(profileTable);
    for (const u of allUsers) {
      await db.insert(transactionsTable).values({ userId: u.userId, type: "inmu_send", amount: String(amount), memo });
      await db
        .update(profileTable)
        .set({ balance: sql`${profileTable.balance} + ${amount}`, updatedAt: new Date() })
        .where(eq(profileTable.userId, u.userId));
      await notify(u.userId, "airdrop", "エアドロップを受け取りました", `${amount} INMU`);
    }
    await logAudit(adminId, "adminDistributeAirdropAll", undefined, { count: allUsers.length, amount });
    res.json({ ok: true, count: allUsers.length });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/set-role", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserId, role } = req.body as {
    targetUserId?: string;
    role?: "user" | "admin";
  };
  if (!targetUserId || !role) {
    res.status(400).json({ error: "targetUserId and role required" });
    return;
  }
  try {
    await db
      .update(profileTable)
      .set({ role, updatedAt: new Date() })
      .where(eq(profileTable.userId, targetUserId));
    await logAudit(adminId, "adminSetRole", targetUserId, { role });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/deduct-points", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? req.adminId ?? "admin";
  const { targetUserIds, amount, reason } = req.body as {
    targetUserIds?: string[];
    amount?: number;
    reason?: string;
  };
  if (!targetUserIds?.length || !amount || amount <= 0) {
    res.status(400).json({ error: "targetUserIds and amount required" });
    return;
  }
  try {
    for (const uid of targetUserIds) {
      const profile = await db
        .select({ monthlyPoints: profileTable.monthlyPoints })
        .from(profileTable)
        .where(eq(profileTable.userId, uid))
        .then((r) => r[0]);
      const current = Number(profile?.monthlyPoints ?? 0);
      const newPoints = Math.max(0, current - amount);
      await db
        .update(profileTable)
        .set({ monthlyPoints: String(newPoints), updatedAt: new Date() })
        .where(eq(profileTable.userId, uid));
      await notify(uid, "points", `${amount}ポイントが減算されました`, reason ?? `管理者による減算`);
    }
    await logAudit(adminId, "adminDeductPoints", undefined, { targetUserIds, amount, reason });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Emergency Auth routes ──

router.get("/admin/emergency-auth", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select({
      userId: emergencyAuthTable.userId,
      passwordEnabled: emergencyAuthTable.passwordEnabled,
      passcodeEnabled: emergencyAuthTable.passcodeEnabled,
      setByAdminId: emergencyAuthTable.setByAdminId,
      updatedAt: emergencyAuthTable.updatedAt,
    }).from(emergencyAuthTable);
    const profiles = await db.select({ userId: profileTable.userId, displayName: profileTable.displayName }).from(profileTable);
    const nameMap = Object.fromEntries(profiles.map(p => [p.userId, p.displayName ?? p.userId]));
    res.json(rows.map(r => ({ ...r, displayName: nameMap[r.userId] ?? r.userId })));
  } catch { res.status(500).json({ error: "Internal error" }); }
});

router.get("/admin/emergency-auth/:userId", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { userId } = req.params;
    const [row] = await db.select({
      userId: emergencyAuthTable.userId,
      passwordEnabled: emergencyAuthTable.passwordEnabled,
      passcodeEnabled: emergencyAuthTable.passcodeEnabled,
      hasPassword: sql<boolean>`(${emergencyAuthTable.emergencyPasswordHash} IS NOT NULL)`,
      hasPasscode: sql<boolean>`(${emergencyAuthTable.emergencyPasscodeHash} IS NOT NULL)`,
      setByAdminId: emergencyAuthTable.setByAdminId,
      updatedAt: emergencyAuthTable.updatedAt,
    }).from(emergencyAuthTable).where(eq(emergencyAuthTable.userId, userId));
    res.json(row ?? { userId, passwordEnabled: false, passcodeEnabled: false, hasPassword: false, hasPasscode: false });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

router.put("/admin/emergency-auth/:userId", requireAdmin, async (req, res): Promise<void> => {
  try {
    const adminId = req.userId ?? req.adminId ?? "admin";
    const { userId } = req.params;
    const { password, passcode, passwordEnabled, passcodeEnabled } = req.body as {
      password?: string; passcode?: string; passwordEnabled?: boolean; passcodeEnabled?: boolean;
    };
    const [existing] = await db.select().from(emergencyAuthTable).where(eq(emergencyAuthTable.userId, userId));
    const updates: Record<string, unknown> = { setByAdminId: adminId, updatedAt: new Date() };
    if (typeof passwordEnabled === "boolean") updates.passwordEnabled = passwordEnabled;
    if (typeof passcodeEnabled === "boolean") updates.passcodeEnabled = passcodeEnabled;
    if (password) updates.emergencyPasswordHash = await bcrypt.hash(password, 12);
    if (passcode) updates.emergencyPasscodeHash = await bcrypt.hash(passcode, 12);
    if (existing) {
      await db.update(emergencyAuthTable).set(updates).where(eq(emergencyAuthTable.userId, userId));
    } else {
      await db.insert(emergencyAuthTable).values({ userId, ...updates } as typeof emergencyAuthTable.$inferInsert);
    }
    await db.insert(auditLogTable).values({
      adminId, action: "emergency_auth_updated", targetUserId: userId,
      details: { passwordSet: !!password, passcodeSet: !!passcode, passwordEnabled, passcodeEnabled } as Record<string, unknown>,
      createdAt: new Date(),
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Internal error" }); }
});

router.post("/admin/change-admin-code", requireAdmin, async (req, res): Promise<void> => {
  const { type, currentCode, newCode } = req.body as {
    type?: string;
    currentCode?: string;
    newCode?: string;
  };
  if (!type || !currentCode || !newCode) {
    res.status(400).json({ error: "type, currentCode, newCode が必要です" });
    return;
  }
  if (type !== "owner" && type !== "operator") {
    res.status(400).json({ error: "type は 'owner' または 'operator' である必要があります" });
    return;
  }
  if (newCode.length < 6) {
    res.status(400).json({ error: "新しいコードは6文字以上にしてください" });
    return;
  }
  try {
    const resolvedType = await resolveAdminCode(currentCode);
    if (!resolvedType || resolvedType !== type) {
      res.status(403).json({ error: "現在の管理コードが正しくありません" });
      return;
    }
    const newHash = await bcrypt.hash(newCode, 12);
    const dbKey = type === "owner" ? "admin_code_owner_hash" : "admin_code_operator_hash";
    await db
      .insert(systemSettingsTable)
      .values({ key: dbKey, value: newHash, description: `Admin code hash (${type})`, updatedAt: new Date() })
      .onConflictDoUpdate({ target: systemSettingsTable.key, set: { value: newHash, updatedAt: new Date() } });
    const adminId = req.userId ?? req.adminId ?? "admin";
    await logAudit(adminId, `change_admin_code_${type}`, undefined, { type } as Record<string, unknown>);
    console.info(`[Admin] Admin code changed: type=${type} by ${adminId}`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
