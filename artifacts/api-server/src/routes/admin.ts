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
} from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/session";

const router = Router();

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
const ADMIN_WALLET_SETTING_KEY = "admin_wallet";
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

// ── 管理ウォレットアドレス取得（サーバー側永続: ブラウザ跨ぎで共有） ──
router.get("/admin/wallet", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureSettingsTable();
    const r = await pool.query(
      "SELECT value FROM app_settings WHERE key = $1",
      [ADMIN_WALLET_SETTING_KEY],
    );
    res.json({ wallet: (r.rows[0]?.value as string | undefined) ?? null });
  } catch (e) {
    console.error("[Admin] get wallet error:", e);
    // DBエラーは5xxで返す。null(=未接続)と障害をクライアントが区別できるようにする
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理ウォレットアドレス保存 ──
router.post("/admin/wallet", requireAdmin, async (req, res): Promise<void> => {
  const { wallet } = req.body as { wallet?: string };
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
      [ADMIN_WALLET_SETTING_KEY, wallet],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("[Admin] save wallet error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理ウォレットアドレス削除（切断時） ──
router.delete("/admin/wallet", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureSettingsTable();
    await pool.query("DELETE FROM app_settings WHERE key = $1", [
      ADMIN_WALLET_SETTING_KEY,
    ]);
    res.json({ ok: true });
  } catch (e) {
    console.error("[Admin] delete wallet error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    const users = await db
      .select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        role: profileTable.role,
        balance: profileTable.balance,
        savingsBalance: profileTable.savingsBalance,
        totalReceived: profileTable.totalReceived,
        totalSent: profileTable.totalSent,
        monthlyPoints: profileTable.monthlyPoints,
        participationCount: profileTable.participationCount,
        xId: profileTable.xId,
        discordId: profileTable.discordId,
        solWallet: profileTable.solWallet,
        createdAt: profileTable.createdAt,
      })
      .from(profileTable)
      .orderBy(sql`${profileTable.createdAt} DESC`);
    res.json(
      users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ユーザー取引履歴（管理者用） ──
router.get("/admin/user-transactions", requireAdmin, async (req, res): Promise<void> => {
  const userId = req.query.userId as string | undefined;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, userId))
      .orderBy(sql`${transactionsTable.createdAt} DESC`)
      .limit(50);
    res.json(rows.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── SOL実送金記録（管理者用） ──
router.post("/admin/record-sol-transfer", requireAdmin, async (req, res): Promise<void> => {
  const adminId = "admin";
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

router.post("/admin/balance", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? "admin";
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
    const adminId = req.userId ?? "admin";
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
    const adminId = req.userId ?? "admin";
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
    const adminId = req.userId ?? "admin";
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
          type: "airdrop",
          amount: String(amount),
          memo,
        });
        await db
          .update(profileTable)
          .set({
            balance: sql`${profileTable.balance} + ${amount}`,
            participationCount: sql`${profileTable.participationCount} + 1`,
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
    const adminId = req.userId ?? "admin";
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
    const adminId = req.userId ?? "admin";
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
    const rows = await db
      .select()
      .from(auditLogTable)
      .orderBy(sql`${auditLogTable.createdAt} DESC`)
      .limit(500);
    res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get(
  "/admin/backup-csv",
  requireAdmin,
  async (req, res): Promise<void> => {
    const adminId = req.userId ?? "admin";
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
  const adminCode = process.env.ADMIN_CODE ?? "0000";
  if (!code || code !== adminCode) {
    res.status(403).json({ error: "Invalid admin code" });
    return;
  }
  res.json({ ok: true });
});

router.post("/admin/grant-points", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? "admin";
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
      await notify(uid, "points", `${amount}ポイントが付与されました`, reason ?? `${amount} pts`);
    }
    await logAudit(adminId, "adminGrantPoints", undefined, { targetUserIds, amount, reason });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/send-notification", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? "admin";
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
  const adminId = req.userId ?? "admin";
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
  const adminId = req.userId ?? "admin";
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
      await notify(u.userId, "points", `${amount}ポイントが付与されました`, reason ?? `${amount} pts`);
    }
    await logAudit(adminId, "adminGrantPointsAll", undefined, { count: allUsers.length, amount, reason });
    res.json({ ok: true, count: allUsers.length });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/distribute-airdrop-all", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId ?? "admin";
  const { amount, memo } = req.body as { amount?: number; memo?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ error: "amount required" });
    return;
  }
  try {
    const allUsers = await db.select({ userId: profileTable.userId }).from(profileTable);
    for (const u of allUsers) {
      await db.insert(transactionsTable).values({ userId: u.userId, type: "airdrop", amount: String(amount), memo });
      await db
        .update(profileTable)
        .set({ balance: sql`${profileTable.balance} + ${amount}`, participationCount: sql`${profileTable.participationCount} + 1`, updatedAt: new Date() })
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
  const adminId = req.userId ?? "admin";
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

export default router;
