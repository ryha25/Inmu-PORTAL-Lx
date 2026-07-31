import { randomInt } from "crypto";
import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAdmin, requireAuth } from "../middlewares/session";
import { PET_CHARACTER_NAMES } from "../services/pet-state-store";

const router = Router();

const ROULETTE_START_AT = new Date("2026-07-31T15:00:00.000Z");
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
const DEFAULT_DEALERS = [
  "nyarushian",
  "takuya",
  "leon",
  "chinge",
  "tdn",
  "whip",
  "shikoiruka",
  "daifugo",
  "inmu-festival",
] as const;

type BetType = "color" | "dozen" | "number";
type DealerInput = { characterId: string; enabled: boolean; sortOrder: number };
type RouletteRow = {
  id: string;
  executionId: string;
  userId: string;
  playDate: string;
  dealerPetId: string;
  betType: BetType;
  betValue: string;
  betAmount: string;
  resultNumber: number;
  resultColor: string;
  won: boolean;
  payout: string;
  balanceBefore: string;
  balanceAfter: string;
  createdAt: Date;
};

let ensureTablesPromise: Promise<void> | null = null;

function ensureRouletteTables(): Promise<void> {
  if (ensureTablesPromise) return ensureTablesPromise;
  ensureTablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "dailyRoulettePlays" (
        id BIGSERIAL PRIMARY KEY,
        "executionId" UUID NOT NULL UNIQUE,
        "userId" TEXT NOT NULL,
        "playDate" DATE NOT NULL,
        "dealerPetId" TEXT NOT NULL,
        "betType" TEXT NOT NULL,
        "betValue" TEXT NOT NULL,
        "betAmount" BIGINT NOT NULL CHECK ("betAmount" > 0),
        "resultNumber" INTEGER NOT NULL CHECK ("resultNumber" BETWEEN 0 AND 36),
        "resultColor" TEXT NOT NULL,
        won BOOLEAN NOT NULL,
        payout BIGINT NOT NULL CHECK (payout >= 0),
        "balanceBefore" BIGINT NOT NULL,
        "balanceAfter" BIGINT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "playDate")
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "rouletteDealerSettings" (
        "characterId" TEXT PRIMARY KEY,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS "dailyRoulettePlays_createdAt_idx" ON "dailyRoulettePlays" ("createdAt" DESC)`,
    );
    for (let index = 0; index < DEFAULT_DEALERS.length; index += 1) {
      await pool.query(
        `
        INSERT INTO "rouletteDealerSettings" ("characterId", "sortOrder", enabled)
        VALUES ($1, $2, TRUE)
        ON CONFLICT ("characterId") DO NOTHING
      `,
        [DEFAULT_DEALERS[index], index],
      );
    }
  })().catch((error) => {
    ensureTablesPromise = null;
    throw error;
  });
  return ensureTablesPromise;
}

function jstDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

function nextJstMidnightIso(playDate: string): string {
  const [year, month, day] = playDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = next.toISOString().slice(0, 10);
  return new Date(`${nextDate}T00:00:00+09:00`).toISOString();
}

function resultColor(number: number): "green" | "red" | "black" {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number) ? "red" : "black";
}

function validateBet(
  input: unknown,
): {
  betType: BetType;
  betValue: string;
  amount: number;
  multiplier: number;
} | null {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const betType = body.betType;
  const betValue = String(body.betValue ?? "");
  const amount = Number(body.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  if (betType === "color" && ["red", "black"].includes(betValue)) {
    if (amount < 10_000 || amount > 100_000) return null;
    return { betType, betValue, amount, multiplier: 2 };
  }
  if (betType === "dozen" && ["1-12", "13-24", "25-36"].includes(betValue)) {
    if (amount < 5_000 || amount > 100_000) return null;
    return { betType, betValue, amount, multiplier: 3 };
  }
  if (betType === "number" && /^(?:[0-9]|[12][0-9]|3[0-6])$/.test(betValue)) {
    if (amount < 1_000 || amount > 50_000) return null;
    return { betType, betValue, amount, multiplier: 36 };
  }
  return null;
}

function isWinningBet(
  betType: BetType,
  betValue: string,
  number: number,
): boolean {
  if (betType === "number") return Number(betValue) === number;
  if (number === 0) return false;
  if (betType === "color") return resultColor(number) === betValue;
  if (betValue === "1-12") return number >= 1 && number <= 12;
  if (betValue === "13-24") return number >= 13 && number <= 24;
  return number >= 25 && number <= 36;
}

async function getDealerForDate(
  playDate: string,
): Promise<{ id: string; name: string }> {
  const result = await pool.query(`
    SELECT "characterId"
    FROM "rouletteDealerSettings"
    WHERE enabled = TRUE
    ORDER BY "sortOrder" ASC, "characterId" ASC
  `);
  const dealers = result.rows
    .map((row) => String(row.characterId))
    .filter((id) => id in PET_CHARACTER_NAMES);
  const available = dealers.length > 0 ? dealers : [...DEFAULT_DEALERS];
  const startDay = Math.floor(Date.parse("2026-08-01T00:00:00Z") / 86_400_000);
  const currentDay = Math.floor(
    Date.parse(`${playDate}T00:00:00Z`) / 86_400_000,
  );
  const id =
    available[
      (((currentDay - startDay) % available.length) + available.length) %
        available.length
    ];
  return { id, name: PET_CHARACTER_NAMES[id] ?? id };
}

function serializePlay(row: RouletteRow) {
  // PostgreSQL DATE型はpgドライバによってDateオブジェクトで返ることがある
  const playDate = typeof row.playDate === 'string'
    ? row.playDate.slice(0, 10)
    : (row.playDate as unknown as Date).toISOString().slice(0, 10);
  return {
    id: String(row.id),
    executionId: row.executionId,
    playDate,
    dealerPetId: row.dealerPetId,
    dealerPetName: PET_CHARACTER_NAMES[row.dealerPetId] ?? row.dealerPetId,
    betType: row.betType,
    betValue: row.betValue,
    betAmount: Number(row.betAmount),
    resultNumber: row.resultNumber,
    resultColor: row.resultColor,
    won: row.won,
    payout: Number(row.payout),
    balanceBefore: Number(row.balanceBefore),
    balanceAfter: Number(row.balanceAfter),
    createdAt: new Date(row.createdAt).toISOString(),
    nextAvailableAt: nextJstMidnightIso(playDate),
  };
}

router.get("/roulette/status", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureRouletteTables();
    const now = new Date();
    const playDate = jstDateString(now);
    const [profile, play, dealer] = await Promise.all([
      pool.query(`SELECT "monthlyPoints" FROM profile WHERE "userId" = $1`, [
        req.userId!,
      ]),
      pool.query(
        `SELECT * FROM "dailyRoulettePlays" WHERE "userId" = $1 AND "playDate" = $2::date LIMIT 1`,
        [req.userId!, playDate],
      ),
      getDealerForDate(playDate),
    ]);
    const active = now >= ROULETTE_START_AT;
    res.json({
      active,
      startsAt: ROULETTE_START_AT.toISOString(),
      playDate,
      hasPlayed: Boolean(play.rowCount),
      points: Number(profile.rows[0]?.monthlyPoints ?? 0),
      dealer,
      play: play.rows[0] ? serializePlay(play.rows[0]) : null,
      nextAvailableAt: play.rows[0] ? nextJstMidnightIso(playDate) : null,
    });
  } catch (error) {
    console.error("[Roulette] status error", error);
    res.status(500).json({ error: "ルーレット情報を取得できませんでした" });
  }
});

router.post("/roulette/play", requireAuth, async (req, res): Promise<void> => {
  const executionId = String(req.body?.executionId ?? "");
  const bet = validateBet(req.body);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      executionId,
    )
  ) {
    res.status(400).json({ error: "実行IDが不正です" });
    return;
  }
  if (!bet) {
    res.status(400).json({ error: "ベット内容またはポイント数が不正です" });
    return;
  }
  if (new Date() < ROULETTE_START_AT) {
    res
      .status(403)
      .json({
        error: "デイリールーレットは2026年8月1日0:00（JST）から開始します",
      });
    return;
  }

  await ensureRouletteTables();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `daily-roulette:${req.userId}`,
    ]);

    const duplicate = await client.query(
      `SELECT * FROM "dailyRoulettePlays" WHERE "executionId" = $1::uuid LIMIT 1`,
      [executionId],
    );
    if (duplicate.rows[0]) {
      if (String(duplicate.rows[0].userId) !== req.userId) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "実行IDが重複しています" });
        return;
      }
      await client.query("COMMIT");
      res.json({ play: serializePlay(duplicate.rows[0]), idempotent: true });
      return;
    }

    const playDate = jstDateString();
    const existing = await client.query(
      `SELECT * FROM "dailyRoulettePlays" WHERE "userId" = $1 AND "playDate" = $2::date LIMIT 1`,
      [req.userId!, playDate],
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      res
        .status(409)
        .json({
          error: "本日のルーレットは挑戦済みです",
          play: serializePlay(existing.rows[0]),
        });
      return;
    }

    const profile = await client.query(
      `SELECT "monthlyPoints" FROM profile WHERE "userId" = $1 FOR UPDATE`,
      [req.userId!],
    );
    if (!profile.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "プロフィールが見つかりません" });
      return;
    }
    const balanceBefore = Number(profile.rows[0].monthlyPoints);
    if (!Number.isSafeInteger(balanceBefore) || balanceBefore < bet.amount) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "ポイントが不足しています" });
      return;
    }

    const dealer = await getDealerForDate(playDate);
    const number = randomInt(0, 37);
    const color = resultColor(number);
    const won = isWinningBet(bet.betType, bet.betValue, number);
    const payout = won ? bet.amount * bet.multiplier : 0;
    const balanceAfter = balanceBefore - bet.amount + payout;
    const inserted = await client.query(
      `
      INSERT INTO "dailyRoulettePlays" (
        "executionId", "userId", "playDate", "dealerPetId", "betType", "betValue",
        "betAmount", "resultNumber", "resultColor", won, payout, "balanceBefore", "balanceAfter"
      )
      VALUES ($1::uuid, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `,
      [
        executionId,
        req.userId!,
        playDate,
        dealer.id,
        bet.betType,
        bet.betValue,
        bet.amount,
        number,
        color,
        won,
        payout,
        balanceBefore,
        balanceAfter,
      ],
    );

    await client.query(
      `UPDATE profile SET "monthlyPoints" = $2, "updatedAt" = NOW() WHERE "userId" = $1`,
      [req.userId!, balanceAfter],
    );
    await client.query(
      `
      INSERT INTO points ("userId", amount, type, source, month)
      VALUES ($1, $2, 'roulette_bet', $3, $4)
    `,
      [
        req.userId!,
        String(-bet.amount),
        `${bet.betType}:${bet.betValue}`,
        playDate.slice(0, 7),
      ],
    );
    if (payout > 0) {
      await client.query(
        `
        INSERT INTO points ("userId", amount, type, source, month)
        VALUES ($1, $2, 'roulette_payout', $3, $4)
      `,
        [req.userId!, String(payout), `number:${number}`, playDate.slice(0, 7)],
      );
    }

    await client.query("COMMIT");
    res.json({ play: serializePlay(inserted.rows[0]), idempotent: false });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[Roulette] play error", error);
    res
      .status(500)
      .json({
        error: "抽選を確定できませんでした。ポイント履歴をご確認ください",
      });
  } finally {
    client.release();
  }
});

router.get(
  "/roulette/history",
  requireAuth,
  async (req, res): Promise<void> => {
    try {
      await ensureRouletteTables();
      const result = await pool.query(
        `
      SELECT * FROM "dailyRoulettePlays"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
      LIMIT 100
    `,
        [req.userId!],
      );
      res.json(result.rows.map(serializePlay));
    } catch (error) {
      console.error("[Roulette] history error", error);
      res.status(500).json({ error: "履歴を取得できませんでした" });
    }
  },
);

router.get("/admin/roulette", requireAdmin, async (req, res): Promise<void> => {
  try {
    await ensureRouletteTables();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date ?? ""))
      ? String(req.query.date)
      : jstDateString();
    const [summary, plays, betTypes, numbers] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS "playerCount",
          COALESCE(SUM("betAmount"), 0)::text AS "totalBet",
          COALESCE(SUM(payout), 0)::text AS "totalPayout",
          COUNT(*) FILTER (WHERE won)::int AS "winnerCount",
          COUNT(*) FILTER (WHERE NOT won)::int AS "loserCount"
        FROM "dailyRoulettePlays" WHERE "playDate" = $1::date
      `,
        [date],
      ),
      pool.query(
        `
        SELECT plays.*, profile."displayName"
        FROM "dailyRoulettePlays" plays
        LEFT JOIN profile ON profile."userId" = plays."userId"
        WHERE plays."playDate" = $1::date
        ORDER BY plays."createdAt" DESC
      `,
        [date],
      ),
      pool.query(
        `
        SELECT "betType", "betValue", COUNT(*)::int AS count,
          SUM("betAmount")::text AS "totalBet", SUM(payout)::text AS "totalPayout"
        FROM "dailyRoulettePlays" WHERE "playDate" = $1::date
        GROUP BY "betType", "betValue" ORDER BY "betType", "betValue"
      `,
        [date],
      ),
      pool.query(
        `
        SELECT "resultNumber", "resultColor", COUNT(*)::int AS count
        FROM "dailyRoulettePlays" WHERE "playDate" = $1::date
        GROUP BY "resultNumber", "resultColor" ORDER BY "resultNumber"
      `,
        [date],
      ),
    ]);
    const row = summary.rows[0];
    res.json({
      date,
      summary: {
        players: Number(row.playerCount),
        totalBet: Number(row.totalBet),
        totalPayout: Number(row.totalPayout),
        houseNet: Number(row.totalBet) - Number(row.totalPayout),
        winners: Number(row.winnerCount),
        losers: Number(row.loserCount),
      },
      plays: plays.rows.map((play) => ({
        ...serializePlay(play),
        userId: play.userId,
        username: play.displayName ?? play.userId,
      })),
      byBetType: betTypes.rows.map((row) => ({
        betType: String(row.betType),
        betValue: String(row.betValue),
        plays: Number(row.count),
        totalBet: Number(row.totalBet),
        totalPayout: Number(row.totalPayout),
      })),
      byResultNumber: numbers.rows.map((row) => ({
        resultNumber: Number(row.resultNumber),
        resultColor: String(row.resultColor),
        plays: Number(row.count),
      })),
    });
  } catch (error) {
    console.error("[Roulette] admin summary error", error);
    res.status(500).json({ error: "ルーレット集計を取得できませんでした" });
  }
});

