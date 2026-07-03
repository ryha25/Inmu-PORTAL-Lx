import { pool } from "@workspace/db";
import { ensurePetStateTable } from "./pet-state-store";

export async function hasActivePetSkill(userId: string, characterId: string, minLevel = 1): Promise<boolean> {
  try {
    await ensurePetStateTable();
    const [ownership, saved] = await Promise.all([
      pool.query(`SELECT 1 FROM "userPetCharacters" WHERE "userId"=$1 AND "characterId"=$2 LIMIT 1`, [userId, characterId]),
      pool.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 LIMIT 1`, [userId]),
    ]);
    if (!ownership.rowCount) return false;
    const state = saved.rows[0]?.state ?? {};
    const level = Number(state?.pets?.[characterId]?.level ?? 1);
    const enabled = state?.skillState?.[characterId] !== false;
    return enabled && level >= minLevel;
  } catch (error) {
    console.error("[PetSkills] lookup failed", { userId, characterId, error });
    return false;
  }
}
