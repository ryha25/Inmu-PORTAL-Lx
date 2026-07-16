import { Router } from "express";
import { db, pool } from "@workspace/db";
import { profileTable, transactionsTable, missionParticipationsTable, pointsTable } from "@workspace/db/schema";
import { sql, eq, gt, and } from "drizzle-orm";
import { requireAdmin, requireAuthOrAdmin } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const TEST_ACCOUNT_USER_ID = "user-1782061206251-cna0t3gps28";
const TEST_ACCOUNT_DISPLAY_NAME = "\u30ac\u30c1\u30e3\u30c6\u30b9\u30c8";
const excludeTestAccount = sql`
  ${profileTable.userId} <> ${TEST_ACCOUNT_USER_ID}
  and position(${TEST_ACCOUNT_DISPLAY_NAME} in regexp_replace(coalesce(${profileTable.displayName}, ''), '\\s+', '', 'g')) = 0
  and position(${TEST_ACCOUNT_DISPLAY_NAME} in regexp_replace(coalesce(${profileTable.discordUsername}, ''), '\\s+', '', 'g')) = 0
  and position(${TEST_ACCOUNT_DISPLAY_NAME} in regexp_replace(coalesce(${profileTable.xId}, ''), '\\s+', '', 'g')) = 0
`;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MONTHLY_VOLUME_FORMULA = "報酬計算式：取引高（USD）÷150×10%";
let rankingPriceCache: { usdPrice: number; cachedAt: number } | null = null;

function jstSeasonBoundaryUtc(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 15, 15, 0, 0, 0));
}

