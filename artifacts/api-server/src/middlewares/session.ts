import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "inmu-session";
export const ADMIN_SESSION_COOKIE = "inmu-admin-session";

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
    }
  }
}

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function makeToken(userId: string, email: string, name: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, email, name })).toString("base64url");
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
      userId?: string; email?: string; name?: string;
    };
    if (!data.userId) return null;
    return { userId: data.userId, email: data.email ?? "", name: data.name ?? "" };
  } catch {
    return null;
  }
}

export function makeAdminSessionValue(): string {
  const payload = Buffer.from(JSON.stringify({ admin: true, ts: Date.now() })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(payload);
  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

export function makeSessionValue(userId: string, email: string, name: string): string {
  return makeToken(userId, email, name);
}

export function sessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie && typeof cookie === "string") {
    const parsed = parseToken(cookie);
    if (parsed) {
      req.userId = parsed.userId;
      req.userEmail = parsed.email;
      req.userName = parsed.name;
    }
  }

  const adminCookie = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (adminCookie && typeof adminCookie === "string") {
    req.isAdminSession = verifyAdminToken(adminCookie);
  }

  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
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
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
