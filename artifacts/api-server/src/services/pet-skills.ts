import { pool } from "@workspace/db";
import { ensurePetStateTable, isPetFeatureTestAccount } from "./pet-state-store";

const TDN_REROLL_DAILY_LIMIT = 3;
const DAILY_SKILL_USE_TABLE = `"petDailySkillUses"`;

function normalizePetSkillId(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/_/g, "-").replace(/^character-/, "");
  const aliases: Record<string, string> = {
    "チンゲ": "chinge",
    "ｔｄｎ": "tdn",
    "ティーディーエヌ": "tdn",
    "ホイップ": "whip",
    "拓也": "takuya",
    "レオン": "leon",
    "nyarushian": "nyarushian",
    "ニャルシアン": "nyarushian",
    "inmuくん": "inmu-festival",
    "inmu君": "inmu-festival",
  };
  return aliases[normalized] ?? aliases[String(value ?? "").trim()] ?? normalized;
}

// ── JST 今日の開始時刻（UTC）を返す ──
function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - jstOffset);
}

function jstTodayKey(): string {
  const jstOffset = 9 * 3600 * 1000;
  return new Date(Date.now() + jstOffset).toISOString().slice(0, 10);
}

async function ensureDailySkillUseTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${DAILY_SKILL_USE_TABLE} (
      "userId" TEXT NOT NULL,
      "characterId" TEXT NOT NULL,
      "usedDate" TEXT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY ("userId", "characterId", "usedDate")
    )
  `);
}

export async function recordDailyPetSkillUse(userId: string, characterId: string): Promise<void> {
  const normalized = normalizePetSkillId(characterId);
  await ensureDailySkillUseTable();
  await pool.query(
    `INSERT INTO ${DAILY_SKILL_USE_TABLE} ("userId", "characterId", "usedDate")
     VALUES ($1, $2, $3)
     ON CONFLICT ("userId", "characterId", "usedDate") DO NOTHING`,
    [userId, normalized, jstTodayKey()],
  );
}

export async function hasActivePetSkill(userId: string, characterId: string, minLevel = 1): Promise<boolean> {
  try {
    await ensurePetStateTable();
    const [ownership, saved] = await Promise.all([
      pool.query(`SELECT "characterId" FROM "userPetCharacters" WHERE "userId"=$1`, [userId]),
      pool.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 LIMIT 1`, [userId]),
    ]);
    const state = saved.rows[0]?.state ?? {};
    const targetId = normalizePetSkillId(characterId);
    const statePetId = Object.keys(state?.pets ?? {}).find(id => normalizePetSkillId(id) === targetId) ?? characterId;
    const level = Number(state?.pets?.[statePetId]?.level ?? 1);
    const legacySingle = state?.skillActiveCharacterId;
    const rawSkillActiveIds: unknown[] = Array.isArray(state?.skillActiveCharacterIds)
      ? state.skillActiveCharacterIds
      : legacySingle != null ? [legacySingle] : [];
    const ownedCharacterIds = ownership.rows.map(row => normalizePetSkillId(row.characterId));
    const skillActiveCharacterIds = rawSkillActiveIds.slice(0, 3).map(normalizePetSkillId);
    // Ownership is authoritative. PET saves contain default stats for characters the
    // user does not own, so character-state presence must never unlock a skill.
    // A unique skill is only active for up to 3 characters explicitly set via the
    // "固有スキル発動" selector, independent of which training slots are occupied.
    return ownedCharacterIds.includes(targetId) && skillActiveCharacterIds.includes(targetId) && level >= Math.max(1, minLevel);
  } catch (error) {
    console.error("[PetSkills] lookup failed", { userId, characterId, error });
    return false;
  }
}

function isJstDay10(): boolean {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCDate() === 10;
}

async function canUseYajusenpaiPreviewSkill(userId: string): Promise<boolean> {
  return isJstDay10() || await isPetFeatureTestAccount(userId);
}

async function hasAnyActivePetSkill(userId: string, characterIds: readonly string[]): Promise<boolean> {
  const results = await Promise.all(characterIds.map(characterId => hasActivePetSkill(userId, characterId)));
  return results.some(Boolean);
}

export async function hasYajusenpaiRewardMultiplier(userId: string): Promise<boolean> {
  if (!await canUseYajusenpaiPreviewSkill(userId)) return false;
  return hasAnyActivePetSkill(userId, ["yajusenpai-male-base", "yajusenpai-male-evolved"]);
}

export async function hasYajusenpaiGachaDiscount(userId: string): Promise<boolean> {
  if (!await canUseYajusenpaiPreviewSkill(userId)) return false;
  return hasAnyActivePetSkill(userId, ["yajusenpai-female-base", "yajusenpai-female-evolved"]);
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
          `SELECT COUNT(*)::int AS count FROM "petGachaHistory"
           WHERE "userId"=$1 AND "tdnRerollGrantedAt">=$2`,
          [userId, todayStart.toISOString()],
        );
        result[id] = Number(r.rows[0]?.count ?? 0) >= TDN_REROLL_DAILY_LIMIT;
      } else if (normalized === "shikoiruka" || normalized === "daifugo") {
        await ensureDailySkillUseTable();
        const r = await pool.query(
          `SELECT 1 FROM ${DAILY_SKILL_USE_TABLE}
           WHERE "userId"=$1 AND "characterId"=$2 AND "usedDate"=$3
           LIMIT 1`,
          [userId, normalized, jstTodayKey()],
        );
        result[id] = (r.rowCount ?? 0) > 0;
      } else if (normalized === "inmu-festival") {
        // イベント固有スキルが購入申請に実際に適用された日だけロックする。
        const r = await pool.query(
          `SELECT 1 FROM "purchaseRequests"
           WHERE "userId"=$1
             AND "createdAt">=$2
             AND "requestPetRebateDetails" LIKE '%"source":"skill"%'
             AND "requestPetRebateDetails" LIKE '%"eventOnly":true%'
           LIMIT 1`,
          [userId, todayStart.toISOString()],
        );
        result[id] = (r.rowCount ?? 0) > 0;
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
