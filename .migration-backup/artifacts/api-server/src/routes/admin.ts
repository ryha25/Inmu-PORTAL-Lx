import { Router } from "express";
import { db } from "@workspace/db";
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
        participationCount: profileTable.participationCount,
        xId: profileTable.xId,
        discordId: profileTable.discordId,
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

router.post("/admin/balance", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId!;
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
    const adminId = req.userId!;
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
    const adminId = req.userId!;
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
    const adminId = req.userId!;
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
    const adminId = req.userId!;
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
    const adminId = req.userId!;
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
    const adminId = req.userId!;
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
  const adminId = req.userId!;
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
  const adminId = req.userId!;
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
  const adminId = req.userId!;
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

router.post("/admin/set-role", requireAdmin, async (req, res): Promise<void> => {
  const adminId = req.userId!;
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
