import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/session";
import { ensurePetStateTable, PET_CHARACTER_NAMES } from "../services/pet-state-store";
import { ensurePetCommerceTables } from "./pet-commerce";
import { getSkillLockStatus } from "../services/pet-skills";

const router = Router();

router.get("/pet/state", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetStateTable();
    await ensurePetCommerceTables();
    const [stateResult, ownershipResult, claimsResult] = await Promise.all([
      pool.query(`SELECT state, "updatedAt" FROM "userPetStates" WHERE "userId" = $1`, [req.userId!]),
      pool.query(`SELECT "characterId" FROM "userPetCharacters" WHERE "userId" = $1 ORDER BY "acquiredAt" ASC`, [req.userId!]),
      pool.query(`SELECT "characterId", "rewardLevel", "rewardType", amount FROM "petLevelRewardClaims" WHERE "userId" = $1`, [req.userId!]).catch(() => ({ rows: [] })),
    ]);
    res.json({
      hasState: stateResult.rows.length > 0,
      state: stateResult.rows[0]?.state ?? null,
      updatedAt: stateResult.rows[0]?.updatedAt ?? null,
      ownedCharacterIds: ownershipResult.rows.map(row => String(row.characterId)),
      characters: Object.entries(PET_CHARACTER_NAMES).map(([id, name]) => ({ id, name })),
      levelRewardClaims: claimsResult.rows,
    });
  } catch (error) {
    console.error("[PetState] load", error);
    res.status(500).json({ error: "INMU PETデータの取得に失敗しました" });
  }
});

router.put("/pet/state", requireAuth, async (req, res): Promise<void> => {
  const state = req.body?.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    res.status(400).json({ error: "PETデータが不正です" });
    return;
  }
  const serialized = JSON.stringify(state);
  const clientUpdatedAt = Number.isFinite(Number(req.body?.clientUpdatedAt)) ? Math.max(0, Number(req.body.clientUpdatedAt)) : Date.now();
  if (serialized.length > 250_000) {
    res.status(413).json({ error: "PETデータが大きすぎます" });
    return;
  }
  try {
    await ensurePetStateTable();
    await ensurePetCommerceTables();
    const slotResult = await pool.query(`SELECT COUNT(*)::int AS count FROM "petSlotUnlocks" WHERE "userId"=$1`, [req.userId!]);
    const maxSlots = Math.min(3, 1 + Number(slotResult.rows[0]?.count ?? 0));
    if (Array.isArray(state.activePetIds)) state.activePetIds = state.activePetIds.slice(0, maxSlots);
    await pool.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt")
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT ("userId") DO UPDATE
        SET state = EXCLUDED.state, "clientUpdatedAt" = EXCLUDED."clientUpdatedAt", "updatedAt" = NOW()
    `, [req.userId!, serialized, clientUpdatedAt]);
    res.json({ ok: true });
  } catch (error) {
    console.error("[PetState] save", error);
    res.status(500).json({ error: "INMU PETデータの保存に失敗しました" });
  }
});

// ── GET /api/pet/skill-lock-status ──
// スキル発動中のキャラが本日使用済みかどうかを返す（使用後は0:00まで外せない）
router.get("/pet/skill-lock-status", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const { rows } = await pool.query(
      `SELECT state FROM "userPetStates" WHERE "userId"=$1 LIMIT 1`,
      [userId],
    );
    const state = rows[0]?.state ?? {};
    const normalize = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/_/g, "-");
    const skillIds: string[] = Array.isArray(state.skillActiveCharacterIds)
      ? state.skillActiveCharacterIds.map(normalize)
      : state.skillActiveCharacterId != null
        ? [normalize(state.skillActiveCharacterId)]
        : [];
    const activeIds: string[] = Array.isArray(state.activePetIds)
      ? state.activePetIds.map(normalize)
      : [];
    const allIds = [...new Set([...skillIds, ...activeIds])];
    const lockStatus = allIds.length > 0 ? await getSkillLockStatus(userId, allIds) : {};
    res.json(lockStatus);
  } catch (error) {
    console.error("[PetState] skill-lock-status error", error);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
