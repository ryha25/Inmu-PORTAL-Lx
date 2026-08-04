import { randomBytes } from "crypto";
import { pool } from "@workspace/db";

export const DAIFUGO_GAME_ID = "daifugo";
const CURRENT_DAIFUGO_PUBLIC_URL = "https://inmu-daihugo.replit.app";

function resolveDaifugoPublicUrl(): string {
  const configured = process.env.DAIFUGO_PUBLIC_URL?.trim();
  if (!configured) {
    return CURRENT_DAIFUGO_PUBLIC_URL;
  }
  return configured.replace(/\/$/, "");
}

export const DAIFUGO_PUBLIC_URL = resolveDaifugoPublicUrl();

type PortalGameUser = {
  userId: string;
  username: string;
  displayName: string;
};

let tablesPromise: Promise<void> | null = null;

export function ensureDaifugoLinkTables(): Promise<void> {
  if (tablesPromise) return tablesPromise;
  tablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "portalGameLinks" (
        token       TEXT PRIMARY KEY,
        "userId"   TEXT NOT NULL,
        game        TEXT NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "usedAt"   TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS "portalGameLinks_user_game_idx" ON "portalGameLinks" ("userId", game, "createdAt" DESC)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "portalGameEvents" (
        id          SERIAL PRIMARY KEY,
        "userId"   TEXT NOT NULL,
        game        TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "roomId"   TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS "portalGameEvents_user_game_event_idx" ON "portalGameEvents" ("userId", game, "eventType", "createdAt" DESC)`);
    await pool.query(`ALTER TABLE "portalGameEvents" ADD COLUMN IF NOT EXISTS "challengeLevel" SMALLINT`);
  })().catch(error => {
    tablesPromise = null;
    throw error;
  });
  return tablesPromise;
}

export async function createDaifugoLink(userId: string): Promise<{ token: string; url: string; expiresAt: Date }> {
  await ensureDaifugoLinkTables();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO "portalGameLinks" (token, "userId", game, "expiresAt") VALUES ($1, $2, $3, $4)`,
    [token, userId, DAIFUGO_GAME_ID, expiresAt],
  );
  const url = new URL(DAIFUGO_PUBLIC_URL);
  url.searchParams.set("portalLink", token);
  return { token, url: url.toString(), expiresAt };
}

export async function verifyDaifugoLink(token: string): Promise<PortalGameUser | null> {
  await ensureDaifugoLinkTables();
  const { rows } = await pool.query(
    `
      SELECT l."userId", u.name AS "username", p."displayName"
      FROM "portalGameLinks" l
      JOIN "user" u ON u.id = l."userId"
      LEFT JOIN "profile" p ON p."userId" = l."userId"
      WHERE l.token = $1
        AND l.game = $2
        AND l."expiresAt" > NOW()
      LIMIT 1
    `,
    [token, DAIFUGO_GAME_ID],
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query(`UPDATE "portalGameLinks" SET "usedAt" = NOW() WHERE token = $1`, [token]).catch(() => undefined);
  return {
    userId: String(row.userId),
    username: String(row.username ?? ""),
    displayName: String(row.displayName || row.username || ""),
  };
}

export type DaifugoEventType = "play" | "win" | "challenge_play" | "challenge_win";

export async function recordDaifugoEvent(userId: string, eventType: DaifugoEventType, roomId: string | null, challengeLevel?: number | null) {
  await ensureDaifugoLinkTables();
  await pool.query(
    `INSERT INTO "portalGameEvents" ("userId", game, "eventType", "roomId", "challengeLevel") VALUES ($1, $2, $3, $4, $5)`,
    [userId, DAIFUGO_GAME_ID, eventType, roomId, challengeLevel ?? null],
  );
}

export async function getDaifugoMaxChallengeLevel(userId: string): Promise<number> {
  await ensureDaifugoLinkTables();
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX("challengeLevel"), 0)::int AS lv FROM "portalGameEvents"
     WHERE "userId" = $1 AND game = $2 AND "eventType" = 'challenge_win' AND "challengeLevel" IS NOT NULL`,
    [userId, DAIFUGO_GAME_ID],
  );
  return Number(rows[0]?.lv ?? 0);
}

export async function getDaifugoEventCount(userId: string, eventType: DaifugoEventType, since?: Date): Promise<number> {
  await ensureDaifugoLinkTables();
  const eventFilter =
    eventType === "play"            ? `AND "eventType" IN ('play', 'win', 'challenge_play', 'challenge_win')` :
    eventType === "win"             ? `AND "eventType" IN ('win', 'challenge_win')` :
    eventType === "challenge_play"  ? `AND "eventType" IN ('challenge_play', 'challenge_win')` :
                                      `AND "eventType" = 'challenge_win'`;
  const sinceFilter = since ? `AND "createdAt" >= $3` : "";
  const params = since ? [userId, DAIFUGO_GAME_ID, since] : [userId, DAIFUGO_GAME_ID];
  const { rows } = await pool.query(
    `SELECT count(*)::int AS cnt FROM "portalGameEvents" WHERE "userId" = $1 AND game = $2 ${eventFilter} ${sinceFilter}`,
    params,
  );
  return Number(rows[0]?.cnt ?? 0);
}
