import { Router } from "express";
import { db } from "@workspace/db";
import {
  profileTable,
  transactionsTable,
  notificationsTable,
  emergencyAuthTable,
  auditLogTable,
} from "@workspace/db/schema";
import { eq, or, and, not, sql, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";
import bcrypt from "bcryptjs";

const router = Router();

interface FailRecord { count: number; lockedUntil: number }
const passcodeFailMap = new Map<string, FailRecord>();

function checkLock(key: string): { locked: boolean; remainingMs: number } {
  const rec = passcodeFailMap.get(key);
  if (!rec) return { locked: false, remainingMs: 0 };
  if (rec.lockedUntil > Date.now()) return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  return { locked: false, remainingMs: 0 };
}

function recordFail(key: string): boolean {
  const rec = passcodeFailMap.get(key) ?? { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= 5) {
    rec.lockedUntil = Date.now() + 30 * 60 * 1000;
    rec.count = 0;
    passcodeFailMap.set(key, rec);
    return true;
  }
  passcodeFailMap.set(key, rec);
  return false;
}

function clearFail(key: string) { passcodeFailMap.delete(key); }

router.get("/transfer/user-search", requireAuth, async (req, res): Promise<void> => {
  const q = ((req.query.q as string) ?? "").trim();
  const userId = req.userId!;

  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  try {
    const pattern = `%${q}%`;
    const users = await db
      .select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        solWallet: profileTable.solWallet,
        xId: profileTable.xId,
        discordId: profileTable.discordId,
      })
      .from(profileTable)
      .where(
        and(
          not(eq(profileTable.userId, userId)),
          or(
            ilike(profileTable.displayName, pattern),
            ilike(profileTable.solWallet, pattern),
            ilike(profileTable.xId, pattern),
            ilike(profileTable.discordId, pattern),
          ),
        ),
      )
      .limit(10);

    res.json(users.filter((u) => u.solWallet));
  } catch (e) {
    console.error("[Transfer/Search]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/transfer/verify-passcode", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { passcode } = req.body as { passcode?: string };

  if (!passcode) {
    res.status(400).json({ error: "passcode required" });
    return;
  }

  const lockKey = `transfer:${userId}`;
  const lock = checkLock(lockKey);
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `パスコードがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  try {
    const [profile] = await db
      .select({ passcodeHash: profileTable.passcodeHash })
      .from(profileTable)
      .where(eq(profileTable.userId, userId));

    if (!profile?.passcodeHash) {
      res.status(400).json({ error: "パスコードが設定されていません" });
      return;
    }

    const normalValid = await bcrypt.compare(passcode, profile.passcodeHash);
    if (!normalValid) {
      const [emrg] = await db.select().from(emergencyAuthTable).where(eq(emergencyAuthTable.userId, userId));
      const emrgValid = emrg?.passcodeEnabled && emrg.emergencyPasscodeHash
        ? await bcrypt.compare(passcode, emrg.emergencyPasscodeHash)
        : false;
      if (!emrgValid) {
        const locked = recordFail(lockKey);
        if (locked) {
          res.status(429).json({ error: "5回失敗しました。30分間ロックされます。" });
        } else {
          res.status(401).json({ error: "パスコードが正しくありません" });
        }
        return;
      }
      await db.insert(auditLogTable).values({
        adminId: "SYSTEM", action: "emergency_passcode_used", targetUserId: userId,
        details: { usedAt: new Date().toISOString() } as Record<string, unknown>,
        createdAt: new Date(),
      });
    }

    clearFail(lockKey);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/transfer/send", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { toUserId, amount, memo, passcode, txHash } = req.body as {
    toUserId?: string;
    amount?: number;
    memo?: string;
    passcode?: string;
    txHash?: string;
  };

  if (!toUserId || !amount || amount <= 0) {
    res.status(400).json({ error: "toUserId と amount が必要です" });
    return;
  }
  if (!passcode) {
    res.status(400).json({ error: "passcode required" });
    return;
  }

  const lockKey = `transfer:${userId}`;
  const lock = checkLock(lockKey);
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `パスコードがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  try {
    const [sender] = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, userId));

    if (!sender) {
      res.status(404).json({ error: "プロフィールが見つかりません" });
      return;
    }

    if (!sender.passcodeHash) {
      res.status(400).json({ error: "パスコードが設定されていません" });
      return;
    }

    const normalValid2 = await bcrypt.compare(passcode, sender.passcodeHash);
    if (!normalValid2) {
      const [emrg] = await db.select().from(emergencyAuthTable).where(eq(emergencyAuthTable.userId, userId));
      const emrgValid = emrg?.passcodeEnabled && emrg.emergencyPasscodeHash
        ? await bcrypt.compare(passcode, emrg.emergencyPasscodeHash)
        : false;
      if (!emrgValid) {
        const locked = recordFail(lockKey);
        if (locked) {
          res.status(429).json({ error: "5回失敗しました。30分間ロックされます。" });
        } else {
          res.status(401).json({ error: "パスコードが正しくありません" });
        }
        return;
      }
      await db.insert(auditLogTable).values({
        adminId: "SYSTEM", action: "emergency_passcode_used", targetUserId: userId,
        details: { action: "send", usedAt: new Date().toISOString() } as Record<string, unknown>,
        createdAt: new Date(),
      });
    }

    clearFail(lockKey);

    if (toUserId === userId) {
      res.status(400).json({ error: "自分自身への送金はできません" });
      return;
    }

    const [recipient] = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.userId, toUserId));

    if (!recipient) {
      res.status(404).json({ error: "送金先ユーザーが見つかりません" });
      return;
    }

    if (!recipient.solWallet) {
      res.status(400).json({ error: "送金先にSOLアドレスが登録されていません" });
      return;
    }

    const amountStr = String(amount);
    const memoText = memo?.trim() || "INMU送金";
    const now = new Date();

    await db.insert(transactionsTable).values({
      userId,
      type: "send",
      amount: amountStr,
      counterparty: recipient.displayName,
      counterpartyId: toUserId,
      memo: memoText,
      txHash: txHash ?? null,
      createdAt: now,
    });

    await db.insert(transactionsTable).values({
      userId: toUserId,
      type: "receive",
      amount: amountStr,
      counterparty: sender.displayName,
      counterpartyId: userId,
      memo: memoText,
      txHash: txHash ?? null,
      createdAt: now,
    });

    await db
      .update(profileTable)
      .set({
        totalSent: sql`${profileTable.totalSent} + ${amountStr}`,
        updatedAt: now,
      })
      .where(eq(profileTable.userId, userId));

    await db
      .update(profileTable)
      .set({
        totalReceived: sql`${profileTable.totalReceived} + ${amountStr}`,
        updatedAt: now,
      })
      .where(eq(profileTable.userId, toUserId));

    await db.insert(notificationsTable).values({
      userId: toUserId,
      type: "transfer",
      title: "INMU受取",
      message: `${sender.displayName} から ${amount} INMU を受け取りました${txHash ? `\nTxHash: ${txHash}` : ""}`,
    });

    res.json({ ok: true, txHash: txHash ?? null });
  } catch (e) {
    console.error("[Transfer/Send]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
