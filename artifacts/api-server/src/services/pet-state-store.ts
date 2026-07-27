import { pool } from "@workspace/db";

export const PET_CHARACTER_NAMES: Record<string, string> = {
  nyarushian: "ニャルシアン",
  takuya: "拓也",
  leon: "レオン",
  chinge: "チンゲ",
  tdn: "TDN",
  shikoiruka: "シコイルカ",
  daifugo: "大富豪",
  whip: "ホイップ",
  "inmu-festival": "INMUくん（810祭りVer.）",
  "yajusenpai-male-base": "野獣先輩♂",
  "yajusenpai-male-evolved": "野獣先輩♂（進化）",
  "yajusenpai-female-base": "野獣先輩♀",
  "yajusenpai-female-evolved": "野獣先輩♀（進化）",
};

const DEFAULT_STATS = { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 50 };
const EMPTY_ACTIONS = { "feed-basic": 0, "feed-premium": 0, "play-yarn": 0, "play-ball": 0, "play-toy": 0, pet: 0 };
const EMPTY_COOLDOWNS = { feed: 0, play: 0 };
const SHIKOIRUKA_DISTRIBUTION_CHARACTER_ID = "shikoiruka";
const DAIFUGO_CHARACTER_ID = "daifugo";
const DAIFUGO_REQUIRED_CHALLENGE_LEVEL = 100;
const DAIFUGO_REVOCATION_REASON = "challenge_level_100_not_cleared";
const DAIFUGO_TEST_ACCOUNT_NAME = "ガチャテスト";
const YAJUSENPAI_TEST_BASE_IDS = ["yajusenpai-male-base", "yajusenpai-female-base"] as const;
const YAJUSENPAI_EVOLUTION_MAP = {
  "yajusenpai-male-base": "yajusenpai-male-evolved",
  "yajusenpai-female-base": "yajusenpai-female-evolved",
} as const;
const YAJUSENPAI_EVOLUTION_POINT_COST = 100_000;
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
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petSkillPointGrants" (
        "userId" TEXT NOT NULL,
        "characterId" TEXT NOT NULL,
        "actionId" TEXT NOT NULL,
        "careAction" TEXT NOT NULL,
        amount INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("userId", "characterId", "actionId")
      )
    `),
  ]).then(async () => {
    await pool.query(`ALTER TABLE "userPetStates" ADD COLUMN IF NOT EXISTS "clientUpdatedAt" BIGINT NOT NULL DEFAULT 0`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "petLevelProgressBackups" (
        "userId" TEXT NOT NULL,
        "characterId" TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("userId", "characterId")
      )
    `);
    await pool.query(`
      INSERT INTO "petLevelProgressBackups" ("userId", "characterId", level, exp)
      SELECT
        states."userId",
        pet.key,
        GREATEST(1, CASE
          WHEN jsonb_typeof(pet.value->'level') = 'number' THEN (pet.value->>'level')::numeric::integer
          ELSE 1
        END),
        GREATEST(0, CASE
          WHEN jsonb_typeof(pet.value->'exp') = 'number' THEN (pet.value->>'exp')::numeric::integer
          ELSE 0
        END)
      FROM "userPetStates" states
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(states.state->'pets') = 'object' THEN states.state->'pets' ELSE '{}'::jsonb END
      ) pet
      ON CONFLICT ("userId", "characterId") DO UPDATE SET
        level = GREATEST("petLevelProgressBackups".level, EXCLUDED.level),
        exp = CASE
          WHEN EXCLUDED.level > "petLevelProgressBackups".level THEN EXCLUDED.exp
          WHEN EXCLUDED.level = "petLevelProgressBackups".level THEN GREATEST("petLevelProgressBackups".exp, EXCLUDED.exp)
          ELSE "petLevelProgressBackups".exp
        END,
        "updatedAt" = NOW()
    `);
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
    await reconcileDaifugoOwnership();
  }).catch(error => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}

function removeCharacterFromPetState(
  rawState: unknown,
  characterId: string,
  fallbackCharacterId: string | null,
): Record<string, unknown> | null {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return null;

  const stripCharacter = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value
        .filter(item => String(item) !== characterId)
        .map(stripCharacter);
    }
    if (!value || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== characterId)
        .map(([key, nestedValue]) => [key, stripCharacter(nestedValue)]),
    );
  };

  const cleaned = stripCharacter(rawState) as Record<string, unknown>;
  if (cleaned.selectedPetId === characterId) {
    if (fallbackCharacterId) cleaned.selectedPetId = fallbackCharacterId;
    else delete cleaned.selectedPetId;
  }
  if (cleaned.skillActiveCharacterId === characterId) {
    cleaned.skillActiveCharacterId = null;
  }
  return cleaned;
}

