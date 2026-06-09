import { Router } from "express";
import { timingSafeEqual } from "crypto";
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

router.post("/auth/admin-sign-in", (req, res): void => {
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

  const adminCode = process.env.ADMIN_CODE;
  if (!adminCode) {
    console.error("[AdminAuth] ADMIN_CODE secret not set");
    res.status(503).json({ error: "Admin credentials not configured" });
    return;
  }

  const codeMatch = safeEqual(code, adminCode);

  if (!codeMatch) {
    const locked = recordFail("admin", ADMIN_MAX_FAILS, ADMIN_LOCK_MS);
    console.warn(`[AdminAuth] Failed admin login attempt`);
    if (locked) {
      res.status(429).json({ error: "5回失敗しました。60分間ロックされます。" });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
    return;
  }

  recordSuccess("admin");
  console.info("[AdminAuth] Admin login successful");
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MS,
    path: "/",
  });
  res.json({ ok: true });
});

router.post("/auth/admin-sign-out", (_req, res): void => {
  res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
  res.json({ ok: true });
});

router.get("/auth/admin-session", (req, res): void => {
  res.json({ isAdmin: !!req.isAdminSession });
});

router.post("/auth/admin-code-login", (req, res): void => {
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

  const adminCode = process.env.ADMIN_CODE;
  if (!adminCode) {
    res.status(503).json({ error: "Admin credentials not configured" });
    return;
  }

  const match = safeEqual(code, adminCode);
  if (!match) {
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
  console.info("[AdminAuth] Admin code login successful");
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MS,
    path: "/",
  });
  res.json({ ok: true });
});

export default router;
