import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "inmu-session";
export const ADMIN_SESSION_COOKIE = "inmu-admin-session";

const USER_SESSION_MS = 30 * 60 * 1000;
const ADMIN_SESSION_MS = 60 * 60 * 1000;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET environment variable is required in production");
    }
    console.warn("[WARN] SESSION_SECRET not set — using insecure dev-only default. Set SESSION_SECRET before deploying.");
    return "inmu-bank-dev-only-insecure-secret-do-not-deploy";
  }
  return secret;
}

const SESSION_SECRET = getSessionSecret();

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      userName?: string;
      isAdminSession?: boolean;
      adminType?: string;
      adminId?: string;
      sessionExpired?: boolean;
    }
  }
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function makeToken(userId: string, email: string, name: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, email, name, ts: Date.now() })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function parseToken(token: string): { userId: string; email: string; name: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId?: string; email?: string; name?: string; ts?: number;
    };
    if (!data.userId) return null;
    if (typeof data.ts === "number" && Date.now() - data.ts > USER_SESSION_MS) return null;
    return { userId: data.userId, email: data.email ?? "", name: data.name ?? "" };
  } catch {
    return null;
  }
}

export function makeAdminSessionValue(adminType: string = "owner"): string {
  const payload = Buffer.from(JSON.stringify({ admin: true, adminType, ts: Date.now() })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string): { adminType: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      admin?: boolean;
      adminType?: string;
      ts?: number;
    };
    if (data.admin !== true) return null;
    if (typeof data.ts === "number" && Date.now() - data.ts > ADMIN_SESSION_MS) return null;
    return { adminType: data.adminType ?? "owner" };
  } catch {
    return null;
  }
}

export function makeSessionValue(userId: string, email: string, name: string): string {
  return makeToken(userId, email, name);
}

export function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie && typeof cookie === "string") {
    const parsed = parseToken(cookie);
    if (parsed) {
      req.userId = parsed.userId;
      req.userEmail = parsed.email;
      req.userName = parsed.name;
    } else {
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      req.sessionExpired = true;
    }
  }

  const adminCookie = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (adminCookie && typeof adminCookie === "string") {
    const result = verifyAdminToken(adminCookie);
    if (result) {
      req.isAdminSession = true;
      req.adminType = result.adminType;
      req.adminId = `admin_${result.adminType}`;
    } else {
      res.clearCookie(ADMIN_SESSION_COOKIE, { path: "/" });
      req.isAdminSession = false;
    }
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    if (req.sessionExpired) {
      res.status(401).json({ error: "セッションの有効期限が切れました。再度ログインしてください。", expired: true });
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
    return;
  }
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isAdminSession) {
    if (req.cookies?.[ADMIN_SESSION_COOKIE]) {
      res.status(403).json({ error: "管理セッションの有効期限が切れました。再度ログインしてください。", expired: true });
    } else {
      res.status(403).json({ error: "Forbidden" });
    }
    return;
  }
  next();
}

export function requireAuthOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.userId || req.isAdminSession) {
    next();
    return;
  }
  if (req.sessionExpired) {
    res.status(401).json({ error: "セッションの有効期限が切れました。再度ログインしてください。", expired: true });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
}
