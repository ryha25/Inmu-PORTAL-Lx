import { Router, type CookieOptions } from "express";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
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
  emergencyAuthTable,
  auditLogTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, makeSessionValue } from "../middlewares/session";
import { logger } from "../lib/logger";

const router = Router();

const USER_SESSION_MS = 30 * 60 * 1000;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;
const DB_RETRY_DELAYS_MS = [0, 200, 600] as const;
const USER_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  sameSite: "none",
  secure: true,
  maxAge: USER_SESSION_MS,
  path: "/",
};
const CLEAR_USER_SESSION_COOKIE_OPTIONS: CookieOptions = {
  sameSite: "none",
  secure: true,
  path: "/",
};

const TRANSIENT_DB_ERROR_CODES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "53300",
  "57P01",
  "57P02",
  "57P03",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

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

function hashForLog(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex").slice(0, 16);
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function isTransientDatabaseError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && TRANSIENT_DB_ERROR_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated|connection timeout|timeout expired|socket hang up/i.test(message);
}

async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < DB_RETRY_DELAYS_MS.length; attempt++) {
    const delayMs = DB_RETRY_DELAYS_MS[attempt];
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const finalAttempt = attempt === DB_RETRY_DELAYS_MS.length - 1;
      if (!isTransientDatabaseError(error) || finalAttempt) throw error;
      logger.warn(
        { err: error, operationName, attempt: attempt + 1 },
        "Transient database error; retrying",
      );
    }
  }

  throw lastError;
}

async function findUserByIdentifier(identifier: string) {
  const fields = {
    id: userTable.id,
    email: userTable.email,
    name: userTable.name,
    passwordHash: userTable.passwordHash,
  };
  const syntheticEmail = makeEmail(identifier);

  return withDatabaseRetry(async () => {
    let user = await db
      .select(fields)
      .from(userTable)
      .where(eq(userTable.email, syntheticEmail))
      .then((rows) => rows[0]);

    if (!user && syntheticEmail !== identifier) {
      user = await db
        .select(fields)
        .from(userTable)
        .where(eq(userTable.email, identifier))
        .then((rows) => rows[0]);
    }

    return user;
  }, "find-user-for-sign-in");
}

async function verifyEmergencyPassword(userId: string, password: string): Promise<boolean> {
  try {
    const emergency = await withDatabaseRetry(
      () => db
        .select({
          passwordEnabled: emergencyAuthTable.passwordEnabled,
          emergencyPasswordHash: emergencyAuthTable.emergencyPasswordHash,
        })
        .from(emergencyAuthTable)
        .where(eq(emergencyAuthTable.userId, userId))
        .then((rows) => rows[0]),
      "verify-emergency-password",
    );

    return Boolean(
      emergency?.passwordEnabled &&
      emergency.emergencyPasswordHash &&
      await bcrypt.compare(password, emergency.emergencyPasswordHash),
    );
  } catch (error) {
    logger.warn({ err: error, userId }, "Emergency password lookup failed");
    return false;
  }
}

async function ensureProfileAfterSignIn(userId: string, displayName: string): Promise<void> {
  try {
    await withDatabaseRetry(
      () => ensureProfile(userId, displayName),
      "ensure-profile-after-sign-in",
    );
  } catch (error) {
    // A valid user must still be able to establish a session when optional
    // profile backfill is temporarily unavailable.
    logger.error({ err: error, userId }, "Profile backfill failed after valid sign-in");
  }
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
    res.status(400).json({ error: "ユーザー名またはメールアドレスとパスワードを入力してください" });
    return;
  }

  const lockKey = `login:${identifier.toLowerCase()}`;
  const lock = checkLock(lockKey);
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `ログインがロックされています。${mins}分後に再試行してください` });
    return;
  }

  try {
    const user = await findUserByIdentifier(identifier);

    if (!user || !user.passwordHash) {
      recordFail(lockKey, LOGIN_MAX_FAILS, LOGIN_LOCK_MS);
      res.status(401).json({ error: "ユーザー名またはパスワードが正しくありません" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const emrgValid = await verifyEmergencyPassword(user.id, password);
      if (emrgValid) {
        await db.insert(auditLogTable).values({
          adminId: "SYSTEM",
          action: "emergency_password_used",
          targetUserId: user.id,
          details: { identifierHash: hashForLog(identifier), usedAt: new Date().toISOString() } as Record<string, unknown>,
          createdAt: new Date(),
        });
        recordSuccess(lockKey);
        await ensureProfileAfterSignIn(user.id, user.name);
        res.cookie(SESSION_COOKIE, makeSessionValue(user.id, user.email, user.name ?? ""), USER_SESSION_COOKIE_OPTIONS);
        res.json({ user: { id: user.id, email: user.email, name: user.name } });
        return;
      }
      const locked = recordFail(lockKey, LOGIN_MAX_FAILS, LOGIN_LOCK_MS);
      if (locked) {
        res.status(429).json({ error: "5回失敗しました。10分間ロックされます" });
      } else {
        res.status(401).json({ error: "ユーザー名またはパスワードが正しくありません" });
      }
      return;
    }

    recordSuccess(lockKey);
    await ensureProfileAfterSignIn(user.id, user.name);

    res.cookie(SESSION_COOKIE, makeSessionValue(user.id, user.email, user.name ?? ""), USER_SESSION_COOKIE_OPTIONS);
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    const transientDatabaseFailure = isTransientDatabaseError(error);
    logger.error(
      {
        err: error,
        identifierHash: hashForLog(identifier),
        identifierKind: email ? "email" : "name",
        transientDatabaseFailure,
      },
      "Sign-in failed",
    );
    if (transientDatabaseFailure) {
      res.setHeader("Retry-After", "2");
      res.status(503).json({
        error: "データベースへの接続が一時的に不安定です。数秒後に再度お試しください",
        retryable: true,
      });
      return;
    }
    res.status(500).json({ error: "ログイン処理に失敗しました" });
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

    res.cookie(SESSION_COOKIE, makeSessionValue(userId, email, trimmedName), USER_SESSION_COOKIE_OPTIONS);
    res.status(201).json({ user: { id: userId, email, name: trimmedName } });
  } catch (error) {
    logger.error(
      { err: error, nameHash: name ? hashForLog(name) : undefined },
      "Sign-up failed",
    );
    res.status(500).json({ error: "登録処理に失敗しました" });
  }
});

router.post("/sign-out", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE, CLEAR_USER_SESSION_COOKIE_OPTIONS);
  res.json({ ok: true });
});

async function ensureProfile(userId: string, displayName: string, passcodeHash?: string) {
  const existing = await db
    .select({ userId: profileTable.userId })
    .from(profileTable)
    .where(eq(profileTable.userId, userId))
    .then((r) => r[0]);
  if (!existing) {
    await db
      .insert(profileTable)
      .values({ userId, displayName, passcodeHash })
      .onConflictDoNothing();
  } else if (passcodeHash) {
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
    logger.error({ err }, "Inactive user cleanup error");
  }
}

export default router;
