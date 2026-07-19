import { Router } from "express";
import cors from "cors";
import { createHmac, timingSafeEqual } from "crypto";
import { db, pool } from "@workspace/db";
import { userTable, notificationsTable, profileTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";
import { recordDaifugoEvent, verifyDaifugoLink } from "../services/daifugo-link";

const router = Router();

const DAIFUGO_PUBLIC_URL = "https://inmu.replit.app";
const publicCors = cors({ origin: DAIFUGO_PUBLIC_URL, credentials: true });
const CHALLENGE_RECOVERY_COST = 500;
const DAIFUGO_LINK_TTL_SECONDS = 5 * 60;

type DaifugoPortalPayload = {
  portalUserId: string;
  username: string;
  exp: number;
};

type DaifugoLinkedUser = {
  userId: string;
  username: string;
  displayName: string;
};

function getPortalLinkSecret(): string {
  const secret = process.env.PORTAL_LINK_SECRET?.trim();
  if (!secret) throw new Error("PORTAL_LINK_SECRET is not configured");
  return secret;
}

function encodeJsonBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPortalLinkPayload(encodedPayload: string): string {
  return createHmac("sha256", getPortalLinkSecret()).update(encodedPayload).digest("base64url");
}

function safeEqualString(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function verifySignedDaifugoLink(token: string): DaifugoLinkedUser | null {
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length > 0) return null;

  const expectedSignature = signPortalLinkPayload(encodedPayload);
  if (!safeEqualString(signature, expectedSignature)) return null;

  let payload: Partial<DaifugoPortalPayload>;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof payload.portalUserId !== "string" ||
    typeof payload.username !== "string" ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return {
    userId: payload.portalUserId,
    username: payload.username,
    displayName: payload.username,
  };
}

async function resolveDaifugoLinkToken(token: string): Promise<DaifugoLinkedUser | null> {
  if (token.includes(".")) return verifySignedDaifugoLink(token);
  return verifyDaifugoLink(token);
}

function normalizeOptionalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTournamentSize(value: unknown): number | null {
  if (value == null || value === "") return null;
  const size = Math.floor(Number(value));
  return Number.isFinite(size) && size > 0 ? size : null;
}

router.post("/game-link/daifugo", requireAuth, async (req, res): Promise<void> => {
  try {
    const profile = await db
      .select({ displayName: profileTable.displayName })
      .from(profileTable)
      .where(eq(profileTable.userId, req.userId!))
      .then((rows) => rows[0]);

    const exp = Math.floor(Date.now() / 1000) + DAIFUGO_LINK_TTL_SECONDS;
    const payload: DaifugoPortalPayload = {
      portalUserId: req.userId!,
      username: String(profile?.displayName || req.userName || ""),
      exp,
    };
    const encodedPayload = encodeJsonBase64Url(payload);
    const signature = signPortalLinkPayload(encodedPayload);
    const url = new URL(DAIFUGO_PUBLIC_URL);
    url.searchParams.set("portalLink", `${encodedPayload}.${signature}`);
    res.json({ url: url.toString(), expiresAt: new Date(exp * 1000).toISOString() });
  } catch (error) {
    console.error("[Daifugo] create link", error);
    res.status(500).json({ error: "Failed to create Daifugo link" });
  }
});

router.get("/game-link/daifugo/verify", publicCors, async (req, res): Promise<void> => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "token required" });
    return;
  }
  try {
    const user = await resolveDaifugoLinkToken(token);
    if (!user) {
      res.status(401).json({ error: "invalid_or_expired_link" });
      return;
    }
    res.json({ ok: true, user });
  } catch (error) {
    console.error("[Daifugo] verify link", error);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/game-events/daifugo", publicCors, async (req, res): Promise<void> => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const eventType = req.body?.eventType === "win" ? "win" : req.body?.eventType === "play" ? "play" : null;
  const roomId = typeof req.body?.roomId === "string" && req.body.roomId.trim() ? req.body.roomId.trim().slice(0, 120) : null;
  if (!token || !eventType) {
    res.status(400).json({ error: "token and eventType are required" });
    return;
  }
  try {
    const user = await resolveDaifugoLinkToken(token);
    if (!user) {
      res.status(401).json({ error: "invalid_or_expired_link" });
      return;
    }
    await recordDaifugoEvent(user.userId, eventType, roomId);
    res.json({ ok: true });
  } catch (error) {
    console.error("[Daifugo] record event", error);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/challenge-recovery", publicCors, requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const bodyUsername = typeof req.body?.username === "string" ? req.body.username.trim() : "";
  if (bodyUsername && bodyUsername !== req.userName) {
    res.status(400).json({ error: "username does not match current session" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const profileResult = await client.query(
      `SELECT "monthlyPoints" FROM "profile" WHERE "userId" = $1 FOR UPDATE`,
      [userId],
    );
    if (profileResult.rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "profile not found" });
      return;
    }

    const currentBalance = Number(profileResult.rows[0]?.monthlyPoints ?? 0);
    if (currentBalance < CHALLENGE_RECOVERY_COST) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "insufficient_points" });
      return;
    }

    const remainingBalance = currentBalance - CHALLENGE_RECOVERY_COST;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await client.query(
      `UPDATE "profile" SET "monthlyPoints" = "monthlyPoints" - $2, "updatedAt" = NOW() WHERE "userId" = $1`,
      [userId, CHALLENGE_RECOVERY_COST],
    );
    await client.query(
      `INSERT INTO "points" ("userId", amount, type, source, month) VALUES ($1, $2, $3, $4, $5)`,
      [userId, String(-CHALLENGE_RECOVERY_COST), "challenge_recovery", "INMU Daifugo challenge recovery", month],
    );
    await client.query("COMMIT");
    res.json({ ok: true, remainingBalance });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[Daifugo] challenge recovery", error);
    res.status(500).json({ error: "Internal error" });
  } finally {
    client.release();
  }
});

router.post("/game-invite", publicCors, async (req, res): Promise<void> => {
  const { from, to, game, roomId } = req.body ?? {};
  const joinUrl = normalizeOptionalUrl(req.body?.joinUrl);
  const tournamentSize = normalizeTournamentSize(req.body?.tournamentSize);

  if (!from || !to || !game || !roomId) {
    res.status(400).json({ error: "from, to, game, roomId are required" });
    return;
  }

  try {
    const targetUser = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.name, String(to)))
      .then((r) => r[0]);

    if (!targetUser) {
      res.status(404).json({ error: `User "${to}" not found` });
      return;
    }

    const messageLines = [
      `${String(from)} invited you to ${String(game)}.`,
      `Room ID: ${String(roomId)}`,
    ];
    if (tournamentSize) messageLines.push(`Tournament size: ${tournamentSize}`);
    if (joinUrl) messageLines.push(`JOIN_URL:${joinUrl}`);

    await db.insert(notificationsTable).values({
      userId: targetUser.id,
      type: "game_invite",
      title: `Daifugo invite: ${String(game)}`,
      message: messageLines.join("\n"),
      isRead: false,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("[Daifugo] game invite", error);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
