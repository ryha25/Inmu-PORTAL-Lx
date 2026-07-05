import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/session";
import { ensurePetStateTable, PET_CHARACTER_NAMES } from "../services/pet-state-store";
import { ensurePetCommerceTables } from "./pet-commerce";
import { getSkillLockStatus } from "../services/pet-skills";

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

router.get("/pet/state", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetStateTable();
    await ensurePetCommerceTables();
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
    const removedSkillIds = prevActiveSkillIds.filter(id => !nextActiveSkillIds.includes(id));
    if (removedSkillIds.length > 0) {
      const lockStatus = await getSkillLockStatus(req.userId!, removedSkillIds);
      if (removedSkillIds.some(id => lockStatus[id])) {
        res.status(409).json({ error: "本日その固有スキルの効果を使用済みのため外せません（毎日0:00にリセットされます）" });
        return;
      }
    }
    const slotResult = await pool.query(`SELECT COUNT(*)::int AS count FROM "petSlotUnlocks" WHERE "userId"=$1`, [req.userId!]);
    const maxSlots = Math.min(3, 1 + Number(slotResult.rows[0]?.count ?? 0));
    if (Array.isArray(state.activePetIds)) state.activePetIds = state.activePetIds.slice(0, maxSlots);

    // ── 消費アイテム（睡眠茶・プレミアムフード在庫）はミッション報酬付与や
    // ガチャの重複キャラ変換など、このクライアント以外の経路からもサーバー側で
    // 直接加算されうる。フルステートの単純上書きにしてしまうと、付与前の
    // 状態を保持したまま開きっぱなしのタブが定期autosave（60秒毎の
    // materialize等）で古い値を書き戻し、付与されたアイテムが消えてしまう
    // 不具合があった。そのため、この2項目のみ「クライアントが起こした差分」を
    // 現在のDB値に加算するマージ方式にする（baseline未送信の旧クライアントは
    // 従来通りの上書き挙動にフォールバック）。
    let mergedItems: { sleepTea: number; premiumInventory: number } | null = null;
    if (existingState && baseline && typeof baseline === "object") {
      const dbSleepTea = Number((existingState as Record<string, any>).items?.sleepTea ?? 0);
      const dbPremiumInventory = Number((existingState as Record<string, any>).premiumFood?.inventory ?? 0);
      const incomingSleepTea = Number((state as Record<string, any>).items?.sleepTea ?? 0);
      const incomingPremiumInventory = Number((state as Record<string, any>).premiumFood?.inventory ?? 0);
      const baselineSleepTea = Number.isFinite(Number(baseline.sleepTea)) ? Number(baseline.sleepTea) : incomingSleepTea;
      const baselinePremiumInventory = Number.isFinite(Number(baseline.premiumInventory)) ? Number(baseline.premiumInventory) : incomingPremiumInventory;

      const sleepTeaDelta = incomingSleepTea - baselineSleepTea;
      const premiumDelta = incomingPremiumInventory - baselinePremiumInventory;

      const mergedSleepTea = Math.max(0, dbSleepTea + sleepTeaDelta);
      const mergedPremiumInventory = Math.max(0, dbPremiumInventory + premiumDelta);
      mergedItems = { sleepTea: mergedSleepTea, premiumInventory: mergedPremiumInventory };

      state.items = { ...(state as Record<string, any>).items, sleepTea: mergedSleepTea };
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
