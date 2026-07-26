import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  missionsTable,
  missionCompletionsTable,
  missionParticipationsTable,
  profileTable,
  pointsTable,
  notificationsTable,
  loginStreaksTable,
  tradeHistoryTable,
} from "@workspace/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import {
  claimDaifugoReward,
  ensureDaifugoTestDistributionForUser,
  ensurePetStateTable,
  ensureShikoirukaDistributionForUser,
  ensureYajusenpaiTestDistributionForUser,
  getDaifugoRewardStatus,
} from "../services/pet-state-store";

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;

// ── 購入履歴の有効期間開始日（2026-05-01以降のみ対象）──
const HISTORY_CUTOFF = new Date("2026-05-01T00:00:00.000Z");
const RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
];

async function fetchInmuBalance(wallet: string): Promise<number> {
  const customRpc = process.env.SOLANA_RPC;
  const endpoints = customRpc ? [customRpc, ...RPC_ENDPOINTS] : RPC_ENDPOINTS;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "getTokenAccountsByOwner",
          params: [wallet, { mint: INMU_TOKEN_MINT }, { encoding: "jsonParsed" }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        result?: { value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> }
      };
      const accounts = data.result?.value ?? [];
      const totalRaw = accounts.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.amount), 0);
      return Math.max(0, totalRaw / Math.pow(10, INMU_DECIMALS));
    } catch { continue; }
  }
  throw new Error("RPC unavailable");
}

import { requireAuth, requireAdmin } from "../middlewares/session";
import { initializePetCharacterState } from "../services/pet-state-store";
import { hasActivePetSkill } from "../services/pet-skills";
import { getLifetimeEarnedPoints } from "../services/lifetime-points";
import { getDaifugoEventCount, getDaifugoMaxChallengeLevel } from "../services/daifugo-link";

const router = Router();

const TESTER_PET_MISSION_TITLE = "ログイン日数通算7日達成";
const TESTER_PET_CHARACTER_ID = "inmu-festival";
const PET_CHARACTER_NAMES: Record<string, string> = {
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

type MissionRewardItemType = "premium_food" | "sleep_tea" | "takuya_sunglasses" | "cat_headband";
const VALID_REWARD_ITEM_TYPES = new Set<MissionRewardItemType>(["premium_food", "sleep_tea", "takuya_sunglasses", "cat_headband"]);
const REWARD_ITEM_NAMES: Partial<Record<MissionRewardItemType, string>> = {
  premium_food: "高級ごはん",
  sleep_tea: "アイスティー（睡眠薬入り）",
};

type MissionExtraReward = {
  missionId: number;
  characterId: string | null;
  rewardItemType: MissionRewardItemType | null;
  rewardItemAmount: number;
};

let rewardTablesPromise: Promise<void> | null = null;
let testerMissionPromise: Promise<void> | null = null;

function ensureRewardTables(): Promise<void> {
  if (rewardTablesPromise) return rewardTablesPromise;
  rewardTablesPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "missionExtraRewards" (
        "missionId"    INTEGER PRIMARY KEY,
        "characterId"  TEXT
      )
    `);
    await pool.query(`ALTER TABLE "missionExtraRewards" ADD COLUMN IF NOT EXISTS "rewardItemType" TEXT`);
    await pool.query(`ALTER TABLE "missionExtraRewards" ADD COLUMN IF NOT EXISTS "rewardItemAmount" INTEGER NOT NULL DEFAULT 0`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "userPetCharacters" (
        id                SERIAL PRIMARY KEY,
        "userId"          TEXT NOT NULL,
        "characterId"     TEXT NOT NULL,
        "sourceMissionId" INTEGER,
        "acquiredAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "characterId")
      )
    `);
  })().catch(error => {
    rewardTablesPromise = null;
    throw error;
  });
  return rewardTablesPromise;
}

async function loadMissionExtraRewards(): Promise<Map<number, MissionExtraReward>> {
  await ensureRewardTables();
  const { rows } = await pool.query(
    `SELECT "missionId", "characterId", "rewardItemType", "rewardItemAmount" FROM "missionExtraRewards"`,
  );
  return new Map(rows.map(row => [Number(row.missionId), {
    missionId: Number(row.missionId),
    characterId: typeof row.characterId === "string" && row.characterId ? row.characterId : null,
    rewardItemType: VALID_REWARD_ITEM_TYPES.has(row.rewardItemType) ? row.rewardItemType as MissionRewardItemType : null,
    rewardItemAmount: Number(row.rewardItemAmount ?? 0),
  }]));
}

async function saveMissionExtraReward(missionId: number, characterId: string | null, rewardItemType?: MissionRewardItemType | null, rewardItemAmount?: number | null) {
  await ensureRewardTables();
  const safeCharacter = characterId?.trim() || null;
  const safeItemType = rewardItemType && VALID_REWARD_ITEM_TYPES.has(rewardItemType) ? rewardItemType : null;
  const safeItemAmount = safeItemType && rewardItemAmount != null ? Math.max(0, Math.floor(Number(rewardItemAmount)) || 0) : 0;
  await pool.query(
    `INSERT INTO "missionExtraRewards" ("missionId", "characterId", "rewardItemType", "rewardItemAmount")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("missionId") DO UPDATE
       SET "characterId" = EXCLUDED."characterId", "rewardItemType" = EXCLUDED."rewardItemType", "rewardItemAmount" = EXCLUDED."rewardItemAmount"`,
    [missionId, safeCharacter, safeItemType, safeItemAmount],
  );
}

