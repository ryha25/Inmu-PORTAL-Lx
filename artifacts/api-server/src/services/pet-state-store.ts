import { pool } from "@workspace/db";

export const PET_CHARACTER_NAMES: Record<string, string> = {
  nyarushian: "ニャルシアン",
  takuya: "拓也",
  leon: "レオン",
  chinge: "チンゲ",
  tdn: "TDN",
  whip: "ホイップ",
  "inmu-festival": "INMUくん（810祭りVer.）",
};

const DEFAULT_STATS = { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 50 };
const EMPTY_ACTIONS = { "feed-basic": 0, "feed-premium": 0, "play-yarn": 0, "play-ball": 0, "play-toy": 0, pet: 0 };
const EMPTY_COOLDOWNS = { feed: 0, play: 0 };

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
  const result = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : {
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
  state.pets = { ...(state.pets ?? {}), [characterId]: { ...DEFAULT_STATS } };
  state.lastCareAt = { ...(state.lastCareAt ?? {}), [characterId]: { ...EMPTY_ACTIONS } };
  state.cooldownUntil = { ...(state.cooldownUntil ?? {}), [characterId]: { ...EMPTY_COOLDOWNS } };
  state.expressions = { ...(state.expressions ?? {}), [characterId]: { kind: "default", until: 0 } };
  state.petting = { ...(state.petting ?? {}), [characterId]: { count: 0, lastAt: 0 } };
  state.sleepStartedAt = { ...(state.sleepStartedAt ?? {}), [characterId]: 0 };
  state.progress = { ...(state.progress ?? {}), [characterId]: { fullnessAt: now, sleepinessAt: now } };
  state.skillState = { ...(state.skillState ?? {}), [characterId]: true };
  state.selectedPetId = characterId;
  state.activePetIds = [characterId];
  state.version = 7;

  await pool.query(`
    INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt")
    VALUES ($1, $2::jsonb, $3)
    ON CONFLICT ("userId") DO UPDATE SET state = EXCLUDED.state, "clientUpdatedAt" = EXCLUDED."clientUpdatedAt", "updatedAt" = NOW()
  `, [userId, JSON.stringify(state), now]);
}
