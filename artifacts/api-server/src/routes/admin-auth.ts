import { Router } from "express";
import { timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { ADMIN_SESSION_COOKIE, makeAdminSessionValue } from "../middlewares/session";

const router = Router();

const ADMIN_SESSION_MS = 60 * 60 * 1000;
const ADMIN_LOCK_MS = 60 * 60 * 1000;
const ADMIN_MAX_FAILS = 5;

interface FailRecord { count: number; lockedUntil: number }
const adminFailMap = new Map<string, FailRecord>();

function checkLock(key: string): { locked: boolean; remainingMs: number } {
  const rec = adminFailMap.get(key);
  if (!rec) return { locked: false, remainingMs: 0 };
  if (rec.lockedUntil > Date.now()) {
    return { locked: true, remainingMs: rec.lockedUntil - Date.now() };
  }
  return { locked: false, remainingMs: 0 };
}

function recordFail(key: string, maxFails: number, lockMs: number): boolean {
  const rec = adminFailMap.get(key) ?? { count: 0, lockedUntil: 0 };
  rec.count++;
  if (rec.count >= maxFails) {
    rec.lockedUntil = Date.now() + lockMs;
    rec.count = 0;
    adminFailMap.set(key, rec);
    return true;
  }
  adminFailMap.set(key, rec);
  return false;
}

function recordSuccess(key: string) {
  adminFailMap.delete(key);
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab);
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

export async function resolveAdminCode(code: string): Promise<"owner" | "operator" | null> {
  // Check DB-stored bcrypt hashes first (set via change-admin-code endpoint)
  try {
    const [ownerRows, operatorRows] = await Promise.all([
      db.select({ value: systemSettingsTable.value })
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "admin_code_owner_hash"))
        .limit(1),
      db.select({ value: systemSettingsTable.value })
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "admin_code_operator_hash"))
        .limit(1),
    ]);
    if (ownerRows[0]?.value && await bcrypt.compare(code, ownerRows[0].value)) return "owner";
    if (operatorRows[0]?.value && await bcrypt.compare(code, operatorRows[0].value)) return "operator";
  } catch (e) {
    console.error("[AdminAuth] DB code check failed, falling back to env vars:", e);
  }

  // Fall back to env vars
  const ownerCode = process.env.ADMIN_CODE_OWNER;
  if (ownerCode && safeEqual(code, ownerCode)) return "owner";

  const operatorCode = process.env.ADMIN_CODE_OPERATOR;
  if (operatorCode && safeEqual(code, operatorCode)) return "operator";

  // Backward compat: ADMIN_CODE → owner
  const legacyCode = process.env.ADMIN_CODE;
  if (legacyCode && safeEqual(code, legacyCode)) return "owner";

  return null;
}

router.post("/auth/admin-sign-in", async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }

  const lock = checkLock("admin");
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `管理コードがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  const adminType = await resolveAdminCode(code);

  if (!adminType) {
    const locked = recordFail("admin", ADMIN_MAX_FAILS, ADMIN_LOCK_MS);
    console.warn("[AdminAuth] Failed admin login attempt");
    if (locked) {
      res.status(429).json({ error: "5回失敗しました。60分間ロックされます。" });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
    return;
  }

  recordSuccess("admin");
  console.info(`[AdminAuth] Admin login successful (adminType=${adminType})`);
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(adminType), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MS,
    path: "/",
  });
  res.json({ ok: true, adminType });
});

router.post("/auth/admin-sign-out", (_req, res): void => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/admin-session", (req, res): void => {
  res.json({ isAdmin: !!req.isAdminSession, adminType: req.adminType ?? null });
});

router.post("/auth/admin-code-login", async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }

  const lock = checkLock("admin");
  if (lock.locked) {
    const mins = Math.ceil(lock.remainingMs / 60000);
    res.status(429).json({ error: `管理コードがロックされています。${mins}分後に再試行してください。` });
    return;
  }

  const adminType = await resolveAdminCode(code);

  if (!adminType) {
    const locked = recordFail("admin", ADMIN_MAX_FAILS, ADMIN_LOCK_MS);
    console.warn("[AdminAuth] Failed admin code login attempt");
    if (locked) {
      res.status(429).json({ error: "5回失敗しました。60分間ロックされます。" });
    } else {
      res.status(401).json({ error: "Invalid code" });
    }
    return;
  }

  recordSuccess("admin");
  console.info(`[AdminAuth] Admin code login successful (adminType=${adminType})`);
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(adminType), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MS,
    path: "/",
  });
  res.json({ ok: true });
});

export default router;
