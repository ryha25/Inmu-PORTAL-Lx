import { pool } from "@workspace/db";

export const PET_CHARACTER_NAMES: Record<string, string> = {
  nyarushian: "ニャルシアン",
  takuya: "拓也",
  leon: "レオン",
  chinge: "チンゲ",
  tdn: "TDN",
  shikoiruka: "シコイルカ",
  whip: "ホイップ",
  "inmu-festival": "INMUくん（810祭りVer.）",
};

const DEFAULT_STATS = { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 50 };
const EMPTY_ACTIONS = { "feed-basic": 0, "feed-premium": 0, "play-yarn": 0, "play-ball": 0, "play-toy": 0, pet: 0 };
const EMPTY_COOLDOWNS = { feed: 0, play: 0 };
const SHIKOIRUKA_DISTRIBUTION_CHARACTER_ID = "shikoiruka";
// 2026-07-21 04:00 JST = 2026-07-20 19:00:00 UTC
const SHIKOIRUKA_DISTRIBUTION_START_UTC = new Date("2026-07-20T19:00:00Z");
// 2026-07-31 23:59:59 JST = 2026-07-31 14:59:59 UTC
const SHIKOIRUKA_DISTRIBUTION_END_UTC = new Date("2026-07-31T14:59:59Z");

let tablePromise: Promise<void> | null = null;

export function ensurePetStateTable(): Promise<void> {
  if (tablePromise) return tablePromise;
  tablePromise = Promise.all([
    pool.query(`
      CREATE TABLE IF NOT EXISTS "userPetStates" (
        "userId"    TEXT PRIMARY KEY,
        state       JSONB NOT NULL DEFAULT '{}'::jsonb,
        "clientUpdatedAt" BIGINT NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "userPetCharacters" (
        id                SERIAL PRIMARY KEY,
        "userId"          TEXT NOT NULL,
        "characterId"     TEXT NOT NULL,
        "sourceMissionId" INTEGER,
        "acquiredAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "characterId")
      )
    `),
  ]).then(async () => {
    await pool.query(`ALTER TABLE "userPetStates" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "petStateMaintenance" (
        "key" TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      WITH inserted AS (
        INSERT INTO "petStateMaintenance" ("key")
        VALUES ('affection_baseline_20260713')
        ON CONFLICT ("key") DO NOTHING
        RETURNING "key"
      )
      UPDATE "userPetStates" AS ups
      SET state = jsonb_set(
            ups.state,
            '{pets}',
            COALESCE((
              SELECT jsonb_object_agg(
                pet_id,
                jsonb_set(
                  CASE WHEN jsonb_typeof(pet_value) = 'object' THEN pet_value ELSE '{}'::jsonb END,
                  '{affection}',
                  '50'::jsonb,
                  true
                )
              )
              FROM jsonb_each(ups.state->'pets') AS pet(pet_id, pet_value)
            ), '{}'::jsonb),
            true
          ),
          "updatedAt" = NOW()
      WHERE EXISTS (SELECT 1 FROM inserted)
        AND jsonb_typeof(ups.state->'pets') = 'object'
    `);
  }).catch(error => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}

export async function initializePetCharacterState(userId: string, characterId: string) {
  await ensurePetStateTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1 FOR UPDATE`, [userId]);
    const now = Date.now();
    const hasExistingState = Boolean(result.rows[0]?.state && typeof result.rows[0].state === "object");
    const state = hasExistingState ? result.rows[0].state : {
      version: 5,
      selectedPetId: characterId,
      activePetIds: [characterId],
      pets: {},
      lastCareAt: {},
      cooldownUntil: {},
      expressions: {},
      petting: {},
      sleepStartedAt: {},
      progress: {},
      premiumFood: { dailyDate: new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10), dailyUsed: 0, inventory: 0 },
      skillState: {},
    };

    // Character grants must be idempotent. Re-granting an owned character must
    // never reset its level, EXP, care state, or the user's active selections.
    if (!state.pets?.[characterId] || typeof state.pets[characterId] !== "object") {
      state.pets = { ...(state.pets ?? {}), [characterId]: { ...DEFAULT_STATS } };
      state.lastCareAt = { ...(state.lastCareAt ?? {}), [characterId]: { ...EMPTY_ACTIONS } };
      state.cooldownUntil = { ...(state.cooldownUntil ?? {}), [characterId]: { ...EMPTY_COOLDOWNS } };
      state.expressions = { ...(state.expressions ?? {}), [characterId]: { kind: "default", until: 0 } };
      state.petting = { ...(state.petting ?? {}), [characterId]: { count: 0, lastAt: 0 } };
      state.sleepStartedAt = { ...(state.sleepStartedAt ?? {}), [characterId]: 0 };
      state.progress = { ...(state.progress ?? {}), [characterId]: { fullnessAt: now, sleepinessAt: now } };
    }
    state.skillState = { ...(state.skillState ?? {}), [characterId]: state.skillState?.[characterId] ?? true };
    state.version = Math.max(7, Number(state.version) || 0);

    await client.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT ("userId") DO UPDATE SET state = EXCLUDED.state, "clientUpdatedAt" = EXCLUDED."clientUpdatedAt", "updatedAt" = NOW()
    `, [userId, JSON.stringify(state), now]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureShikoirukaDistributionForUser(userId: string): Promise<boolean> {
  // Distribution window: 2026-07-21 04:00 JST through 2026-07-31 23:59:59 JST.
  const now = new Date();
  if (now < SHIKOIRUKA_DISTRIBUTION_START_UTC || now > SHIKOIRUKA_DISTRIBUTION_END_UTC) return false;
  await ensurePetStateTable();
  const inserted = await pool.query(
    `INSERT INTO "userPetCharacters" ("userId", "characterId")
     VALUES ($1, $2)
     ON CONFLICT ("userId", "characterId") DO NOTHING
     RETURNING "characterId"`,
    [userId, SHIKOIRUKA_DISTRIBUTION_CHARACTER_ID],
  );
  if (inserted.rowCount) {
    await initializePetCharacterState(userId, SHIKOIRUKA_DISTRIBUTION_CHARACTER_ID);
  }
  return Boolean(inserted.rowCount);
}
