import { pool } from "@workspace/db";
import { ensurePetStateTable } from "./pet-state-store";

let skillTablePromise: Promise<void> | null = null;

function ensurePetSkillTable() {
  if (skillTablePromise) return skillTablePromise;
  skillTablePromise = pool.query(`
    CREATE TABLE IF NOT EXISTS "userPetSkillActivations" (
      id SERIAL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "characterId" TEXT NOT NULL,
      "slotIndex" INTEGER NOT NULL CHECK ("slotIndex" BETWEEN 1 AND 3),
      "activatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("userId", "characterId"),
      UNIQUE ("userId", "slotIndex")
    )
  `).then(() => undefined).catch(error => {
    skillTablePromise = null;
    throw error;
  });
  return skillTablePromise;
}

export async function hasActivePetSkill(userId: string, characterId: string, minLevel = 1): Promise<boolean> {
  try {
    await ensurePetStateTable();
    await ensurePetSkillTable();
    const [ownership, saved] = await Promise.all([
      pool.query(`SELECT 1 FROM "userPetCharacters" WHERE "userId"=$1 AND "characterId"=$2 LIMIT 1`, [userId, characterId]),
      pool.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 LIMIT 1`, [userId]),
    ]);
    if (!ownership.rowCount) return false;
    const state = saved.rows[0]?.state ?? {};
    const level = Number(state?.pets?.[characterId]?.level ?? 1);
    const enabled = state?.skillState?.[characterId] !== false;
    const activePetIds = Array.isArray(state?.activePetIds) ? state.activePetIds.map(String) : [];
    if (!enabled || !activePetIds.includes(characterId) || level < minLevel) return false;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`pet-skill:${userId}`]);
      const existing = await client.query(
        `SELECT "slotIndex" FROM "userPetSkillActivations" WHERE "userId"=$1 AND "characterId"=$2 LIMIT 1`,
        [userId, characterId],
      );
      if (existing.rowCount) {
        await client.query("COMMIT");
        return true;
      }
      const used = await client.query(
        `SELECT "slotIndex" FROM "userPetSkillActivations" WHERE "userId"=$1 ORDER BY "slotIndex" FOR UPDATE`,
        [userId],
      );
      if (used.rowCount >= 3) {
        await client.query("COMMIT");
        return false;
      }
      const occupied = new Set(used.rows.map(row => Number(row.slotIndex)));
      const slotIndex = [1, 2, 3].find(slot => !occupied.has(slot))!;
      await client.query(
        `INSERT INTO "userPetSkillActivations" ("userId","characterId","slotIndex") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [userId, characterId, slotIndex],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[PetSkills] lookup failed", { userId, characterId, error });
    return false;
  }
}
