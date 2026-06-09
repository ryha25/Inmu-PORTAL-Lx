import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  userTable,
  profileTable,
  loginStreaksTable,
  transactionsTable,
  jarsTable,
  goalsTable,
  notificationsTable,
  pointsTable,
  activityFeedTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, makeSessionValue } from "../middlewares/session";

const router = Router();

const USER_SESSION_MS = 30 * 60 * 1000;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;

interface FailRecord { count: number; lockedUntil: number }
const loginFailMap = new Map<string, FailRecord>();

function checkLock(key: string): { locked: boolean; remainingMs: number } {
  const rec = loginFailMap.get(key);
  if (!rec) return { locked: false, remainingMs: 0 };
  if (rec.lockedUntil > Date.now()) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  }
  return { locked: false, remainingMs: 0 };
}

function recordFail(key: string, maxFails: number, lockMs: number): boolean {
  const rec = loginFailMap.get(key) ?? { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= maxFails) {
    rec.lockedUntil = Date.now() + lockMs;
    rec.count = 0;
    loginFailMap.set(key, rec);
    return true;
  }
  loginFailMap.set(key, rec);
  return false;
}

function recordSuccess(key: string) {
  loginFailMap.delete(key);
}

function makeEmail(name: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}@inmu.local`;
}

router.get("/session", (req, res): void => {
  if (!req.userId) {
    if (req.sessionExpired) {
      res.status(401).json({ user: null, expired: true });
    } else {
      res.status(401).json({ user: null });
    }
    return;
  }
  res.json({
    user: {
      id: req.userId,
      email: req.userEmail,
      name: req.userName,
    },
  });
});

router.post("/sign-in", async (req, res): Promise<void> => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };
  const identifier = (name || email || "").trim();
  if (!identifier || !password) {
    res.status(400).json({ error: "ユーザー名とパスワードが必要です" });
    return;
  }

  const lockKey = `login:${identifier.toLowerCase()}`;
  const lock = checkLock(lockKey);
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `ログインがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  try {
    const syntheticEmail = makeEmail(identifier);
    let user = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, syntheticEmail))
      .then((r) => r[0]);

    if (!user) {
      user = await db
        .select()
        .from(userTable)
        .where(eq(userTable.email, identifier))
        .then((r) => r[0]);
    }

    if (!user || !user.passwordHash) {
      recordFail(lockKey, LOGIN_MAX_FAILS, LOGIN_LOCK_MS);
      res.status(401).json({ error: "ユーザー名またはパスワードが正しくありません" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const locked = recordFail(lockKey, LOGIN_MAX_FAILS, LOGIN_LOCK_MS);
      if (locked) {
        res.status(429).json({ error: "5回失敗しました。10分間ロックされます。" });
      } else {
        res.status(401).json({ error: "ユーザー名またはパスワードが正しくありません" });
      }
      return;
    }

    recordSuccess(lockKey);
    await ensureProfile(user.id, user.name);

    res.cookie(SESSION_COOKIE, makeSessionValue(user.id, user.email, user.name ?? ""), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: USER_SESSION_MS,
      path: "/",
    });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/sign-up", async (req, res): Promise<void> => {
  const { name, password, passcode } = req.body as {
    name?: string;
    password?: string;
    passcode?: string;
  };
  if (!name?.trim() || !password) {
    res.status(400).json({ error: "全項目を入力してください" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "パスワードは8文字以上にしてください" });
    return;
  }
  if (!passcode || passcode.length < 1) {
    res.status(400).json({ error: "パスコードを入力してください" });
    return;
  }

  const trimmedName = name.trim();
  const email = makeEmail(trimmedName);

  try {
    const existing = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email))
      .then((r) => r[0]);
    if (existing) {
      res.status(400).json({ error: "このユーザー名は既に使用されています" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const passcodeHash = await bcrypt.hash(passcode, 12);
    const userId = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await db.insert(userTable).values({
      id: userId,
      email,
      name: trimmedName,
      passwordHash,
      emailVerified: false,
    });
    await ensureProfile(userId, trimmedName, passcodeHash);

    res.cookie(SESSION_COOKIE, makeSessionValue(userId, email, trimmedName), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: USER_SESSION_MS,
      path: "/",
    });
    res.status(201).json({ user: { id: userId, email, name: trimmedName } });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/sign-out", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

async function ensureProfile(userId: string, displayName: string, passcodeHash?: string) {
  const existing = await db
    .select()
    .from(profileTable)
    .where(eq(profileTable.userId, userId))
    .then((r) => r[0]);
  if (!existing) {
    await db.insert(profileTable).values({ userId, displayName, passcodeHash });
  } else if (passcodeHash && !existing.passcodeHash) {
    await db.update(profileTable).set({ passcodeHash }).where(eq(profileTable.userId, userId));
  }
}

export async function deleteInactiveUsers() {
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  try {
    const allUsers = await db.select({ id: userTable.id, createdAt: userTable.createdAt }).from(userTable);

    for (const user of allUsers) {
      const streak = await db
        .select({ lastLogin: loginStreaksTable.lastLogin })
        .from(loginStreaksTable)
        .where(eq(loginStreaksTable.userId, user.id))
        .then((r) => r[0]);

      const lastActivity = streak?.lastLogin ?? user.createdAt;
      if (lastActivity < cutoff) {
        await db.delete(activityFeedTable).where(eq(activityFeedTable.userId, user.id));
        await db.delete(notificationsTable).where(eq(notificationsTable.userId, user.id));
        await db.delete(pointsTable).where(eq(pointsTable.userId, user.id));
        await db.delete(loginStreaksTable).where(eq(loginStreaksTable.userId, user.id));
        await db.delete(jarsTable).where(eq(jarsTable.userId, user.id));
        await db.delete(goalsTable).where(eq(goalsTable.userId, user.id));
        await db.delete(transactionsTable).where(eq(transactionsTable.userId, user.id));
        await db.delete(profileTable).where(eq(profileTable.userId, user.id));
        await db.delete(userTable).where(eq(userTable.id, user.id));
      }
    }
  } catch (err) {
    console.error("Inactive user cleanup error:", err);
  }
}

export default router;