async function reconcileDaifugoOwnership(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["daifugo-ownership-reconciliation"]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "petOwnershipRevocationAudit" (
        id BIGSERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "characterId" TEXT NOT NULL,
        reason TEXT NOT NULL,
        "ownershipSnapshot" JSONB NOT NULL,
        "stateSnapshot" JSONB,
        "revokedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const tables = await client.query(
      `SELECT
         to_regclass('public.inmu_game_users') IS NOT NULL AS "hasGameUsers",
         to_regclass('public.inmu_challenge_progress') IS NOT NULL AS "hasChallengeProgress"`,
    );
    if (!tables.rows[0]?.hasGameUsers || !tables.rows[0]?.hasChallengeProgress) {
      await client.query("COMMIT");
      console.warn("[Daifugo] ownership reconciliation skipped because challenge progress tables are unavailable");
      return;
    }

    const ownership = await client.query(`
      SELECT
        owned.id,
        owned."userId",
        owned."sourceMissionId",
        owned."acquiredAt",
        states.state,
        ARRAY(
          SELECT other."characterId"
          FROM "userPetCharacters" AS other
          WHERE other."userId" = owned."userId"
            AND other."characterId" <> $1
          ORDER BY other."acquiredAt" ASC
        ) AS "otherCharacterIds",
        EXISTS (
          SELECT 1
          FROM inmu_game_users AS game_user
          JOIN inmu_challenge_progress AS progress
            ON progress.game_user_id = game_user.id
          WHERE game_user.portal_user_id = owned."userId"
            AND COALESCE(progress.highest_cleared_level, 0) >= $2
            AND $2 = ANY(COALESCE(progress.cleared_levels, '{}'::integer[]))
        ) AS "hasClearedLevel100"
      FROM "userPetCharacters" AS owned
      LEFT JOIN "userPetStates" AS states ON states."userId" = owned."userId"
      WHERE owned."characterId" = $1
      FOR UPDATE OF owned
    `, [DAIFUGO_CHARACTER_ID, DAIFUGO_REQUIRED_CHALLENGE_LEVEL]);

    const invalidOwners = ownership.rows.filter((row: { hasClearedLevel100?: boolean }) => !row.hasClearedLevel100);
    for (const owner of invalidOwners) {
      const ownershipSnapshot = {
        id: owner.id,
        userId: owner.userId,
        characterId: DAIFUGO_CHARACTER_ID,
        sourceMissionId: owner.sourceMissionId,
        acquiredAt: owner.acquiredAt,
      };
      await client.query(
        `INSERT INTO "petOwnershipRevocationAudit"
           ("userId", "characterId", reason, "ownershipSnapshot", "stateSnapshot")
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
        [
          owner.userId,
          DAIFUGO_CHARACTER_ID,
          DAIFUGO_REVOCATION_REASON,
          JSON.stringify(ownershipSnapshot),
          owner.state == null ? null : JSON.stringify(owner.state),
        ],
      );

      if (owner.state != null) {
        const fallbackCharacterId = Array.isArray(owner.otherCharacterIds)
          ? String(owner.otherCharacterIds[0] ?? "") || null
          : null;
        const cleanedState = removeCharacterFromPetState(
          owner.state,
          DAIFUGO_CHARACTER_ID,
          fallbackCharacterId,
        );
        if (cleanedState) {
          await client.query(
            `UPDATE "userPetStates"
             SET state = $2::jsonb,
                 "clientUpdatedAt" = GREATEST("clientUpdatedAt", $3),
                 "updatedAt" = NOW()
             WHERE "userId" = $1`,
            [owner.userId, JSON.stringify(cleanedState), Date.now()],
          );
        }
      }

      await client.query(
        `DELETE FROM "petLevelProgressBackups"
         WHERE "userId" = $1 AND "characterId" = $2`,
        [owner.userId, DAIFUGO_CHARACTER_ID],
      );
      await client.query(
        `DELETE FROM "userPetCharacters"
         WHERE id = $1 AND "userId" = $2 AND "characterId" = $3`,
        [owner.id, owner.userId, DAIFUGO_CHARACTER_ID],
      );
    }

    await client.query("COMMIT");
    console.info(
      `[Daifugo] ownership reconciliation checked=${ownership.rows.length} valid=${ownership.rows.length - invalidOwners.length} revoked=${invalidOwners.length}`,
    );
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function readProgress(value: unknown): { level: number; exp: number } {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const level = Math.max(1, Math.floor(Number(record.level) || 1));
  const exp = Math.max(0, Math.floor(Number(record.exp) || 0));
  return { level, exp };
}

export async function preserveAndRestorePetLevelProgress(userId: string) {
  await ensurePetStateTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stateResult = await client.query(
      `SELECT state FROM "userPetStates" WHERE "userId" = $1 FOR UPDATE`,
      [userId],
    );
    const state = stateResult.rows[0]?.state;
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      await client.query("COMMIT");
      return null;
    }

    const stateRecord = state as Record<string, any>;
    const pets = stateRecord.pets && typeof stateRecord.pets === "object" && !Array.isArray(stateRecord.pets)
      ? { ...stateRecord.pets }
      : {};
    await client.query(`
      INSERT INTO "petLevelProgressBackups" ("userId", "characterId", level, exp)
      SELECT
        $1::text,
        pet.key,
        GREATEST(1, CASE
          WHEN jsonb_typeof(pet.value->'level') = 'number' THEN (pet.value->>'level')::numeric::integer
          ELSE 1
        END),
        GREATEST(0, CASE
          WHEN jsonb_typeof(pet.value->'exp') = 'number' THEN (pet.value->>'exp')::numeric::integer
          ELSE 0
        END)
      FROM jsonb_each(
        CASE WHEN jsonb_typeof($2::jsonb->'pets') = 'object' THEN $2::jsonb->'pets' ELSE '{}'::jsonb END
      ) pet
      ON CONFLICT ("userId", "characterId") DO UPDATE SET
        level = GREATEST("petLevelProgressBackups".level, EXCLUDED.level),
        exp = CASE
          WHEN EXCLUDED.level > "petLevelProgressBackups".level THEN EXCLUDED.exp
          WHEN EXCLUDED.level = "petLevelProgressBackups".level THEN GREATEST("petLevelProgressBackups".exp, EXCLUDED.exp)
          ELSE "petLevelProgressBackups".exp
        END,
        "updatedAt" = NOW()
    `, [userId, JSON.stringify(stateRecord)]);

    const backupResult = await client.query(
      `SELECT "characterId", level, exp FROM "petLevelProgressBackups" WHERE "userId" = $1`,
      [userId],
    );
    let changed = false;
    for (const backup of backupResult.rows) {
      const characterId = String(backup.characterId);
      const currentStats = pets[characterId];
      const currentProgress = readProgress(currentStats);
      const backupLevel = Math.max(1, Number(backup.level) || 1);
      const backupExp = Math.max(0, Number(backup.exp) || 0);
      if (currentProgress.level > backupLevel || (currentProgress.level === backupLevel && currentProgress.exp >= backupExp)) {
        continue;
      }
      pets[characterId] = {
        ...(currentStats && typeof currentStats === "object" ? currentStats : DEFAULT_STATS),
        level: backupLevel,
        exp: backupExp,
      };
      changed = true;
    }

    if (changed) {
      stateRecord.pets = pets;
      await client.query(
        `UPDATE "userPetStates" SET state = $2::jsonb, "updatedAt" = NOW() WHERE "userId" = $1`,
        [userId, JSON.stringify(stateRecord)],
      );
    }
    await client.query("COMMIT");
    return stateRecord;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function initializePetCharacterState(
  userId: string,
  characterId: string,
  options: { minimumLevel?: number; skillEnabled?: boolean } = {},
) {
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
    const minimumLevel = Math.max(1, Math.floor(Number(options.minimumLevel) || 1));
    if (!state.pets?.[characterId] || typeof state.pets[characterId] !== "object") {
      state.pets = { ...(state.pets ?? {}), [characterId]: { ...DEFAULT_STATS, level: minimumLevel } };
      state.lastCareAt = { ...(state.lastCareAt ?? {}), [characterId]: { ...EMPTY_ACTIONS } };
      state.cooldownUntil = { ...(state.cooldownUntil ?? {}), [characterId]: { ...EMPTY_COOLDOWNS } };
      state.expressions = { ...(state.expressions ?? {}), [characterId]: { kind: "default", until: 0 } };
      state.petting = { ...(state.petting ?? {}), [characterId]: { count: 0, lastAt: 0 } };
      state.sleepStartedAt = { ...(state.sleepStartedAt ?? {}), [characterId]: 0 };
      state.progress = { ...(state.progress ?? {}), [characterId]: { fullnessAt: now, sleepinessAt: now } };
    } else if (Number(state.pets[characterId].level ?? 1) < minimumLevel) {
      state.pets = {
        ...(state.pets ?? {}),
        [characterId]: { ...state.pets[characterId], level: minimumLevel, exp: 0 },
      };
    }
    state.skillState = {
      ...(state.skillState ?? {}),
      [characterId]: state.skillState?.[characterId] ?? (options.skillEnabled !== false),
    };
    state.version = Math.max(7, Number(state.version) || 0);

    await client.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT ("userId") DO UPDATE SET state = EXCLUDED.state, "clientUpdatedAt" = EXCLUDED."clientUpdatedAt", "updatedAt" = NOW()
    `, [userId, JSON.stringify(state), now]);
    await client.query(
      `INSERT INTO "petLevelProgressBackups" ("userId", "characterId", level, exp)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT ("userId", "characterId") DO UPDATE SET
         level = GREATEST("petLevelProgressBackups".level, EXCLUDED.level),
         exp = CASE WHEN EXCLUDED.level > "petLevelProgressBackups".level THEN 0 ELSE "petLevelProgressBackups".exp END,
         "updatedAt" = NOW()`,
      [userId, characterId, minimumLevel],
    );
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

function normalizeTestAccountName(value: unknown): string {
  return String(value ?? "").replace(/[\s\u3000]+/g, "").toLowerCase();
}

export async function isPetFeatureTestAccount(userId: string): Promise<boolean> {
  const account = await pool.query(
    `SELECT u.name, p."displayName"
     FROM "user" AS u
     LEFT JOIN profile AS p ON p."userId" = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId],
  );
  const row = account.rows[0];
  const targetName = normalizeTestAccountName(DAIFUGO_TEST_ACCOUNT_NAME);
  const isTestAccount =
    normalizeTestAccountName(row?.name) === targetName ||
    normalizeTestAccountName(row?.displayName) === targetName;
  return isTestAccount;
}

export async function ensureYajusenpaiTestDistributionForUser(userId: string): Promise<boolean> {
  if (!await isPetFeatureTestAccount(userId)) return false;
  await ensurePetStateTable();
  const ownership = await pool.query(
    `SELECT "characterId" FROM "userPetCharacters"
     WHERE "userId" = $1
       AND "characterId" IN ('yajusenpai-male-base', 'yajusenpai-male-evolved', 'yajusenpai-female-base', 'yajusenpai-female-evolved')`,
    [userId],
  );
  const ownedIds = new Set(ownership.rows.map((row: { characterId: unknown }) => String(row.characterId)));
  let granted = false;
  for (const characterId of YAJUSENPAI_TEST_BASE_IDS) {
    const evolvedCharacterId = YAJUSENPAI_EVOLUTION_MAP[characterId];
    if (ownedIds.has(evolvedCharacterId)) continue;
    const inserted = await pool.query(
      `INSERT INTO "userPetCharacters" ("userId", "characterId")
       VALUES ($1, $2)
       ON CONFLICT ("userId", "characterId") DO NOTHING
       RETURNING "characterId"`,
      [userId, characterId],
    );
    granted ||= Boolean(inserted.rowCount);
    ownedIds.add(characterId);
    await initializePetCharacterState(userId, characterId, { minimumLevel: 30, skillEnabled: false });
  }
  return granted;
}

export async function evolveYajusenpaiForTestUser(userId: string, baseCharacterId: string) {
  if (!await isPetFeatureTestAccount(userId)) {
    return { ok: false as const, reason: "not_test_account" as const };
  }
  const evolvedCharacterId = YAJUSENPAI_EVOLUTION_MAP[baseCharacterId as keyof typeof YAJUSENPAI_EVOLUTION_MAP];
  if (!evolvedCharacterId) {
    return { ok: false as const, reason: "invalid_character" as const };
  }

  await ensurePetStateTable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`yajusenpai-evolution:${userId}`]);

    const ownership = await client.query(
      `SELECT "characterId" FROM "userPetCharacters"
       WHERE "userId" = $1 AND "characterId" IN ($2, $3)
       FOR UPDATE`,
      [userId, baseCharacterId, evolvedCharacterId],
    );
    const ownedIds = new Set(ownership.rows.map((row: { characterId: unknown }) => String(row.characterId)));
    if (ownedIds.has(evolvedCharacterId)) {
      const balance = await client.query(
        `SELECT COALESCE("monthlyPoints", 0) AS balance FROM profile WHERE "userId" = $1 LIMIT 1`,
        [userId],
      );
      await client.query("COMMIT");
      return {
        ok: true as const,
        alreadyEvolved: true,
        fromCharacterId: baseCharacterId,
        toCharacterId: evolvedCharacterId,
        level: 31,
        remainingPoints: Number(balance.rows[0]?.balance ?? 0),
      };
    }
    if (!ownedIds.has(baseCharacterId)) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "not_owned" as const };
    }

    const stateResult = await client.query(
      `SELECT state FROM "userPetStates" WHERE "userId" = $1 FOR UPDATE`,
      [userId],
    );
    const state = stateResult.rows[0]?.state as Record<string, any> | undefined;
    const baseStats = state?.pets?.[baseCharacterId];
    if (!state || !baseStats || Math.floor(Number(baseStats.level) || 1) < 30) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "level_too_low" as const };
    }
    if (state.walks?.active?.[baseCharacterId]) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "walking" as const };
    }

    const profileResult = await client.query(
      `SELECT COALESCE("monthlyPoints", 0) AS balance FROM profile WHERE "userId" = $1 FOR UPDATE`,
      [userId],
    );
    if (!profileResult.rows.length) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "profile_not_found" as const };
    }
    const currentPoints = Number(profileResult.rows[0].balance ?? 0);
    if (currentPoints < YAJUSENPAI_EVOLUTION_POINT_COST) {
      await client.query("ROLLBACK");
      return {
        ok: false as const,
        reason: "insufficient_points" as const,
        requiredPoints: YAJUSENPAI_EVOLUTION_POINT_COST,
        currentPoints,
      };
    }

    const evolvedStats = { ...baseStats, level: 31, exp: 0 };
    state.pets = { ...(state.pets ?? {}), [evolvedCharacterId]: evolvedStats };
    const scopedKeys = [
      "lastCareAt", "cooldownUntil", "expressions", "petting", "sleepStartedAt",
      "sleepStartValue", "sleepWakeAt", "progress", "lastHungerPenaltyDate",
    ];
    for (const key of scopedKeys) {
      if (state[key] && typeof state[key] === "object" && !Array.isArray(state[key])) {
        state[key] = { ...state[key], [evolvedCharacterId]: state[key][baseCharacterId] };
      }
    }
    state.selectedPetId = state.selectedPetId === baseCharacterId ? evolvedCharacterId : state.selectedPetId;
    const replaceId = (value: unknown) => Array.isArray(value)
      ? [...new Set(value.map(id => id === baseCharacterId ? evolvedCharacterId : id))]
      : value;
    state.activePetIds = replaceId(state.activePetIds);
    state.skillActiveCharacterIds = Array.isArray(state.skillActiveCharacterIds)
      ? state.skillActiveCharacterIds.filter((id: unknown) => id !== baseCharacterId && id !== evolvedCharacterId)
      : [];
    if (state.skillActiveCharacterId === baseCharacterId) state.skillActiveCharacterId = null;
    state.skillState = { ...(state.skillState ?? {}), [baseCharacterId]: false, [evolvedCharacterId]: false };
    state.version = Math.max(7, Number(state.version) || 0);

    const now = Date.now();
    await client.query(
      `UPDATE profile
       SET "monthlyPoints" = "monthlyPoints" - $2, "updatedAt" = NOW()
       WHERE "userId" = $1`,
      [userId, YAJUSENPAI_EVOLUTION_POINT_COST],
    );
    await client.query(
      `DELETE FROM "userPetCharacters" WHERE "userId" = $1 AND "characterId" = $2`,
      [userId, baseCharacterId],
    );
    await client.query(
      `INSERT INTO "userPetCharacters" ("userId", "characterId")
       VALUES ($1, $2)
       ON CONFLICT ("userId", "characterId") DO NOTHING`,
      [userId, evolvedCharacterId],
    );
    await client.query(
      `UPDATE "userPetStates"
       SET state = $2::jsonb, "clientUpdatedAt" = $3, "updatedAt" = NOW()
       WHERE "userId" = $1`,
      [userId, JSON.stringify(state), now],
    );
    await client.query(
      `INSERT INTO "petLevelProgressBackups" ("userId", "characterId", level, exp)
       VALUES ($1, $2, 31, 0)
       ON CONFLICT ("userId", "characterId") DO UPDATE SET level = 31, exp = 0, "updatedAt" = NOW()`,
      [userId, evolvedCharacterId],
    );
    await client.query(
      `INSERT INTO points ("userId", amount, type, source, month)
       VALUES ($1, $2, 'pet_evolution', $3, $4)`,
      [
        userId,
        -YAJUSENPAI_EVOLUTION_POINT_COST,
        `${PET_CHARACTER_NAMES[baseCharacterId]} 進化`,
        new Date().toISOString().slice(0, 7),
      ],
    );
    await client.query("COMMIT");
    return {
      ok: true as const,
      alreadyEvolved: false,
      fromCharacterId: baseCharacterId,
      toCharacterId: evolvedCharacterId,
      level: 31,
      remainingPoints: currentPoints - YAJUSENPAI_EVOLUTION_POINT_COST,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getDaifugoRewardStatus(userId: string) {
  await ensurePetStateTable();
  const [progress, ownership] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(MAX(COALESCE(p.highest_cleared_level, 0)), 0)::int AS "highestClearedLevel",
         COALESCE(BOOL_OR(
           COALESCE(p.highest_cleared_level, 0) >= $2
           AND $2 = ANY(COALESCE(p.cleared_levels, '{}'::integer[]))
         ), false) AS "hasClearedLevel100"
       FROM inmu_game_users u
       LEFT JOIN inmu_challenge_progress p ON p.game_user_id = u.id
       WHERE u.portal_user_id = $1`,
      [userId, DAIFUGO_REQUIRED_CHALLENGE_LEVEL],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT 1 FROM "userPetCharacters"
       WHERE "userId" = $1 AND "characterId" = 'daifugo'
       LIMIT 1`,
      [userId],
    ),
  ]);
  const highestClearedLevel = Math.min(100, Math.max(0, Number(progress.rows[0]?.highestClearedLevel ?? 0)));
  const hasClearedLevel100 = progress.rows[0]?.hasClearedLevel100 === true;
  return {
    highestClearedLevel,
    eligible: hasClearedLevel100,
    claimed: ownership.rows.length > 0,
  };
}

export async function claimDaifugoReward(userId: string) {
  await ensurePetStateTable();
  const client = await pool.connect();
  let newlyClaimed = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`daifugo-pet:${userId}`]);
    const progress = await client.query(
      `SELECT
         COALESCE(MAX(COALESCE(p.highest_cleared_level, 0)), 0)::int AS "highestClearedLevel",
         COALESCE(BOOL_OR(
           COALESCE(p.highest_cleared_level, 0) >= $2
           AND $2 = ANY(COALESCE(p.cleared_levels, '{}'::integer[]))
         ), false) AS "hasClearedLevel100"
       FROM inmu_game_users u
       LEFT JOIN inmu_challenge_progress p ON p.game_user_id = u.id
       WHERE u.portal_user_id = $1`,
      [userId, DAIFUGO_REQUIRED_CHALLENGE_LEVEL],
    );
    const highestClearedLevel = Math.min(100, Math.max(0, Number(progress.rows[0]?.highestClearedLevel ?? 0)));
    const hasClearedLevel100 = progress.rows[0]?.hasClearedLevel100 === true;
    if (!hasClearedLevel100) {
      await client.query("ROLLBACK");
      return { ok: false as const, reason: "not_eligible" as const, highestClearedLevel };
    }
    const inserted = await client.query(
      `INSERT INTO "userPetCharacters" ("userId", "characterId")
       VALUES ($1, 'daifugo')
       ON CONFLICT ("userId", "characterId") DO NOTHING
       RETURNING "characterId"`,
      [userId],
    );
    newlyClaimed = Boolean(inserted.rowCount);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await initializePetCharacterState(userId, "daifugo");
  return { ok: true as const, newlyClaimed };
}