function readMissionPetItemCount(items: unknown, camelKey: string, snakeKey: string): number {
  if (!items || typeof items !== "object" || Array.isArray(items)) return 0;
  const record = items as Record<string, unknown>;
  const count = Math.floor(Number(record[camelKey] ?? record[snakeKey] ?? 0));
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

async function grantMissionRewardItem(userId: string, itemType: MissionRewardItemType, amount: number) {
  if (amount <= 0) return;
  const client = await pool.connect();
  try {
    await ensurePetStateTable();
    await client.query("BEGIN");
    const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
    const now = Date.now();
    const state = result.rows[0]?.state && typeof result.rows[0].state === "object" && !Array.isArray(result.rows[0].state) ? result.rows[0].state : { version: 5 };
    if (itemType === "premium_food") {
      const premiumFood = state.premiumFood && typeof state.premiumFood === "object"
        ? state.premiumFood
        : { dailyDate: "", dailyUsed: 0, inventory: 0 };
      state.premiumFood = { ...premiumFood, inventory: Math.max(0, Number(premiumFood.inventory ?? 0)) + amount };
    } else {
      const items = state.items && typeof state.items === "object" ? state.items : { sleepTea: 0, takuyaSunglasses: 0, catHeadband: 0 };
      if (itemType === "sleep_tea") state.items = { ...items, sleepTea: readMissionPetItemCount(items, "sleepTea", "sleep_tea") + amount };
      if (itemType === "takuya_sunglasses") state.items = { ...items, takuyaSunglasses: readMissionPetItemCount(items, "takuyaSunglasses", "takuya_sunglasses") + amount };
      if (itemType === "cat_headband") state.items = { ...items, catHeadband: readMissionPetItemCount(items, "catHeadband", "cat_headband") + amount };
    }
    await client.query(`
      INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
      ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
    `, [userId, JSON.stringify(state), now]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function ensureTesterPetMission() {
  if (testerMissionPromise) return testerMissionPromise;
  testerMissionPromise = (async () => {
    await ensureRewardTables();
    const existingMissions = await db.select().from(missionsTable);
    let mission = existingMissions.find(row => row.title === TESTER_PET_MISSION_TITLE)
      ?? existingMissions.find(row =>
        row.type === "event"
        && row.conditionType === "login_total"
        && Number(row.conditionValue) === 7
        && /\?{2,}/.test(row.title)
      );

    if (mission && mission.title !== TESTER_PET_MISSION_TITLE) {
      [mission] = await db.update(missionsTable)
        .set({
          title: TESTER_PET_MISSION_TITLE,
          description: "通算ログイン日数7日達成で限定キャラクターを獲得できます。",
        })
        .where(eq(missionsTable.id, mission.id))
        .returning();
    }

    if (!mission) {
      [mission] = await db.insert(missionsTable).values({
        title: TESTER_PET_MISSION_TITLE,
        description: "通算ログイン日数7日達成で限定キャラクターを獲得",
        type: "event",
        points: 0,
        isActive: true,
        status: "active",
        conditionType: "login_total",
        conditionValue: "7",
        displayOrder: 0,
      }).returning();
    }
    if (!mission) throw new Error("Failed to create tester PET mission");

    await pool.query(
      `INSERT INTO "missionExtraRewards" ("missionId", "characterId")
       VALUES ($1, $2)
       ON CONFLICT ("missionId") DO NOTHING`,
      [mission.id, TESTER_PET_CHARACTER_ID],
    );
  })().catch(error => {
    testerMissionPromise = null;
    throw error;
  });
  return testerMissionPromise;
}

function withExtraReward<T extends { id: number }>(mission: T, rewards: Map<number, MissionExtraReward>) {
  const reward = rewards.get(mission.id);
  const rewardCharacterId = reward?.characterId ?? null;
  const rewardItemType = reward?.rewardItemType ?? null;
  const rewardItemAmount = reward?.rewardItemAmount ?? 0;
  const rawMission = mission as T & { title?: string; description?: string | null; type?: string };
  const fallbackTypeNames: Record<string, string> = {
    daily: "デイリー",
    weekly: "ウィークリー",
    achievement: "アチーブメント",
    event: "イベント",
  };
  const title = rawMission.title && !/\?{3,}/.test(rawMission.title)
    ? rawMission.title
    : `${fallbackTypeNames[rawMission.type ?? ""] ?? ""}ミッション #${mission.id}`;
  const description = rawMission.description && /\?{3,}/.test(rawMission.description)
    ? null
    : rawMission.description;
  return {
    ...mission,
    title,
    description,
    rewardCharacterId,
    rewardCharacterName: rewardCharacterId ? (PET_CHARACTER_NAMES[rewardCharacterId] ?? rewardCharacterId) : null,
    rewardItemType,
    rewardItemAmount,
    rewardItemName: rewardItemType ? REWARD_ITEM_NAMES[rewardItemType] : null,
  };
}

// JST 4:00 = UTC 19:00 prev day → shift +5h so JST4:00 becomes UTC midnight
function getAdjustedNow(): Date {
  return new Date(Date.now() + 5 * 3600 * 1000);
}

function getPeriod(type: string): string {
  if (type === "achievement" || type === "event") return "all-time";
  const adj = getAdjustedNow();
  if (type === "weekly") {
    const day = adj.getUTCDay();
    const diff = (day + 6) % 7;
    const mon = new Date(adj.getTime() - diff * 86400000);
    const year = mon.getUTCFullYear();
    const startOfYear = Date.UTC(year, 0, 1);
    const week = Math.ceil(((mon.getTime() - startOfYear) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  return adj.toISOString().slice(0, 10);
}

function normalizeMissionLinks(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(/\r?\n/)
      .map(link => link.trim())
      .filter(link => /^https?:\/\//i.test(link))
  )];
}

function serializeMissionLinks(value: string | null | undefined): string | null {
  const links = normalizeMissionLinks(value);
  return links.length > 0 ? links.join("\n") : null;
}

function getDailyMissionLink(missionId: number, value: string | null): string | null {
  const links = normalizeMissionLinks(value);
  if (links.length === 0) return null;

  // The same mission keeps the same link throughout the app's JST day (04:00 reset).
  const seed = `${getPeriod("daily")}:${missionId}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return links[(hash >>> 0) % links.length];
}

function getTodayStart(): Date {
  const adj = getAdjustedNow();
  const mid = new Date(adj);
  mid.setUTCHours(0, 0, 0, 0);
  return new Date(mid.getTime() - 5 * 3600 * 1000);
}

function getWeekStart(): Date {
  const adj = getAdjustedNow();
  const day = adj.getUTCDay();
  const diff = (day + 6) % 7;
  const mon = new Date(adj.getTime() - diff * 86400000);
  mon.setUTCHours(0, 0, 0, 0);
  return new Date(mon.getTime() - 5 * 3600 * 1000);
}

const VALID_MISSION_TYPES = new Set(["daily", "weekly", "achievement", "event"]);

router.get("/missions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    await ensureTesterPetMission();
    const now = new Date();
    const missions = await db.select().from(missionsTable).where(and(eq(missionsTable.isActive, true), eq(missionsTable.status, "active")));
    const active = missions.filter(m => !(m.endAt && m.endAt < now));
    const extraRewards = await loadMissionExtraRewards();

    const dailyPeriod  = getPeriod("daily");
    const weeklyPeriod = getPeriod("weekly");
    const todayStart   = getTodayStart();
    const weekStart    = getWeekStart();

    // Check if any mission needs real on-chain INMU balance
    const needsInmuBalance = active.some(m => m.conditionType === "inmu_balance");

    const [
      participations,
      legacyCompletions,
      profile,
      streakRow,
      loginCountRow,
      dailyBuyRow,
      weeklyBuyRow,
      totalBuyRow,
      weeklyDailyCountRow,
      totalClearsRow,
      dailyClearsRow,
      weeklyClearsRow,
      achievementClearsRow,
      weeklyLoginCountRow,
      weeklyDexVoteCountRow,
      lifetimeEarnedPoints,
      daifugoPlayDaily,
      daifugoPlayWeekly,
      daifugoPlayTotal,
      daifugoWinDaily,
      daifugoWinWeekly,
      daifugoWinTotal,
      daifugoChallengePlayDaily,
      daifugoChallengePlayWeekly,
      daifugoChallengePlayTotal,
      daifugoChallengeWinDaily,
      daifugoChallengeWinWeekly,
      daifugoChallengeWinTotal,
      daifugoChallengeMaxLv,
    ] = await Promise.all([
      db.select({ missionId: missionParticipationsTable.missionId, period: missionParticipationsTable.period, status: missionParticipationsTable.status })
        .from(missionParticipationsTable)
        .where(eq(missionParticipationsTable.userId, userId)),
      db.select({ missionId: missionCompletionsTable.missionId, period: missionCompletionsTable.period })
        .from(missionCompletionsTable)
        .where(eq(missionCompletionsTable.userId, userId)),
      db.select().from(profileTable).where(eq(profileTable.userId, userId)).then(r => r[0]),
      db.select().from(loginStreaksTable).where(eq(loginStreaksTable.userId, userId)).then(r => r[0]),
      db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
        .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "daily_login")))
        .then(r => r[0]),
      db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
        .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, todayStart)))
        .then(r => r[0]),
      db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
        .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, weekStart)))
        .then(r => r[0]),
      // 2026-05-01以降の総購入枚数（buy_total条件用）
      db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
        .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, HISTORY_CUTOFF)))
        .then(r => r[0]),
      // count daily missions rewarded this week
      db.select({ cnt: sql<number>`count(*)` })
        .from(missionParticipationsTable)
        .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "daily"), gte(missionParticipationsTable.rewardedAt, weekStart)))
        .then(r => r[0]),
      // total missions rewarded (all types)
      db.select({ cnt: sql<number>`count(*)` })
        .from(missionParticipationsTable)
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded")))
        .then(r => r[0]),
      // daily missions rewarded (all time)
      db.select({ cnt: sql<number>`count(*)` })
        .from(missionParticipationsTable)
        .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "daily")))
        .then(r => r[0]),
      // weekly missions rewarded (all time)
      db.select({ cnt: sql<number>`count(*)` })
        .from(missionParticipationsTable)
        .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "weekly")))
        .then(r => r[0]),
      // achievement missions rewarded (all time)
      db.select({ cnt: sql<number>`count(*)` })
        .from(missionParticipationsTable)
        .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "achievement")))
        .then(r => r[0]),
      // login days this week
      db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
        .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "daily_login"), gte(pointsTable.createdAt, weekStart)))
        .then(r => r[0]),
      // dex votes this week
      db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
        .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "dex_vote"), gte(pointsTable.createdAt, weekStart)))
        .then(r => r[0]),
      getLifetimeEarnedPoints(userId),
      getDaifugoEventCount(userId, "play", todayStart),
      getDaifugoEventCount(userId, "play", weekStart),
      getDaifugoEventCount(userId, "play"),
      getDaifugoEventCount(userId, "win", todayStart),
      getDaifugoEventCount(userId, "win", weekStart),
      getDaifugoEventCount(userId, "win"),
      getDaifugoEventCount(userId, "challenge_play", todayStart),
      getDaifugoEventCount(userId, "challenge_play", weekStart),
      getDaifugoEventCount(userId, "challenge_play"),
      getDaifugoEventCount(userId, "challenge_win", todayStart),
      getDaifugoEventCount(userId, "challenge_win", weekStart),
      getDaifugoEventCount(userId, "challenge_win"),
      getDaifugoMaxChallengeLevel(userId),
    ]);

    // Optionally fetch real on-chain INMU balance
    let realInmuBalance: number | null = null;
    if (needsInmuBalance && profile?.solWallet) {
      try {
        realInmuBalance = await fetchInmuBalance(profile.solWallet);
      } catch {
        realInmuBalance = Math.max(0, Number(profile?.totalBought ?? 0) - Number(profile?.totalSold ?? 0));
      }
    } else if (needsInmuBalance) {
      realInmuBalance = Math.max(0, Number(profile?.totalBought ?? 0) - Number(profile?.totalSold ?? 0));
    }

    const participationMap = new Map(participations.map(p => [`${p.missionId}:${p.period}`, p.status]));
    const legacySet = new Set(legacyCompletions.map(c => `${c.missionId}:${c.period}`));
    const rewardedMissionIds = new Set(participations.filter(p => p.status === "rewarded").map(p => p.missionId));

    // Build set of mission IDs that are predecessors in a chain
    // (some other active mission has prerequisiteMissionId pointing to them)
    const predecessorIds = new Set(
      active
        .filter(m => m.prerequisiteMissionId != null)
        .map(m => m.prerequisiteMissionId!)
    );

    function getStatus(missionId: number, period: string): string | null {
      const key = `${missionId}:${period}`;
      if (participationMap.has(key)) return participationMap.get(key)!;
      if (legacySet.has(key)) return "rewarded";
      return null;
    }

    function isLocked(mission: typeof missions[0]): boolean {
      if (mission.prerequisiteMissionId) {
        if (!rewardedMissionIds.has(mission.prerequisiteMissionId)) return true;
      }
      return false;
    }

    function getConditionStatus(condType: string | null, condVal: string | null, missionType: string) {
      if (!condType || condType === "none" || condType === "link_visit") {
        return { conditionMet: null as boolean | null, conditionCurrent: null as number | null };
      }

      // Binary conditions (no numeric value needed)
      if (condType === "follow_x") {
        const met = !!profile?.xId;
        return { conditionMet: met, conditionCurrent: met ? 1 : 0 };
      }
      if (condType === "join_discord") {
        const met = !!profile?.discordId;
        return { conditionMet: met, conditionCurrent: met ? 1 : 0 };
      }

      const target = condVal ? Number(condVal) : null;
      if (target === null) return { conditionMet: null as boolean | null, conditionCurrent: null as number | null };

      let current: number | null = null;
      if (condType === "inmu_balance") {
        current = realInmuBalance ?? Math.max(0, Number(profile?.totalBought ?? 0) - Number(profile?.totalSold ?? 0));
      } else if (condType === "login_streak") {
        current = streakRow?.streak ?? 0;
      } else if (condType === "login_total") {
        current = Number(loginCountRow?.cnt ?? 0);
      } else if (condType === "buy_daily") {
        current = Number(dailyBuyRow?.total ?? 0);
      } else if (condType === "buy_weekly") {
        current = Number(weeklyBuyRow?.total ?? 0);
      } else if (condType === "buy_total") {
        current = Number(totalBuyRow?.total ?? 0);
      } else if (condType === "daily_weekly_count") {
        current = Number(weeklyDailyCountRow?.cnt ?? 0);
      } else if (condType === "total_clears") {
        current = Number(totalClearsRow?.cnt ?? 0);
      } else if (condType === "daily_clears_today") {
        current = missions.filter(m =>
          m.type === "daily" &&
          participationMap.get(`${m.id}:${dailyPeriod}`) === "rewarded"
        ).length;
      } else if (condType === "daily_clears_total") {
        current = Number(dailyClearsRow?.cnt ?? 0);
      } else if (condType === "weekly_clears_total") {
        current = Number(weeklyClearsRow?.cnt ?? 0);
      } else if (condType === "achievement_clears_total") {
        current = Number(achievementClearsRow?.cnt ?? 0);
      } else if (condType === "monthly_points") {
        current = lifetimeEarnedPoints;
      } else if (condType === "login_weekly") {
        current = Number(weeklyLoginCountRow?.cnt ?? 0);
      } else if (condType === "dex_vote_weekly") {
        current = Number(weeklyDexVoteCountRow?.cnt ?? 0);
      } else if (condType === "weekly_clears_weekly") {
        current = missions.filter(m =>
          m.type === "weekly" &&
          participationMap.get(`${m.id}:${weeklyPeriod}`) === "rewarded"
        ).length;
      } else if (condType === "daifugo_play") {
        current = missionType === "daily" ? daifugoPlayDaily : missionType === "weekly" ? daifugoPlayWeekly : daifugoPlayTotal;
      } else if (condType === "daifugo_win") {
        current = missionType === "daily" ? daifugoWinDaily : missionType === "weekly" ? daifugoWinWeekly : daifugoWinTotal;
      } else if (condType === "daifugo_challenge_play") {
        current = missionType === "daily" ? daifugoChallengePlayDaily : missionType === "weekly" ? daifugoChallengePlayWeekly : daifugoChallengePlayTotal;
      } else if (condType === "daifugo_challenge_win") {
        current = missionType === "daily" ? daifugoChallengeWinDaily : missionType === "weekly" ? daifugoChallengeWinWeekly : daifugoChallengeWinTotal;
      } else if (condType === "daifugo_challenge_lv") {
        current = daifugoChallengeMaxLv;
      }

      if (current === null) return { conditionMet: null as boolean | null, conditionCurrent: null as number | null };
      return { conditionMet: current >= target, conditionCurrent: current };
    }

    function mapMission(m: typeof missions[0], period: string) {
      const locked = isLocked(m);
      return {
        ...withExtraReward(m, extraRewards),
        linkUrl: getDailyMissionLink(m.id, m.linkUrl),
        locked,
        prerequisiteMissionTitle: locked && m.prerequisiteMissionId
          ? (missions.find(mx => mx.id === m.prerequisiteMissionId)?.title ?? null)
          : null,
        participationStatus: locked ? null : getStatus(m.id, period),
        ...getConditionStatus(locked ? null : m.conditionType, locked ? null : m.conditionValue, m.type),
      };
    }

    // Sort by displayOrder ASC within each category
    const sortedActive = [...active].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

    const filterMissions = (list: ReturnType<typeof mapMission>[]) =>
      list.filter(m => {
        if (m.locked) return false;
        // Staged unlock: hide rewarded predecessors (next stage has appeared)
        if (m.participationStatus === "rewarded" && predecessorIds.has(m.id)) return false;
        return true;
      });

    const daily       = filterMissions(sortedActive.filter(m => m.type === "daily").map(m => mapMission(m, dailyPeriod)));
    const weekly      = filterMissions(sortedActive.filter(m => m.type === "weekly").map(m => mapMission(m, weeklyPeriod)));
    const achievement = filterMissions(sortedActive.filter(m => m.type === "achievement").map(m => mapMission(m, "all-time")));
    const event       = filterMissions(sortedActive.filter(m => m.type === "event").map(m => mapMission(m, "all-time")));

    res.set("Cache-Control", "no-store");
    res.json({ daily, weekly, achievement, event });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/missions/:id/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const mission = await db.select().from(missionsTable).where(eq(missionsTable.id, missionId)).then(r => r[0]);
    if (!mission || !mission.isActive) { res.status(404).json({ error: "ミッションが見つかりません" }); return; }

    const now = new Date();
    if (mission.endAt && mission.endAt < now) { res.status(400).json({ error: "このミッションは終了しています" }); return; }

    // Check mission-chain prerequisite (staged unlock)
    if (mission.prerequisiteMissionId) {
      const prereq = await db.select({ status: missionParticipationsTable.status })
        .from(missionParticipationsTable)
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, mission.prerequisiteMissionId), eq(missionParticipationsTable.status, "rewarded")))
        .then(r => r[0]);
      if (!prereq) {
        const prereqMission = await db.select({ title: missionsTable.title }).from(missionsTable).where(eq(missionsTable.id, mission.prerequisiteMissionId)).then(r => r[0]);
        res.status(400).json({ error: `「${prereqMission?.title ?? "前のステージ"}」を先に達成してください` });
        return;
      }
    }

    const period = getPeriod(mission.type);
    const existing = await db.select().from(missionParticipationsTable)
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, missionId), eq(missionParticipationsTable.period, period)))
      .then(r => r[0]);

    if (existing) {
      if ((mission.type === "achievement" || mission.type === "event") && existing.status === "rewarded") {
        res.status(409).json({ error: "already_completed", message: "このミッションは既に達成済みです" });
        return;
      }
      res.json({ ok: true, status: existing.status });
      return;
    }

    await db.insert(missionParticipationsTable).values({ userId, missionId, period, status: "joined" });

    // イベント参加時のみ participationCount をインクリメント
    if (mission.type === "event") {
      await db
        .update(profileTable)
        .set({ participationCount: sql`${profileTable.participationCount} + 1`, updatedAt: new Date() })
        .where(eq(profileTable.userId, userId));
    }

    res.json({ ok: true, status: "joined" });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

async function checkCondition(
  userId: string,
  mission: { type?: string | null; conditionType: string | null; conditionValue: string | null },
  profile: {
    solWallet?: string | null;
    totalBought?: string | null;
    totalSold?: string | null;
    monthlyPoints?: string | null;
    xId?: string | null;
    discordId?: string | null;
  } | null
): Promise<{ met: boolean; errorMsg?: string }> {
  const condType = mission.conditionType;
  const condVal = mission.conditionValue ? Number(mission.conditionValue) : null;

  if (!condType || condType === "none" || condType === "link_visit") {
    return { met: true };
  }

  // Binary (social) conditions
  if (condType === "follow_x") {
    if (!profile?.xId) return { met: false, errorMsg: "XアカウントをINMU Bankに連携してください（プロフィール設定から）" };
    return { met: true };
  }
  if (condType === "join_discord") {
    if (!profile?.discordId) return { met: false, errorMsg: "DiscordをINMU Bankに連携してください（プロフィール設定から）" };
    return { met: true };
  }

  if (condVal === null) return { met: true };

  const todayStart = getTodayStart();
  const weekStart  = getWeekStart();
  const daifugoSince = mission.type === "daily" ? todayStart : mission.type === "weekly" ? weekStart : undefined;

  if (condType === "inmu_balance") {
    if (!profile?.solWallet) return { met: false, errorMsg: "ウォレットアドレスが設定されていません" };
    try {
      const balance = await fetchInmuBalance(profile.solWallet);
      if (balance < condVal) return { met: false, errorMsg: `INMU保有枚数が不足しています（必要: ${condVal.toLocaleString()} INMU、現在: ${balance.toLocaleString()} INMU）` };
    } catch {
      return { met: false, errorMsg: "INMU残高の取得に失敗しました。しばらくしてから再試行してください。" };
    }
  } else if (condType === "login_streak") {
    const streak = await db.select().from(loginStreaksTable).where(eq(loginStreaksTable.userId, userId)).then(r => r[0]);
    const cur = streak?.streak ?? 0;
    if (cur < condVal) return { met: false, errorMsg: `連続ログイン日数が不足しています（必要: ${condVal}日、現在: ${cur}日）` };
  } else if (condType === "login_total") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
      .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "daily_login")));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `累計ログイン日数が不足しています（必要: ${condVal}日、現在: ${cur}日）` };
  } else if (condType === "buy_daily") {
    const [row] = await db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, todayStart)));
    const cur = Number(row?.total ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `本日の購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU）` };
  } else if (condType === "buy_weekly") {
    const [row] = await db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, weekStart)));
    const cur = Number(row?.total ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `今週の購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU）` };
  } else if (condType === "buy_total") {
    const [row] = await db.select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` }).from(tradeHistoryTable)
      .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, HISTORY_CUTOFF)));
    const cur = Number(row?.total ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU、現在: ${cur.toLocaleString()} INMU）` };
  } else if (condType === "daily_weekly_count") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "daily"), gte(missionParticipationsTable.rewardedAt, weekStart)));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `今週のデイリーミッションクリア数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "total_clears") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded")));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `累計ミッションクリア回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "daily_clears_today") {
    const todayPeriod = getPeriod("daily");
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "daily"), eq(missionParticipationsTable.period, todayPeriod)));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `本日のデイリークリア数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "daily_clears_total") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "daily")));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `デイリーミッションクリア累計が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "weekly_clears_total") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "weekly")));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `ウィークリーミッションクリア回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "achievement_clears_total") {
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "achievement")));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `アチーブメント達成数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "monthly_points") {
    const cur = await getLifetimeEarnedPoints(userId);
    if (cur < condVal) return { met: false, errorMsg: `累計ポイント保有数が不足しています（必要: ${condVal.toLocaleString()}pt、現在: ${cur.toLocaleString()}pt）` };
  } else if (condType === "login_weekly") {
    const ws = getWeekStart();
    const [row] = await db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
      .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "daily_login"), gte(pointsTable.createdAt, ws)));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `今週のログイン日数が不足しています（必要: ${condVal}日、現在: ${cur}日）` };
  } else if (condType === "dex_vote_weekly") {
    const ws = getWeekStart();
    const [row] = await db.select({ cnt: sql<number>`count(*)` }).from(pointsTable)
      .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "dex_vote"), gte(pointsTable.createdAt, ws)));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `今週のdexScanner投票数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  } else if (condType === "weekly_clears_weekly") {
    const wp = getPeriod("weekly");
    const [row] = await db.select({ cnt: sql<number>`count(*)` })
      .from(missionParticipationsTable)
      .innerJoin(missionsTable, eq(missionParticipationsTable.missionId, missionsTable.id))
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.status, "rewarded"), eq(missionsTable.type, "weekly"), eq(missionParticipationsTable.period, wp)));
    const cur = Number(row?.cnt ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `今週のウィークリーミッション達成数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  }

  if (condType === "daifugo_play") {
    const cur = await getDaifugoEventCount(userId, "play", daifugoSince);
    if (cur < condVal) return { met: false, errorMsg: `INMU大富豪のプレイ回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  }
  if (condType === "daifugo_win") {
    const cur = await getDaifugoEventCount(userId, "win", daifugoSince);
    if (cur < condVal) return { met: false, errorMsg: `INMU大富豪の勝利回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  }
  if (condType === "daifugo_challenge_play") {
    const cur = await getDaifugoEventCount(userId, "challenge_play", daifugoSince);
    if (cur < condVal) return { met: false, errorMsg: `チャレンジモードのプレイ回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  }
  if (condType === "daifugo_challenge_win") {
    const cur = await getDaifugoEventCount(userId, "challenge_win", daifugoSince);
    if (cur < condVal) return { met: false, errorMsg: `チャレンジモードの勝利回数が不足しています（必要: ${condVal}回、現在: ${cur}回）` };
  }
  if (condType === "daifugo_challenge_lv") {
    const cur = await getDaifugoMaxChallengeLevel(userId);
    if (cur < condVal) return { met: false, errorMsg: `チャレンジレベルが不足しています（必要: Lv${condVal}以上、現在: Lv${cur}）` };
  }

  return { met: true };
}

router.post("/missions/:id/achieve", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const mission = await db.select().from(missionsTable).where(eq(missionsTable.id, missionId)).then(r => r[0]);
    if (!mission || !mission.isActive) { res.status(404).json({ error: "ミッションが見つかりません" }); return; }

    const period = getPeriod(mission.type);
    const existing = await db.select().from(missionParticipationsTable)
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, missionId), eq(missionParticipationsTable.period, period)))
      .then(r => r[0]);

    if (!existing) { res.status(400).json({ error: "先に「参加する」を押してください" }); return; }
    if (existing.status === "rewarded") { res.status(409).json({ error: "already_completed" }); return; }
    if (existing.status === "achieved") { res.json({ ok: true, status: "achieved" }); return; }

    // Check mission-chain prerequisite
    if (mission.prerequisiteMissionId) {
      const prereq = await db.select({ status: missionParticipationsTable.status })
        .from(missionParticipationsTable)
        .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, mission.prerequisiteMissionId), eq(missionParticipationsTable.status, "rewarded")))
        .then(r => r[0]);
      if (!prereq) {
        res.status(400).json({ error: "前のステージが未達成です" });
        return;
      }
    }

    const profile = await db.select().from(profileTable).where(eq(profileTable.userId, userId)).then(r => r[0]);
    const result = await checkCondition(userId, mission, profile ?? null);
    if (!result.met) {
      res.status(400).json({ error: result.errorMsg ?? "条件を満たしていません" });
      return;
    }

    await db.update(missionParticipationsTable)
      .set({ status: "achieved", achievedAt: new Date() })
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, missionId), eq(missionParticipationsTable.period, period)));

    res.json({ ok: true, status: "achieved" });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/missions/:id/claim", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await ensureRewardTables();
    const mission = await db.select().from(missionsTable).where(eq(missionsTable.id, missionId)).then(r => r[0]);
    if (!mission || !mission.isActive) { res.status(404).json({ error: "ミッションが見つかりません" }); return; }
    const extraReward = (await loadMissionExtraRewards()).get(missionId);

    const now = new Date();
    const period = getPeriod(mission.type);
    const existing = await db.select().from(missionParticipationsTable)
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, missionId), eq(missionParticipationsTable.period, period)))
      .then(r => r[0]);

    if (!existing) { res.status(400).json({ error: "先に「参加する」を押してください" }); return; }
    if (existing.status === "rewarded") { res.status(409).json({ error: "already_completed", message: "このミッションは既に達成済みです" }); return; }
    if (existing.status === "joined") { res.status(400).json({ error: "先に達成条件を満たしてください" }); return; }

    // Double-check condition server-side before rewarding
    const profile = await db.select().from(profileTable).where(eq(profileTable.userId, userId)).then(r => r[0]);
    const result = await checkCondition(userId, mission, profile ?? null);
    if (!result.met) {
      res.status(400).json({ error: result.errorMsg ?? "条件を満たしていません" });
      return;
    }

    if (extraReward?.characterId) {
      const owned = await pool.query(
        `SELECT 1 FROM "userPetCharacters" WHERE "userId" = $1 AND "characterId" = $2 LIMIT 1`,
        [userId, extraReward.characterId],
      );
      if (owned.rows.length > 0) {
        res.status(409).json({
          error: "character_already_owned",
          message: "このキャラクターは既に所持しています",
        });
        return;
      }
    }

    const rewardedRows = await db.update(missionParticipationsTable)
      .set({ status: "rewarded", rewardedAt: now })
      .where(and(
        eq(missionParticipationsTable.userId, userId),
        eq(missionParticipationsTable.missionId, missionId),
        eq(missionParticipationsTable.period, period),
        eq(missionParticipationsTable.status, "achieved"),
      ))
      .returning({ missionId: missionParticipationsTable.missionId });
    if (rewardedRows.length === 0) {
      res.status(409).json({ error: "already_completed", message: "このミッションは既に達成済みです" });
      return;
    }

    await db.insert(missionCompletionsTable).values({ userId, missionId, period }).catch(() => {});

    // dexScanner投票ミッションなら週間投票カウントを記録
    if (mission.type === "daily") {
      const haystack = `${mission.title ?? ""} ${mission.description ?? ""}`.toLowerCase();
      if (haystack.includes("dex") || haystack.includes("投票")) {
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        await db.insert(pointsTable).values({ userId, amount: "0", type: "dex_vote", source: mission.title, month });
      }
    }

    const pointMultiplier = mission.points > 0 && await hasActivePetSkill(userId, "nyarushian") ? 2 : 1;
    const awardedPoints = mission.points * pointMultiplier;

    if (awardedPoints > 0) {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await db.insert(pointsTable).values({ userId, amount: String(awardedPoints), type: "mission", source: mission.title, month });
      await db.update(profileTable)
        .set({ monthlyPoints: sql`${profileTable.monthlyPoints} + ${awardedPoints}`, updatedAt: now })
        .where(eq(profileTable.userId, userId));
    }

    if (extraReward?.characterId) {
      const insertedCharacter = await pool.query(
        `INSERT INTO "userPetCharacters" ("userId", "characterId", "sourceMissionId")
         VALUES ($1, $2, $3)
         ON CONFLICT ("userId", "characterId") DO NOTHING
         RETURNING "characterId"`,
        [userId, extraReward.characterId, missionId],
      );
      if (insertedCharacter.rowCount) {
        await initializePetCharacterState(userId, extraReward.characterId).catch(error => {
          console.error("[Missions] initialize awarded PET state", error);
        });
      }
    }

    if (extraReward?.rewardItemType && extraReward.rewardItemAmount > 0) {
      await grantMissionRewardItem(userId, extraReward.rewardItemType, extraReward.rewardItemAmount).catch(error => {
        console.error("[Missions] grant reward item", error);
      });
    }

    const rewardParts: string[] = [];
    if (awardedPoints > 0) rewardParts.push(`${awardedPoints.toLocaleString()}ポイント${pointMultiplier > 1 ? "（幸運の肉球 ×2）" : ""}`);
    if (extraReward?.characterId) rewardParts.push(PET_CHARACTER_NAMES[extraReward.characterId] ?? extraReward.characterId);
    if (extraReward?.rewardItemType && extraReward.rewardItemAmount > 0) {
      rewardParts.push(`${REWARD_ITEM_NAMES[extraReward.rewardItemType]} ×${extraReward.rewardItemAmount}`);
    }

    await db.insert(notificationsTable).values({
      userId, type: "mission", title: "ミッション達成！",
      message: `「${mission.title}」を達成して${rewardParts.length > 0 ? ` ${rewardParts.join(" + ")}を獲得しました` : "報酬を受け取りました"}`,
    });

    res.json({
      ok: true,
      points: awardedPoints,
      pointMultiplier,
      characterId: extraReward?.characterId ?? null,
      characterName: extraReward?.characterId ? (PET_CHARACTER_NAMES[extraReward.characterId] ?? extraReward.characterId) : null,
      rewardItemType: extraReward?.rewardItemType ?? null,
      rewardItemAmount: extraReward?.rewardItemAmount ?? 0,
      rewardItemName: extraReward?.rewardItemType ? REWARD_ITEM_NAMES[extraReward.rewardItemType] : null,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/pet/characters", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensureRewardTables();
    const shikoirukaNewlyDistributed = await ensureShikoirukaDistributionForUser(req.userId!);
    await ensureDaifugoTestDistributionForUser(req.userId!);
    await ensureYajusenpaiTestDistributionForUser(req.userId!);
    const [ownership, daifugoReward] = await Promise.all([
      pool.query(
        `SELECT "characterId", "acquiredAt" FROM "userPetCharacters"
         WHERE "userId" = $1 ORDER BY "acquiredAt" ASC`,
        [req.userId!],
      ),
      getDaifugoRewardStatus(req.userId!),
    ]);
    res.json({
      userId: req.userId!,
      ownedCharacterIds: ownership.rows.map(row => String(row.characterId)),
      characters: Object.entries(PET_CHARACTER_NAMES).map(([id, name]) => ({ id, name })),
      shikoirukaNewlyDistributed,
      daifugoReward,
    });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/pet/characters/daifugo/claim", requireAuth, async (req, res): Promise<void> => {
  try {
    const result = await claimDaifugoReward(req.userId!);
    if (!result.ok) {
      res.status(403).json({
        error: "チャレンジモードLv.100クリア後に受け取れます",
        highestClearedLevel: result.highestClearedLevel,
      });
      return;
    }
    res.json({ ok: true, newlyClaimed: result.newlyClaimed, characterId: "daifugo" });
  } catch (error) {
    console.error("[Missions] claim daifugo PET", error);
    res.status(500).json({ error: "大富豪の受取に失敗しました" });
  }
});

router.get("/admin/missions", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensureTesterPetMission();
    const missions = await db.select().from(missionsTable)
      .orderBy(missionsTable.type, missionsTable.displayOrder, missionsTable.createdAt);
    const extraRewards = await loadMissionExtraRewards();
    res.json(missions.map(mission => withExtraReward(mission, extraRewards)));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/admin/missions/reorder", requireAdmin, async (req, res): Promise<void> => {
  const { orders } = req.body as { orders?: { id: number; displayOrder: number }[] };
  if (!Array.isArray(orders) || orders.length === 0) {
    res.status(400).json({ error: "orders array required" });
    return;
  }
  try {
    await Promise.all(
      orders.map(({ id, displayOrder }) =>
        db.update(missionsTable)
          .set({ displayOrder })
          .where(eq(missionsTable.id, id))
      )
    );
    res.json({ ok: true, updated: orders.length });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/missions", requireAdmin, async (req, res): Promise<void> => {
  const { title, description, type, points, rewardCharacterId, rewardItemType, rewardItemAmount, startAt, endAt, linkUrl, isActive, status, conditionType, conditionValue, prerequisiteMissionId, displayOrder } =
    req.body as { title?: string; description?: string; type?: string; points?: number; rewardCharacterId?: string | null; rewardItemType?: MissionRewardItemType | null; rewardItemAmount?: number | null; startAt?: string; endAt?: string; linkUrl?: string; isActive?: boolean; status?: string; conditionType?: string | null; conditionValue?: number | null; prerequisiteMissionId?: number | null; displayOrder?: number };
  if (!title?.trim() || !type) { res.status(400).json({ error: "title and type required" }); return; }
  const validType = VALID_MISSION_TYPES.has(type) ? type : "daily";
  const VALID_STATUSES = new Set(["active", "inactive", "draft"]);
  const missionStatus = status && VALID_STATUSES.has(status) ? status : "active";
  try {
    let autoOrder = displayOrder ?? 0;
    if (displayOrder === undefined) {
      const rows = await db.select({ maxOrder: sql<number>`coalesce(max("displayOrder"), -1)` })
        .from(missionsTable)
        .where(eq(missionsTable.type, validType));
      autoOrder = (rows[0]?.maxOrder ?? -1) + 1;
    }
    const [mission] = await db.insert(missionsTable).values({
      title: title.trim(),
      description: description?.trim() || null,
      type: validType,
      points: points ?? 0,
      startAt: startAt ? new Date(startAt) : null,
      endAt: endAt ? new Date(endAt) : null,
      linkUrl: serializeMissionLinks(linkUrl),
      isActive: missionStatus === "active",
      status: missionStatus,
      conditionType: conditionType || null,
      conditionValue: conditionValue != null ? String(conditionValue) : null,
      prerequisiteMissionId: prerequisiteMissionId ?? null,
      displayOrder: autoOrder,
    }).returning();
    await saveMissionExtraReward(mission.id, rewardCharacterId ?? null, rewardItemType ?? null, rewardItemAmount ?? null);
    const extraRewards = await loadMissionExtraRewards();
    res.status(201).json(withExtraReward(mission, extraRewards));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Create a staged unlock chain in one request
router.post("/admin/missions/chain", requireAdmin, async (req, res): Promise<void> => {
  const { type, conditionType, linkUrl, startAt, endAt, isActive, status, stages } =
    req.body as {
      type?: string;
      conditionType?: string | null;
      linkUrl?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      isActive?: boolean;
      status?: string;
      stages?: Array<{
        title?: string;
        description?: string;
        points?: number;
        conditionValue?: number | null;
        rewardItemType?: MissionRewardItemType | null;
        rewardItemAmount?: number | null;
      }>;
    };

  if (!Array.isArray(stages) || stages.length < 2) {
    res.status(400).json({ error: "stages must be an array of at least 2 items" });
    return;
  }
  if (stages.some(s => !s.title?.trim())) {
    res.status(400).json({ error: "All stages must have a title" });
    return;
  }

  const validType = type && VALID_MISSION_TYPES.has(type) ? type : "daily";
  const VALID_STATUSES_C = new Set(["active", "inactive", "draft"]);
  const chainStatus = status && VALID_STATUSES_C.has(status) ? status : "active";

  try {
    const rows = await db.select({ maxOrder: sql<number>`coalesce(max("displayOrder"), -1)` })
      .from(missionsTable)
      .where(eq(missionsTable.type, validType));
    let nextOrder = (rows[0]?.maxOrder ?? -1) + 1;

    const created: typeof missionsTable.$inferSelect[] = [];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const prereqId = i === 0 ? null : created[i - 1].id;
      const [mission] = await db.insert(missionsTable).values({
        title: stage.title!.trim(),
        description: stage.description?.trim() || null,
        type: validType,
        points: stage.points ?? 0,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        linkUrl: serializeMissionLinks(linkUrl),
        isActive: chainStatus === "active",
        status: chainStatus,
        conditionType: conditionType || null,
        conditionValue: stage.conditionValue != null ? String(stage.conditionValue) : null,
        prerequisiteMissionId: prereqId,
        displayOrder: nextOrder++,
      }).returning();
      await saveMissionExtraReward(
        mission.id,
        null,
        stage.rewardItemType ?? null,
        stage.rewardItemAmount ?? null,
      );
      created.push(mission);
    }

    res.status(201).json({ ok: true, count: created.length, missions: created });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Update all missions in a chain at once (must be before /:id to avoid route conflict)
router.put("/admin/missions/chain-update", requireAdmin, async (req, res): Promise<void> => {
  const { rootId, type, conditionType, linkUrl, startAt, endAt, status, stages } =
    req.body as {
      rootId?: number;
      type?: string;
      conditionType?: string | null;
      linkUrl?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      status?: string;
      stages?: Array<{
        id?: number;              // 0 or missing = 新規ステージ
        title?: string;
        description?: string;
        points?: number;
        conditionValue?: number | null;
        stageStatus?: string;     // ステージ個別ステータス（省略時は status を適用）
      }>;
    };
  if (!Array.isArray(stages) || stages.length === 0) {
    res.status(400).json({ error: "stages array required" }); return;
  }
  if (stages.some(s => !s.title?.trim())) {
    res.status(400).json({ error: "All stages must have a title" }); return;
  }
  const VALID_S = new Set(["active", "inactive", "draft"]);
  const chainStatus = status && VALID_S.has(status) ? status : "active";
  const validType   = type && VALID_MISSION_TYPES.has(type) ? type : undefined;
  const condTypeVal = conditionType === "none" ? null : conditionType;

  try {
    // ステージを順番通りに処理し prerequisiteMissionId を再リンク
    const processedIds: number[] = [];
    const existingExtraRewards = await loadMissionExtraRewards();

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const prevId       = i === 0 ? null : processedIds[i - 1];
      const stageStatus  = s.stageStatus && VALID_S.has(s.stageStatus) ? s.stageStatus : chainStatus;

      if (s.id && s.id > 0) {
        // 既存ステージを更新
        await db.update(missionsTable).set({
          ...(s.title       !== undefined && { title:          s.title!.trim() }),
          ...(s.description !== undefined && { description:    s.description?.trim() || null }),
          ...(s.points      !== undefined && { points:         s.points }),
          ...(s.conditionValue !== undefined && { conditionValue: s.conditionValue != null ? String(s.conditionValue) : null }),
          ...(validType   && { type: validType }),
          ...(condTypeVal !== undefined && { conditionType: condTypeVal || null }),
          ...(linkUrl     !== undefined && { linkUrl: serializeMissionLinks(linkUrl) }),
          ...(startAt     !== undefined && { startAt: startAt ? new Date(startAt) : null }),
          ...(endAt       !== undefined && { endAt:   endAt   ? new Date(endAt)   : null }),
          status:    stageStatus,
          isActive:  stageStatus === "active",
          prerequisiteMissionId: prevId,
        }).where(eq(missionsTable.id, s.id));
        const stageReward = s as typeof s & {
          rewardItemType?: MissionRewardItemType | null;
          rewardItemAmount?: number | null;
        };
        if (stageReward.rewardItemType !== undefined || stageReward.rewardItemAmount !== undefined) {
          const existingReward = existingExtraRewards.get(s.id);
          await saveMissionExtraReward(
            s.id,
            existingReward?.characterId ?? null,
            stageReward.rewardItemType !== undefined ? stageReward.rewardItemType : existingReward?.rewardItemType ?? null,
            stageReward.rewardItemAmount !== undefined ? stageReward.rewardItemAmount : existingReward?.rewardItemAmount ?? null,
          );
        }
        processedIds.push(s.id);
      } else {
        // 新規ステージを作成（後から追加された段階）
        const [newM] = await db.insert(missionsTable).values({
          title:         s.title!.trim(),
          description:   s.description?.trim() || null,
          points:        s.points ?? 0,
          conditionValue: s.conditionValue != null ? String(s.conditionValue) : null,
          type:          validType ?? "achievement",
          conditionType: condTypeVal || null,
          linkUrl:       serializeMissionLinks(linkUrl),
          startAt:       startAt ? new Date(startAt) : null,
          endAt:         endAt   ? new Date(endAt)   : null,
          status:        stageStatus,
          isActive:      stageStatus === "active",
          prerequisiteMissionId: prevId,
          displayOrder:  0,
        }).returning({ id: missionsTable.id });
        const stageReward = s as typeof s & {
          rewardItemType?: MissionRewardItemType | null;
          rewardItemAmount?: number | null;
        };
        await saveMissionExtraReward(
          newM.id,
          null,
          stageReward.rewardItemType ?? null,
          stageReward.rewardItemAmount ?? null,
        );
        processedIds.push(newM.id);
      }
    }

    res.json({ ok: true, rootId, stageIds: processedIds });
  } catch (e) {
    console.error("[ChainUpdate]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, description, type, points, rewardCharacterId, rewardItemType, rewardItemAmount, startAt, endAt, linkUrl, isActive, status, conditionType, conditionValue, prerequisiteMissionId, displayOrder } =
    req.body as { title?: string; description?: string; type?: string; points?: number; rewardCharacterId?: string | null; rewardItemType?: MissionRewardItemType | null; rewardItemAmount?: number | null; startAt?: string | null; endAt?: string | null; linkUrl?: string | null; isActive?: boolean; status?: string; conditionType?: string | null; conditionValue?: number | null; prerequisiteMissionId?: number | null; displayOrder?: number };
  const VALID_STATUSES_P = new Set(["active", "inactive", "draft"]);
  const missionStatus = status && VALID_STATUSES_P.has(status) ? status : undefined;
  try {
    await db.update(missionsTable).set({
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(type !== undefined && { type: VALID_MISSION_TYPES.has(type) ? type : "daily" }),
      ...(points !== undefined && { points }),
      ...(startAt !== undefined && { startAt: startAt ? new Date(startAt) : null }),
      ...(endAt !== undefined && { endAt: endAt ? new Date(endAt) : null }),
      ...(linkUrl !== undefined && { linkUrl: serializeMissionLinks(linkUrl) }),
      ...(missionStatus !== undefined
        ? { status: missionStatus, isActive: missionStatus === "active" }
        : isActive !== undefined ? { isActive } : {}),
      ...(conditionType !== undefined && { conditionType: conditionType || null }),
      ...(conditionValue !== undefined && { conditionValue: conditionValue != null ? String(conditionValue) : null }),
      ...(prerequisiteMissionId !== undefined && { prerequisiteMissionId: prerequisiteMissionId ?? null }),
      ...(displayOrder !== undefined && { displayOrder }),
    }).where(eq(missionsTable.id, id));
    if (rewardCharacterId !== undefined || rewardItemType !== undefined || rewardItemAmount !== undefined) {
      const existingReward = (await loadMissionExtraRewards()).get(id);
      await saveMissionExtraReward(
        id,
        rewardCharacterId !== undefined ? rewardCharacterId : existingReward?.characterId ?? null,
        rewardItemType !== undefined ? rewardItemType : existingReward?.rewardItemType ?? null,
        rewardItemAmount !== undefined ? rewardItemAmount : existingReward?.rewardItemAmount ?? null,
      );
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/admin/missions/:id/restore", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.update(missionsTable).set({ isActive: true, status: "active" }).where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.update(missionsTable).set({ isActive: false, status: "inactive" }).where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/admin/missions/:id/permanent", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(missionsTable).where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
