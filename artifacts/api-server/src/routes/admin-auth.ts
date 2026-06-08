import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { ADMIN_SESSION_COOKIE, makeAdminSessionValue } from "../middlewares/session";

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

router.post("/auth/admin-sign-in", (req, res): void => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
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

router.post("/auth/admin-code-login", (req, res): void => {
  const { code } = req.body as { code?: string };

  if (!code) {
    res.status(400).json({ error: "Code required" });
    return;
  }

  const adminCode = process.env.ADMIN_CODE;
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
