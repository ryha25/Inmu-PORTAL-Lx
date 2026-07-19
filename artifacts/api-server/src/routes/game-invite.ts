import { Router } from "express";
import cors from "cors";
import { db, pool } from "@workspace/db";
import { userTable, notificationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";
import { createDaifugoLink, recordDaifugoEvent, verifyDaifugoLink } from "../services/daifugo-link";

const router = Router();

const DAIFUGO_PUBLIC_URL = "https://inmu.replit.app";
const publicCors = cors({ origin: DAIFUGO_PUBLIC_URL, credentials: true });
const CHALLENGE_RECOVERY_COST = 500;

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
    const link = await createDaifugoLink(req.userId!);
    res.json({ url: link.url, expiresAt: link.expiresAt.toISOString() });
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
    const user = await verifyDaifugoLink(token);
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
    const user = await verifyDaifugoLink(token);
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
