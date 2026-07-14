import { pool } from "@workspace/db";
import { ensurePetStateTable } from "./pet-state-store";

// ── JST 今日の開始時刻（UTC）を返す ──
function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - jstOffset);
}

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
    const legacySingle = state?.skillActiveCharacterId;
    const rawSkillActiveIds: unknown[] = Array.isArray(state?.skillActiveCharacterIds)
      ? state.skillActiveCharacterIds
      : legacySingle != null ? [legacySingle] : [];
    const skillActiveCharacterIds = rawSkillActiveIds.map(normalizeId);
    // Ownership is authoritative. PET saves contain default stats for characters the
    // user does not own, so character-state presence must never unlock a skill.
    // A unique skill is only active for up to 3 characters explicitly set via the
    // "固有スキル発動" selector, independent of which training slots are occupied.
    return Boolean(ownership.rowCount) && skillActiveCharacterIds.includes(targetId) && level >= Math.max(1, minLevel);
  } catch (error) {
    console.error("[PetSkills] lookup failed", { userId, characterId, error });
    return false;
  }
}

// ── 無料ガチャの本日の状態 ──
// 通常/有償それぞれベース1回ずつ無料。拓也の固有スキル発動中は、
// 通常・有償どちらでも消費できる「共通追加無料3回」が別途付与される。
// 消費順序: 自分の種別のベース1回 → 共通追加分（両種別で共有・減算）。
export interface FreeGachaState {
  normalUsed: number;
  paidUsed: number;
  normalBaseRemaining: number;
  paidBaseRemaining: number;
  sharedBonus: number;
  sharedRemaining: number;
  normalRemaining: number;
  paidRemaining: number;
  canDrawNormal: boolean;
  canDrawPaid: boolean;
}

export async function getFreeGachaState(userId: string): Promise<FreeGachaState> {
  const hasTakuya = await hasActivePetSkill(userId, "takuya");
  const sharedBonus = hasTakuya ? 3 : 0;
  const todayStart = jstTodayStartUtc();
  const { rows } = await pool.query(
    `SELECT "gachaKind", COUNT(*)::int AS cnt FROM "gachaResults"
     WHERE "userId"=$1 AND "isFree"=true AND "createdAt">=$2 GROUP BY "gachaKind"`,
    [userId, todayStart.toISOString()],
  );
  let normalUsed = 0;
  let paidUsed = 0;
  for (const row of rows) {
    if (row.gachaKind === "normal") normalUsed = Number(row.cnt);
    else if (row.gachaKind === "paid") paidUsed = Number(row.cnt);
  }
  const normalBaseUsed = Math.min(normalUsed, 1);
  const paidBaseUsed = Math.min(paidUsed, 1);
  const sharedUsed = Math.max(0, normalUsed - 1) + Math.max(0, paidUsed - 1);
  const sharedRemaining = Math.max(0, sharedBonus - sharedUsed);
  const normalBaseRemaining = 1 - normalBaseUsed;
  const paidBaseRemaining = 1 - paidBaseUsed;
  return {
    normalUsed,
    paidUsed,
    normalBaseRemaining,
    paidBaseRemaining,
    sharedBonus,
    sharedRemaining,
    normalRemaining: normalBaseRemaining + sharedRemaining,
    paidRemaining: paidBaseRemaining + sharedRemaining,
    canDrawNormal: normalBaseRemaining > 0 || sharedRemaining > 0,
    canDrawPaid: paidBaseRemaining > 0 || sharedRemaining > 0,
  };
}

// ── 固有スキル発動キャラクターの「本日使用済み」ロック状態を返す ──
// 拓也: 本日いずれかの無料ガチャを消費済み / ニャルシアン: 本日のログインボーナスを受取済み
// レオン・INMUくん: 本日いずれかの購入枚数申請を送信済み
export async function getSkillLockStatus(userId: string, characterIds: string[]): Promise<Record<string, boolean>> {
  const todayStart = jstTodayStartUtc();
  const result: Record<string, boolean> = {};
  await Promise.all(characterIds.map(async (rawId) => {
    const id = String(rawId);
    const normalized = id.trim().toLowerCase().replace(/_/g, "-");
    try {
      if (normalized === "takuya") {
        const r = await pool.query(
          `SELECT 1 FROM "gachaResults" WHERE "userId"=$1 AND "isFree"=true AND "createdAt">=$2 LIMIT 1`,
          [userId, todayStart.toISOString()],
        );
        result[id] = (r.rowCount ?? 0) > 0;
      } else if (normalized === "nyarushian") {
        const r = await pool.query(`SELECT "lastLogin" FROM "loginStreaks" WHERE "userId"=$1`, [userId]);
        const lastLogin = r.rows[0]?.lastLogin ? new Date(r.rows[0].lastLogin) : null;
        // JST基準で「本日」を判定する（UTC日付境界だとJST 9:00までリセットされない不具合になるため）
        const jstOffset = 9 * 3600 * 1000;
        const today = new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
        result[id] = lastLogin ? new Date(lastLogin.getTime() + jstOffset).toISOString().slice(0, 10) === today : false;
      } else if (normalized === "leon" || normalized === "chinge") {
        const r = await pool.query(
          `SELECT 1 FROM "purchaseRequests" WHERE "userId"=$1 AND "createdAt">=$2 LIMIT 1`,
          [userId, todayStart.toISOString()],
        );
        result[id] = (r.rowCount ?? 0) > 0;
      } else if (normalized === "tdn") {
        const r = await pool.query(
          `SELECT 1 FROM "petGachaHistory"
           WHERE "userId"=$1 AND ("tdnRerollGrantedAt">=$2 OR "tdnRerollUsedAt">=$2)
           LIMIT 1`,
          [userId, todayStart.toISOString()],
        );
        result[id] = (r.rowCount ?? 0) > 0;
      } else if (normalized === "inmu-festival") {
        // イベント期間外はロックなし（イベント検知未実装のため常時 false）
        result[id] = false;
      } else {
        result[id] = false;
      }
    } catch (error) {
      console.error("[PetSkills] lock status lookup failed", { userId, characterId: id, error });
      result[id] = false;
    }
  }));
  return result;
}
