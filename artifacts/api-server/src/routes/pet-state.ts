import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/session";
import { ensurePetStateTable, ensureShikoirukaDistributionForUser, PET_CHARACTER_NAMES } from "../services/pet-state-store";
import { ensurePetCommerceTables } from "./pet-commerce";
import { getSkillLockStatus, recordDailyPetSkillUse } from "../services/pet-skills";

const router = Router();

function extractSkillActiveIds(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const record = state as Record<string, unknown>;
  if (Array.isArray(record.skillActiveCharacterIds)) {
    return record.skillActiveCharacterIds.map(String).slice(0, 3);
  }
  if (record.skillActiveCharacterId != null) return [String(record.skillActiveCharacterId)];
  return [];
}

function extractActivePetIds(state: unknown): string[] {
  if (!state || typeof state !== "object" || Array.isArray(state)) return [];
  const record = state as Record<string, unknown>;
  if (!Array.isArray(record.activePetIds)) return [];
  return record.activePetIds.map(String).slice(0, 3);
}

function readPetItemCount(items: unknown, camelKey: string, snakeKey: string): number {
  if (!items || typeof items !== "object" || Array.isArray(items)) return 0;
  const record = items as Record<string, unknown>;
  const value = record[camelKey] ?? record[snakeKey];
  const count = Math.floor(Number(value ?? 0));
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function preservePetLevelProgress(existingState: unknown, incomingState: Record<string, any>) {
  if (!existingState || typeof existingState !== "object" || Array.isArray(existingState)) return;
  const existingPets = (existingState as Record<string, any>).pets;
  if (!existingPets || typeof existingPets !== "object" || Array.isArray(existingPets)) return;
  const incomingPets = incomingState.pets && typeof incomingState.pets === "object" && !Array.isArray(incomingState.pets)
    ? { ...incomingState.pets }
    : {};

  for (const [characterId, existingStats] of Object.entries(existingPets)) {
    if (!existingStats || typeof existingStats !== "object" || Array.isArray(existingStats)) continue;
    const incomingStats = incomingPets[characterId];
    if (!incomingStats || typeof incomingStats !== "object" || Array.isArray(incomingStats)) {
      incomingPets[characterId] = existingStats;
      continue;
    }
    const existingLevel = Math.max(1, Math.floor(Number((existingStats as Record<string, any>).level) || 1));
    const incomingLevel = Math.max(1, Math.floor(Number(incomingStats.level) || 1));
    const existingExp = Math.max(0, Math.floor(Number((existingStats as Record<string, any>).exp) || 0));
    const incomingExp = Math.max(0, Math.floor(Number(incomingStats.exp) || 0));
    if (incomingLevel < existingLevel) {
      incomingPets[characterId] = { ...incomingStats, level: existingLevel, exp: existingExp };
    } else if (incomingLevel === existingLevel && incomingExp < existingExp) {
      incomingPets[characterId] = { ...incomingStats, exp: existingExp };
    }
  }
  incomingState.pets = incomingPets;
}

router.get("/pet/state", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetStateTable();
    await ensurePetCommerceTables();
    const shikoirukaGranted = await ensureShikoirukaDistributionForUser(req.userId!);
    const [stateResult, ownershipResult, claimsResult] = await Promise.all([
      pool.query(`SELECT state, "updatedAt" FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]),
      pool.query(`SELECT "characterId" FROM "userPetCharacters" WHERE "userId" = $1 ORDER BY "acquiredAt" ASC`, [req.userId!]),
      pool.query(`SELECT "characterId", "rewardLevel", "rewardType", amount FROM "petLevelRewardClaims" WHERE "userId" = $1`, [req.userId!]).catch(() => ({ rows: [] })),
    ]);
    const activeSkillIds = extractSkillActiveIds(stateResult.rows[0]?.state ?? null);
    const skillLockStatus = activeSkillIds.length ? await getSkillLockStatus(req.userId!, activeSkillIds) : {};
    res.json({
      hasState: stateResult.rows.length > 0,
      state: stateResult.rows[0]?.state ?? null,
      updatedAt: stateResult.rows[0]?.updatedAt ?? null,
      ownedCharacterIds: ownershipResult.rows.map(row => String(row.characterId)),
      characters: Object.entries(PET_CHARACTER_NAMES).map(([id, name]) => ({ id, name })),
      levelRewardClaims: claimsResult.rows,
      skillLockStatus,
      shikoirukaGranted,
    });
  } catch (error) {
    console.error("[PetState] load", error);
    res.status(500).json({ error: "INMU PETデータの取得に失敗しました" });
  }
});

// ── 固有スキル発動キャラクターの「本日使用済み」ロック状態のみを軽量取得 ──
router.get("/pet/skill-lock-status", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetStateTable();
    const stateResult = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]);
    const activeSkillIds = extractSkillActiveIds(stateResult.rows[0]?.state ?? null);
    const skillLockStatus = activeSkillIds.length ? await getSkillLockStatus(req.userId!, activeSkillIds) : {};
    res.json({ skillLockStatus });
  } catch (error) {
    console.error("[PetState] skill-lock-status", error);
    res.status(500).json({ error: "取得に失敗しました" });
  }
});

router.post("/pet/skill-use", requireAuth, async (req, res): Promise<void> => {
  const characterId = String(req.body?.characterId ?? "").trim();
  if (characterId !== "shikoiruka") {
    res.status(400).json({ error: "Unsupported PET skill" });
    return;
  }
  try {
    await ensurePetStateTable();
    const [stateResult, ownershipResult] = await Promise.all([
      pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]),
      pool.query(`SELECT 1 FROM "userPetCharacters" WHERE "userId"=$1 AND "characterId"=$2 LIMIT 1`, [req.userId!, characterId]),
    ]);
    const activeSkillIds = extractSkillActiveIds(stateResult.rows[0]?.state ?? null);
    if ((ownershipResult.rowCount ?? 0) <= 0) {
      res.status(400).json({ error: "PET character is not owned" });
      return;
    }
    await recordDailyPetSkillUse(req.userId!, characterId);
    const statusIds = activeSkillIds.includes(characterId) ? activeSkillIds : [...activeSkillIds, characterId];
    const skillLockStatus = await getSkillLockStatus(req.userId!, statusIds);
    res.json({ ok: true, skillLockStatus });
  } catch (error) {
    console.error("[PetState] skill-use", error);
    res.status(500).json({ error: "Failed to record PET skill use" });
  }
});

router.post("/pet/walk/point-grant", requireAuth, async (req, res): Promise<void> => {
  const resultId = String(req.body?.resultId ?? "").trim();
  const amount = Math.floor(Number(req.body?.amount ?? 0));
  if (!/^walk-[a-z0-9-]+/i.test(resultId) || amount < 100 || amount > 5000 || amount % 100 !== 0) {
    res.status(400).json({ error: "散歩ポイント報酬が不正です" });
    return;
  }
  const client = await pool.connect();
  try {
    await ensurePetStateTable();
    await client.query(`
      CREATE TABLE IF NOT EXISTS "petWalkPointGrants" (
        "resultId" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        amount INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO "petWalkPointGrants" ("resultId","userId",amount)
       VALUES ($1,$2,$3)
       ON CONFLICT ("resultId") DO NOTHING
       RETURNING "resultId"`,
      [resultId, req.userId!, amount],
    );
    if (inserted.rowCount) {
      const month = new Date().toISOString().slice(0, 7);
      await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"+$1,"updatedAt"=NOW() WHERE "userId"=$2`, [amount, req.userId!]);
      await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_walk_reward','INMU PET散歩報酬',$3)`, [req.userId!, amount, month]);
    }
    await client.query("COMMIT");
    res.json({ ok: true, granted: Boolean(inserted.rowCount) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetState] walk point grant", error);
    res.status(500).json({ error: "散歩ポイント報酬の付与に失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet/affection-gift/point-grant", requireAuth, async (req, res): Promise<void> => {
  const giftId = String(req.body?.giftId ?? "").trim();
  const amount = Math.floor(Number(req.body?.amount ?? 0));
  if (!/^affection-[a-z0-9-]+/i.test(giftId) || amount < 100 || amount > 5000 || amount % 100 !== 0) {
    res.status(400).json({ error: "PET affection gift point reward is invalid" });
    return;
  }
  const client = await pool.connect();
  try {
    await ensurePetStateTable();
    await client.query(`
      CREATE TABLE IF NOT EXISTS "petAffectionPointGrants" (
        "giftId" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        amount INTEGER NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO "petAffectionPointGrants" ("giftId","userId",amount)
       VALUES ($1,$2,$3)
       ON CONFLICT ("giftId") DO NOTHING
       RETURNING "giftId"`,
      [giftId, req.userId!, amount],
    );
    if (inserted.rowCount) {
      const month = new Date().toISOString().slice(0, 7);
      await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"+$1,"updatedAt"=NOW() WHERE "userId"=$2`, [amount, req.userId!]);
      await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_affection_gift','INMU PET affection gift',$3)`, [req.userId!, amount, month]);
    }
    await client.query("COMMIT");
    res.json({ ok: true, granted: Boolean(inserted.rowCount) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetState] affection gift point grant", error);
    res.status(500).json({ error: "Failed to grant PET affection gift points" });
  } finally {
    client.release();
  }
});

router.put("/pet/state", requireAuth, async (req, res): Promise<void> => {
  const state = req.body?.state;
  const baseline = req.body?.baseline;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    res.status(400).json({ error: "PETデータが不正です" });
    return;
  }
  const clientUpdatedAt = Number.isFinite(Number(req.body?.clientUpdatedAt)) ? Math.max(0, Number(req.body.clientUpdatedAt)) : Date.now();
  try {
    await ensurePetStateTable();
    await ensurePetCommerceTables();
    const existing = await pool.query(`SELECT state FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]);
    const existingState = existing.rows[0]?.state && typeof existing.rows[0].state === "object" ? existing.rows[0].state : null;
    const prevActiveSkillIds = extractSkillActiveIds(existingState);
    const nextActiveSkillIds = extractSkillActiveIds(state);
    const prevActivePetIds = extractActivePetIds(existingState);
    const nextActivePetIds = extractActivePetIds(state);
    const baselineActivePetIds = extractActivePetIds(baseline);
    const removedSkillIds = prevActiveSkillIds.filter(id => !nextActiveSkillIds.includes(id));
    if (removedSkillIds.length > 0) {
      const lockStatus = await getSkillLockStatus(req.userId!, removedSkillIds);
      if (removedSkillIds.some(id => lockStatus[id])) {
        res.status(409).json({ error: "本日その固有スキルの効果を使用済みのため外せません（毎日0:00にリセットされます）" });
        return;
      }
    }
    // Level-reward effect slots are independent from paid training-slot unlocks.
    // Keep up to three selected characters instead of trimming this list to the
    // number of unlocked training slots on every autosave. Older clients can
    // still send a stale one-slot snapshot, so preserve the DB value in that
    // specific downgrade case instead of accidentally clearing slots 2-3.
    if (Array.isArray(state.activePetIds)) {
      const staleOneSlotOverwrite =
        prevActivePetIds.length > nextActivePetIds.length &&
        nextActivePetIds.length <= 1 &&
        baselineActivePetIds.length < prevActivePetIds.length;
      state.activePetIds = staleOneSlotOverwrite ? prevActivePetIds : nextActivePetIds;
    }

    // PET levels only move forward. Protect server progress from old tabs,
    // stale localStorage, and duplicate character-grant initialization.
    preservePetLevelProgress(existingState, state as Record<string, any>);

    // Merge consumable item deltas against the current DB state so rewards from
    // missions, gacha, and other server-side paths are not overwritten by autosave.
    let mergedItems: { sleepTea: number; premiumInventory: number; takuyaSunglasses: number; catHeadband: number } | null = null;
    if (existingState && baseline && typeof baseline === "object") {
      const dbItems = (existingState as Record<string, any>).items;
      const incomingItems = (state as Record<string, any>).items;
      const dbSleepTea = readPetItemCount(dbItems, "sleepTea", "sleep_tea");
      const dbPremiumInventory = Number((existingState as Record<string, any>).premiumFood?.inventory ?? 0);
      const dbTakuyaSunglasses = readPetItemCount(dbItems, "takuyaSunglasses", "takuya_sunglasses");
      const dbCatHeadband = readPetItemCount(dbItems, "catHeadband", "cat_headband");
      const incomingSleepTea = readPetItemCount(incomingItems, "sleepTea", "sleep_tea");
      const incomingPremiumInventory = Number((state as Record<string, any>).premiumFood?.inventory ?? 0);
      const incomingTakuyaSunglasses = readPetItemCount(incomingItems, "takuyaSunglasses", "takuya_sunglasses");
      const incomingCatHeadband = readPetItemCount(incomingItems, "catHeadband", "cat_headband");
      const baselineSleepTea = Number.isFinite(Number(baseline.sleepTea)) ? Number(baseline.sleepTea) : incomingSleepTea;
      const baselinePremiumInventory = Number.isFinite(Number(baseline.premiumInventory)) ? Number(baseline.premiumInventory) : incomingPremiumInventory;
      const baselineTakuyaSunglasses = Number.isFinite(Number(baseline.takuyaSunglasses)) ? Number(baseline.takuyaSunglasses) : incomingTakuyaSunglasses;
      const baselineCatHeadband = Number.isFinite(Number(baseline.catHeadband)) ? Number(baseline.catHeadband) : incomingCatHeadband;

      const sleepTeaDelta = incomingSleepTea - baselineSleepTea;
      const premiumDelta = incomingPremiumInventory - baselinePremiumInventory;
      const takuyaSunglassesDelta = incomingTakuyaSunglasses - baselineTakuyaSunglasses;
      const catHeadbandDelta = incomingCatHeadband - baselineCatHeadband;

      const mergedSleepTea = Math.max(0, dbSleepTea + sleepTeaDelta);
      const mergedPremiumInventory = Math.max(0, dbPremiumInventory + premiumDelta);
      const mergedTakuyaSunglasses = Math.max(0, dbTakuyaSunglasses + takuyaSunglassesDelta);
      const mergedCatHeadband = Math.max(0, dbCatHeadband + catHeadbandDelta);
      mergedItems = { sleepTea: mergedSleepTea, premiumInventory: mergedPremiumInventory, takuyaSunglasses: mergedTakuyaSunglasses, catHeadband: mergedCatHeadband };

      state.items = { ...(state as Record<string, any>).items, sleepTea: mergedSleepTea, takuyaSunglasses: mergedTakuyaSunglasses, catHeadband: mergedCatHeadband };
      state.premiumFood = { ...(state as Record<string, any>).premiumFood, inventory: mergedPremiumInventory };
    }

    const serialized = JSON.stringify(state);
    if (serialized.length > 250_000) {
      res.status(413).json({ error: "PETデータが大きすぎます" });
      return;
    }
    await pool.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT ("userId") DO UPDATE
        SET state = EXCLUDED.state, "clientUpdatedAt" = EXCLUDED."clientUpdatedAt", "updatedAt" = NOW()
        WHERE "userPetStates"."clientUpdatedAt" <= EXCLUDED."clientUpdatedAt"
    `, [req.userId!, serialized, clientUpdatedAt]);
    res.json({ ok: true, mergedItems });
  } catch (error) {
    console.error("[PetState] save", error);
    res.status(500).json({ error: "INMU PETデータの保存に失敗しました" });
  }
});

export default router;
