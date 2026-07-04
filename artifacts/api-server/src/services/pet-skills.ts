import { pool } from "@workspace/db";
import { ensurePetStateTable } from "./pet-state-store";

export async function hasActivePetSkill(userId: string, characterId: string, minLevel = 1): Promise<boolean> {
  try {
    await ensurePetStateTable();
    const [ownership, saved] = await Promise.all([
      pool.query(`SELECT 1 FROM "userPetCharacters" WHERE "userId"=$1 AND "characterId"=$2 LIMIT 1`, [userId, characterId]),
      pool.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 LIMIT 1`, [userId]),
    ]);
    const state = saved.rows[0]?.state ?? {};
    const normalizeId = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
    const targetId = normalizeId(characterId);
    const statePetId = Object.keys(state?.pets ?? {}).find(id => normalizeId(id) === targetId) ?? characterId;
    const level = Number(state?.pets?.[statePetId]?.level ?? 1);
    const skillActiveCharacterId = normalizeId(state?.skillActiveCharacterId ?? "");
    // Ownership is authoritative. PET saves contain default stats for characters the
    // user does not own, so character-state presence must never unlock a skill.
    // A unique skill is only active for the single character explicitly set via the
    // "固有スキル発動" selector, independent of which training slots are occupied.
    return Boolean(ownership.rowCount) && skillActiveCharacterId === targetId && level >= Math.max(1, minLevel);
  } catch (error) {
    console.error("[PetSkills] lookup failed", { userId, characterId, error });
    return false;
  }
}