router.post(
  "/admin/roulette/preview",
  requireAdmin,
  async (req, res): Promise<void> => {
    const bet = validateBet(req.body);
    if (!bet) {
      res.status(400).json({ error: "ベット内容またはポイント数が不正です" });
      return;
    }
    try {
      await ensureRouletteTables();
      const dealer = await getDealerForDate(jstDateString());
      const number = randomInt(0, 37);
      const color = resultColor(number);
      const won = isWinningBet(bet.betType, bet.betValue, number);
      res.json({
        dealerPetId: dealer.id,
        dealerPetName: dealer.name,
        betType: bet.betType,
        betValue: bet.betValue,
        betAmount: bet.amount,
        resultNumber: number,
        resultColor: color,
        won,
        payout: won ? bet.amount * bet.multiplier : 0,
        preview: true,
      });
    } catch (error) {
      console.error("[Roulette] admin preview error", error);
      res.status(500).json({ error: "テスト抽選を開始できませんでした" });
    }
  },
);

router.get(
  "/admin/roulette/dealers",
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      await ensureRouletteTables();
      const result = await pool.query(`
      SELECT "characterId", "sortOrder", enabled
      FROM "rouletteDealerSettings"
      ORDER BY "sortOrder", "characterId"
    `);
      res.json(
        result.rows.map((row) => ({
          characterId: row.characterId,
          name: PET_CHARACTER_NAMES[row.characterId] ?? row.characterId,
          sortOrder: Number(row.sortOrder),
          enabled: Boolean(row.enabled),
        })),
      );
    } catch {
      res.status(500).json({ error: "ディーラー設定を取得できませんでした" });
    }
  },
);

