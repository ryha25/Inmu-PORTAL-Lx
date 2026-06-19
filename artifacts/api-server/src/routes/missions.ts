import { Router } from "express";
import { db } from "@workspace/db";
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

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;
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

const router = Router();

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
    const now = new Date();
    const missions = await db.select().from(missionsTable).where(eq(missionsTable.isActive, true));
    const active = missions.filter(m => !(m.endAt && m.endAt < now));

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
      weeklyDailyCountRow,
      totalClearsRow,
      dailyClearsRow,
      weeklyClearsRow,
      achievementClearsRow,
      weeklyLoginCountRow,
      weeklyDexVoteCountRow,
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

    function getConditionStatus(condType: string | null, condVal: string | null) {
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
        current = Number(profile?.totalBought ?? 0);
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
        current = Number(profile?.monthlyPoints ?? 0);
      } else if (condType === "login_weekly") {
        current = Number(weeklyLoginCountRow?.cnt ?? 0);
      } else if (condType === "dex_vote_weekly") {
        current = Number(weeklyDexVoteCountRow?.cnt ?? 0);
      } else if (condType === "weekly_clears_weekly") {
        current = missions.filter(m =>
          m.type === "weekly" &&
          participationMap.get(`${m.id}:${weeklyPeriod}`) === "rewarded"
        ).length;
      }

      if (current === null) return { conditionMet: null as boolean | null, conditionCurrent: null as number | null };
      return { conditionMet: current >= target, conditionCurrent: current };
    }

    function mapMission(m: typeof missions[0], period: string) {
      const locked = isLocked(m);
      return {
        ...m,
        locked,
        prerequisiteMissionTitle: locked && m.prerequisiteMissionId
          ? (missions.find(mx => mx.id === m.prerequisiteMissionId)?.title ?? null)
          : null,
        participationStatus: locked ? null : getStatus(m.id, period),
        ...getConditionStatus(locked ? null : m.conditionType, locked ? null : m.conditionValue),
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
    res.json({ ok: true, status: "joined" });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

async function checkCondition(
  userId: string,
  mission: { conditionType: string | null; conditionValue: string | null },
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
    const cur = Number(profile?.totalBought ?? 0);
    if (cur < condVal) return { met: false, errorMsg: `累計購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU、現在: ${cur.toLocaleString()} INMU）` };
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
    const cur = Number(profile?.monthlyPoints ?? 0);
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
    const mission = await db.select().from(missionsTable).where(eq(missionsTable.id, missionId)).then(r => r[0]);
    if (!mission || !mission.isActive) { res.status(404).json({ error: "ミッションが見つかりません" }); return; }

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

    await db.update(missionParticipationsTable)
      .set({ status: "rewarded", rewardedAt: now })
      .where(and(eq(missionParticipationsTable.userId, userId), eq(missionParticipationsTable.missionId, missionId), eq(missionParticipationsTable.period, period)));

    await db.insert(missionCompletionsTable).values({ userId, missionId, period }).catch(() => {});

    // dexScanner投票ミッションなら週間投票カウントを記録
    if (mission.type === "daily") {
      const haystack = `${mission.title ?? ""} ${mission.description ?? ""}`.toLowerCase();
      if (haystack.includes("dex") || haystack.includes("投票")) {
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        await db.insert(pointsTable).values({ userId, amount: "0", type: "dex_vote", source: mission.title, month });
      }
    }

    if (mission.points > 0) {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await db.insert(pointsTable).values({ userId, amount: String(mission.points), type: "mission", source: mission.title, month });
      await db.update(profileTable)
        .set({ monthlyPoints: sql`${profileTable.monthlyPoints} + ${mission.points}`, updatedAt: now })
        .where(eq(profileTable.userId, userId));
    }

    await db.insert(notificationsTable).values({
      userId, type: "mission", title: "ミッション達成！",
      message: `「${mission.title}」を達成して ${mission.points} ポイントを獲得しました`,
    });

    res.json({ ok: true, points: mission.points });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/missions", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const missions = await db.select().from(missionsTable)
      .orderBy(missionsTable.type, missionsTable.displayOrder, missionsTable.createdAt);
    res.json(missions);
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
  const { title, description, type, points, startAt, endAt, linkUrl, isActive, conditionType, conditionValue, prerequisiteMissionId, displayOrder } =
    req.body as { title?: string; description?: string; type?: string; points?: number; startAt?: string; endAt?: string; linkUrl?: string; isActive?: boolean; conditionType?: string | null; conditionValue?: number | null; prerequisiteMissionId?: number | null; displayOrder?: number };
  if (!title?.trim() || !type) { res.status(400).json({ error: "title and type required" }); return; }
  const validType = VALID_MISSION_TYPES.has(type) ? type : "daily";
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
      linkUrl: linkUrl?.trim() || null,
      isActive: isActive !== false,
      conditionType: conditionType || null,
      conditionValue: conditionValue != null ? String(conditionValue) : null,
      prerequisiteMissionId: prerequisiteMissionId ?? null,
      displayOrder: autoOrder,
    }).returning();
    res.status(201).json(mission);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// Create a staged unlock chain in one request
router.post("/admin/missions/chain", requireAdmin, async (req, res): Promise<void> => {
  const { type, conditionType, linkUrl, startAt, endAt, isActive, stages } =
    req.body as {
      type?: string;
      conditionType?: string | null;
      linkUrl?: string | null;
      startAt?: string | null;
      endAt?: string | null;
      isActive?: boolean;
      stages?: Array<{
        title?: string;
        description?: string;
        points?: number;
        conditionValue?: number | null;
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

  try {
    // Get base displayOrder
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
        linkUrl: linkUrl?.trim() || null,
        isActive: isActive !== false,
        conditionType: conditionType || null,
        conditionValue: stage.conditionValue != null ? String(stage.conditionValue) : null,
        prerequisiteMissionId: prereqId,
        displayOrder: nextOrder++,
      }).returning();
      created.push(mission);
    }

    res.status(201).json({ ok: true, count: created.length, missions: created });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, description, type, points, startAt, endAt, linkUrl, isActive, conditionType, conditionValue, prerequisiteMissionId, displayOrder } =
    req.body as { title?: string; description?: string; type?: string; points?: number; startAt?: string | null; endAt?: string | null; linkUrl?: string | null; isActive?: boolean; conditionType?: string | null; conditionValue?: number | null; prerequisiteMissionId?: number | null; displayOrder?: number };
  try {
    await db.update(missionsTable).set({
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(type !== undefined && { type: VALID_MISSION_TYPES.has(type) ? type : "daily" }),
      ...(points !== undefined && { points }),
      ...(startAt !== undefined && { startAt: startAt ? new Date(startAt) : null }),
      ...(endAt !== undefined && { endAt: endAt ? new Date(endAt) : null }),
      ...(linkUrl !== undefined && { linkUrl: linkUrl?.trim() || null }),
      ...(isActive !== undefined && { isActive }),
      ...(conditionType !== undefined && { conditionType: conditionType || null }),
      ...(conditionValue !== undefined && { conditionValue: conditionValue != null ? String(conditionValue) : null }),
      ...(prerequisiteMissionId !== undefined && { prerequisiteMissionId: prerequisiteMissionId ?? null }),
      ...(displayOrder !== undefined && { displayOrder }),
    }).where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.update(missionsTable).set({ isActive: false }).where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