function getMonthlyVolumeSeason(now = new Date()) {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jstNow.getUTCFullYear();
  const monthIndex = jstNow.getUTCMonth();
  const day = jstNow.getUTCDate();
  const start = day >= 16
    ? jstSeasonBoundaryUtc(year, monthIndex)
    : jstSeasonBoundaryUtc(year, monthIndex - 1);
  const endJst = new Date(start.getTime() + JST_OFFSET_MS);
  const end = jstSeasonBoundaryUtc(endJst.getUTCFullYear(), endJst.getUTCMonth() + 1);
  return {
    start,
    end,
    label: `${endJst.getUTCFullYear()}/${String(endJst.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}

async function fetchCurrentInmuUsdPrice(): Promise<number> {
  const now = Date.now();
  if (rankingPriceCache && now - rankingPriceCache.cachedAt < 5 * 60 * 1000) {
    return rankingPriceCache.usdPrice;
  }
  let usdPrice = 0;
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${INMU_TOKEN_MINT}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json() as Record<string, { usdPrice?: number }>;
      usdPrice = typeof data?.[INMU_TOKEN_MINT]?.usdPrice === "number" ? data[INMU_TOKEN_MINT].usdPrice! : 0;
    }
  } catch {
    usdPrice = 0;
  }
  rankingPriceCache = { usdPrice, cachedAt: now };
  return usdPrice;
}

async function getMonthlyVolumeRanking(limit: number | null = 100) {
  const season = getMonthlyVolumeSeason();
  const currentInmuPrice = await fetchCurrentInmuUsdPrice();
  const fallbackPrice = currentInmuPrice > 0 ? currentInmuPrice : 1;

  let rows: Array<{
    userId: string;
    displayName: string;
    solWallet: string | null;
    buyUsd: string;
    sellUsd: string;
    totalUsd: string;
  }> = [];

  const buildMonthlyVolumeSql = (usdValueExpression: string) => `
      SELECT
        p."userId",
        p."displayName",
        p."solWallet",
        COALESCE(SUM(CASE WHEN th.type = 'buy' THEN ${usdValueExpression} ELSE 0 END), 0)::text AS "buyUsd",
        COALESCE(SUM(CASE WHEN th.type = 'sell' THEN ${usdValueExpression} ELSE 0 END), 0)::text AS "sellUsd",
        COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN ${usdValueExpression} ELSE 0 END), 0)::text AS "totalUsd"
      FROM "tradeHistory" th
      INNER JOIN profile p ON p."userId" = th."userId"
      WHERE th.type IN ('buy', 'sell')
        AND th."tradedAt" >= $1
        AND th."tradedAt" < $2
        AND p."userId" <> $4
        AND position($5 in regexp_replace(coalesce(p."displayName", ''), '\\s+', '', 'g')) = 0
        AND position($5 in regexp_replace(coalesce(p."discordUsername", ''), '\\s+', '', 'g')) = 0
        AND position($5 in regexp_replace(coalesce(p."xId", ''), '\\s+', '', 'g')) = 0
      GROUP BY p."userId", p."displayName", p."solWallet"
      HAVING COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN ${usdValueExpression} ELSE 0 END), 0) > 0
      ORDER BY COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN ${usdValueExpression} ELSE 0 END), 0) DESC
      ${limit === null ? "" : `LIMIT ${limit}`}
    `;

  try {
    const result = await pool.query<typeof rows[number]>(
      buildMonthlyVolumeSql(`COALESCE(th."usdValue", th."tokenAmount" * $3::numeric)`),
      [season.start, season.end, fallbackPrice, TEST_ACCOUNT_USER_ID, TEST_ACCOUNT_DISPLAY_NAME],
    );
    rows = result.rows;
  } catch (primaryError) {
    console.error("[Ranking/MonthlyVolume] stored USD fallback:", primaryError);
    try {
      const result = await pool.query<typeof rows[number]>(
        buildMonthlyVolumeSql(`th."tokenAmount" * $3::numeric`),
        [season.start, season.end, fallbackPrice, TEST_ACCOUNT_USER_ID, TEST_ACCOUNT_DISPLAY_NAME],
      );
      rows = result.rows;
    } catch (fallbackError) {
      console.error("[Ranking/MonthlyVolume] token amount fallback:", fallbackError);
    }
  }

  if (rows.length === 0) {
    try {
      const result = await pool.query<typeof rows[number]>(`
        SELECT
          p."userId",
          p."displayName",
          p."solWallet",
          COALESCE(SUM(CASE WHEN th.type = 'buy' THEN th."tokenAmount" ELSE 0 END), 0)::text AS "buyUsd",
          COALESCE(SUM(CASE WHEN th.type = 'sell' THEN th."tokenAmount" ELSE 0 END), 0)::text AS "sellUsd",
          COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN th."tokenAmount" ELSE 0 END), 0)::text AS "totalUsd"
        FROM "tradeHistory" th
        INNER JOIN profile p ON p."userId" = th."userId"
        WHERE th.type IN ('buy', 'sell')
          AND p."userId" <> $1
          AND position($2 in regexp_replace(coalesce(p."displayName", ''), '\\s+', '', 'g')) = 0
          AND position($2 in regexp_replace(coalesce(p."discordUsername", ''), '\\s+', '', 'g')) = 0
          AND position($2 in regexp_replace(coalesce(p."xId", ''), '\\s+', '', 'g')) = 0
        GROUP BY p."userId", p."displayName", p."solWallet"
        HAVING COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN th."tokenAmount" ELSE 0 END), 0) > 0
        ORDER BY COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN th."tokenAmount" ELSE 0 END), 0) DESC
        ${limit === null ? "" : `LIMIT ${limit}`}
      `, [TEST_ACCOUNT_USER_ID, TEST_ACCOUNT_DISPLAY_NAME]);
      rows = result.rows;
    } catch (allTimeError) {
      console.error("[Ranking/MonthlyVolume] all-time fallback:", allTimeError);
    }
  }

  const ranking = rows.map((row, index) => {
    const buyUsd = Number(row.buyUsd);
    const sellUsd = Number(row.sellUsd);
    const totalUsd = Number(row.totalUsd);
    const estimatedDevFeeUsd = totalUsd / 150;
    const airdropUsd = estimatedDevFeeUsd * 0.1;
    const estimatedInmuAmount = currentInmuPrice > 0 ? airdropUsd / currentInmuPrice : 0;
    return {
      rank: index + 1,
      userId: row.userId,
      displayName: row.displayName,
      solWallet: row.solWallet,
      buyUsd,
      sellUsd,
      totalVolumeUsd: totalUsd,
      estimatedDevFeeUsd,
      airdropUsd,
      estimatedInmuAmount,
    };
  });

  return {
    season: {
      label: season.label,
      start: season.start.toISOString(),
      end: season.end.toISOString(),
      resetRule: "毎月16日0:00 JST",
    },
    formula: MONTHLY_VOLUME_FORMULA,
    currentInmuUsdPrice: currentInmuPrice,
    ranking,
  };
}

// オンチェーンINMU残高をウォレットアドレスから取得（タイムアウト付き）
async function fetchOnChainInmuBalance(wallet: string): Promise<number | null> {
  const rpcUrl = process.env.SOLANA_RPC ?? "https://api.mainnet-beta.solana.com";
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTokenAccountsByOwner",
        params: [wallet, { mint: INMU_TOKEN_MINT }, { encoding: "jsonParsed" }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      result?: {
        value?: Array<{
          account?: {
            data?: {
              parsed?: {
                info?: { tokenAmount?: { uiAmount?: number } }
              }
            }
          }
        }>
      }
    };
    const accounts = data.result?.value ?? [];
    let total = 0;
    for (const a of accounts) {
      total += a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}

// ── INMU保有ランキング（オンチェーン実残高ベース）──
router.get("/ranking", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const profiles = await db
      .select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        balance: profileTable.balance,
        solWallet: profileTable.solWallet,
        showBalance: profileTable.showBalance,
        participationCount: profileTable.participationCount,
      })
      .from(profileTable)
      .where(excludeTestAccount)
      .limit(200);

    const receivedRows = await db
      .select({
        userId: transactionsTable.userId,
        total: sql<string>`coalesce(sum(cast(${transactionsTable.amount} as numeric)), '0')`,
      })
      .from(transactionsTable)
      .where(sql`${transactionsTable.type} in ('airdrop', 'reward', 'mission_reward')`)
      .groupBy(transactionsTable.userId);

    const receivedMap = new Map(receivedRows.map((r) => [r.userId, Math.max(0, Number(r.total))]));

    // ウォレットが設定されているユーザーのオンチェーン残高を並列取得
    const onChainResults = await Promise.allSettled(
      profiles.map((p) =>
        p.solWallet ? fetchOnChainInmuBalance(p.solWallet) : Promise.resolve(null)
      )
    );

    const entries = profiles.map((p, i) => {
      const onChain = onChainResults[i].status === "fulfilled" ? onChainResults[i].value : null;
      // オンチェーン取得成功 → 実残高。失敗/ウォレット未設定 → profile.balance にフォールバック
      const balance = Math.max(0, onChain ?? Number(p.balance));
      return {
        userId: p.userId,
        displayName: p.displayName,
        balance,
        showBalance: p.showBalance,
        totalReceived: receivedMap.get(p.userId) ?? 0,
        participations: p.participationCount,
      };
    });

    entries.sort((a, b) => b.balance - a.balance);
    const top100 = entries.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));

    res.set("Cache-Control", "no-store");
    res.json(top100);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── ポイントランキング（累計獲得ポイント） ──
router.get("/ranking/points", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    // points テーブルから累計獲得ポイントを集計し、プロフィールと結合してランキングを生成する
    const cumulativeRows = await db
      .select({
        userId: pointsTable.userId,
        displayName: profileTable.displayName,
        participations: profileTable.participationCount,
        totalEarned: sql<string>`coalesce(sum(cast(${pointsTable.amount} as numeric)), '0')`,
      })
      .from(pointsTable)
      .innerJoin(profileTable, eq(pointsTable.userId, profileTable.userId))
      .where(and(
        gt(sql`cast(${pointsTable.amount} as numeric)`, sql`0`),
        excludeTestAccount,
      ))
      .groupBy(pointsTable.userId, profileTable.displayName, profileTable.participationCount)
      .orderBy(sql`sum(cast(${pointsTable.amount} as numeric)) DESC`)
      .limit(100);

    res.set("Cache-Control", "no-store");
    res.json(
      cumulativeRows.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        displayName: p.displayName,
        points: Math.max(0, Number(p.totalEarned)),
        participations: p.participations,
      })),
    );
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 総合評価ランキング ──
// スコア = INMU保有量(40%) + ポイント保有量(40%) + ミッションクリア数(20%)
router.get("/ranking/composite", requireAuthOrAdmin, async (req, res): Promise<void> => {
  const currentUserId = req.userId;
  try {
    const [allProfiles, clearRows] = await Promise.all([
      db.select({
        userId: profileTable.userId,
        displayName: profileTable.displayName,
        balance: profileTable.balance,
        solWallet: profileTable.solWallet,
        monthlyPoints: profileTable.monthlyPoints,
        participationCount: profileTable.participationCount,
      }).from(profileTable).where(excludeTestAccount).limit(500),
      db.select({
        userId: missionParticipationsTable.userId,
        count: sql<string>`count(*)`,
      })
        .from(missionParticipationsTable)
        .where(eq(missionParticipationsTable.status, "rewarded"))
        .groupBy(missionParticipationsTable.userId),
    ]);

    if (allProfiles.length === 0) {
      res.json({ ranking: [], myRank: null, myEntry: null, totalUsers: 0 });
      return;
    }

    // ウォレット設定ユーザーのオンチェーン残高を並列取得
    const onChainResults = await Promise.allSettled(
      allProfiles.map((p) =>
        p.solWallet ? fetchOnChainInmuBalance(p.solWallet) : Promise.resolve(null)
      )
    );

    const clearMap = new Map(clearRows.map((c) => [c.userId, Number(c.count)]));

    const inmuValues  = allProfiles.map((p, i) => {
      const onChain = onChainResults[i].status === "fulfilled" ? onChainResults[i].value : null;
      return Math.max(0, onChain ?? Number(p.balance));
    });
    const pointValues = allProfiles.map((p) => Math.max(0, Number(p.monthlyPoints)));
    const clearValues = allProfiles.map((p) => clearMap.get(p.userId) ?? 0);

    const maxInmu   = Math.max(...inmuValues,  1);
    const maxPoints = Math.max(...pointValues, 1);
    const maxClears = Math.max(...clearValues, 1);

    const entries = allProfiles.map((p, i) => {
      const inmu = inmuValues[i];
      const pts  = pointValues[i];
      const cls  = clearValues[i];
      const score = (inmu / maxInmu)   * 40
                  + (pts  / maxPoints) * 40
                  + (cls  / maxClears) * 20;
      return {
        userId: p.userId,
        displayName: p.displayName,
        balance: inmu,
        points: pts,
        clears: cls,
        score: Math.round(score * 10) / 10,
      };
    });

    entries.sort((a, b) => b.score - a.score || b.balance - a.balance || b.points - a.points);

    const totalUsers = entries.length;
    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

    let myRank: number | null = null;
    let myEntry = null;
    if (currentUserId) {
      const found = ranked.find((r) => r.userId === currentUserId);
      if (found) {
        myRank = found.rank;
        myEntry = found;
      } else {
        myRank = totalUsers > 0 ? totalUsers : 1;
      }
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ranking: ranked.slice(0, 100),
      myRank,
      myEntry,
      totalUsers,
    });
  } catch (e) {
    console.error("[Ranking/Composite]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/ranking/monthly-volume", requireAuthOrAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await getMonthlyVolumeRanking(100);
    res.set("Cache-Control", "no-store");
    res.json({
      ...result,
      ranking: result.ranking.map(({ solWallet: _solWallet, ...row }) => row),
    });
  } catch (e) {
    console.error("[Ranking/MonthlyVolume]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/ranking/monthly-volume", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const result = await getMonthlyVolumeRanking(null);
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    console.error("[Admin/Ranking/MonthlyVolume]", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