router.put(
  "/admin/roulette/dealers",
  requireAdmin,
  async (req, res): Promise<void> => {
    const dealers = Array.isArray(req.body?.dealers) ? req.body.dealers : null;
    if (!dealers || dealers.length === 0) {
      res.status(400).json({ error: "ディーラー設定が必要です" });
      return;
    }
    const normalized: DealerInput[] = dealers.map(
      (dealer: Record<string, unknown>, index: number) => ({
        characterId: String(dealer.characterId ?? ""),
        enabled: Boolean(dealer.enabled),
        sortOrder: index,
      }),
    );
    if (
      normalized.some(
        (dealer) =>
          !DEFAULT_DEALERS.includes(
            dealer.characterId as (typeof DEFAULT_DEALERS)[number],
          ),
      )
    ) {
      res.status(400).json({ error: "公開中ではないPETが含まれています" });
      return;
    }
    if (!normalized.some((dealer) => dealer.enabled)) {
      res
        .status(400)
        .json({ error: "1体以上のディーラーを有効にしてください" });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const dealer of normalized) {
        await client.query(
          `
        INSERT INTO "rouletteDealerSettings" ("characterId", "sortOrder", enabled, "updatedAt")
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT ("characterId") DO UPDATE SET
          "sortOrder" = EXCLUDED."sortOrder", enabled = EXCLUDED.enabled, "updatedAt" = NOW()
      `,
          [dealer.characterId, dealer.sortOrder, dealer.enabled],
        );
      }
      await client.query(
        `
      INSERT INTO "auditLog" ("adminId", action, details)
      VALUES ($1, 'roulette_dealers_updated', $2::jsonb)
    `,
        [req.adminId ?? "admin", JSON.stringify({ dealers: normalized })],
      );
      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("[Roulette] dealer update error", error);
      res.status(500).json({ error: "ディーラー設定を保存できませんでした" });
    } finally {
      client.release();
    }
  },
);

export { ensureRouletteTables };
export default router;
