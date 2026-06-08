import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { ADMIN_SESSION_COOKIE, makeAdminSessionValue } from "../middlewares/session";
import { pool } from "@workspace/db";

const router = Router();

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

async function getEffectiveAdminCode(): Promise<string | null> {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'admin_code_override' LIMIT 1",
    );
    if (result.rows.length > 0 && result.rows[0].value) {
      return result.rows[0].value as string;
    }
  } catch {
    // DB unavailable — fall back to env var
  }
  return process.env.ADMIN_CODE ?? null;
}

router.post("/auth/admin-sign-in", async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }

  const adminCode = await getEffectiveAdminCode();

  if (!adminCode) {
    console.error("[AdminAuth] ADMIN_CODE secret not set");
    res.status(503).json({ error: "Admin credentials not configured" });
    return;
  }

  const codeMatch = safeEqual(code, adminCode);

  if (!codeMatch) {
    console.warn(`[AdminAuth] Failed admin login attempt`);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  console.info("[AdminAuth] Admin login successful");
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
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

router.post("/auth/admin-code-login", async (req, res): Promise<void> => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }

  const adminCode = await getEffectiveAdminCode();
  if (!adminCode) {
    res.status(503).json({ error: "Admin credentials not configured" });
    return;
  }

  const match = safeEqual(code, adminCode);
  if (!match) {
    console.warn("[AdminAuth] Failed admin code login attempt");
    res.status(401).json({ error: "Invalid code" });
    return;
  }

  console.info("[AdminAuth] Admin code login successful");
  res.cookie(ADMIN_SESSION_COOKIE, makeAdminSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ ok: true });
});

export default router;
