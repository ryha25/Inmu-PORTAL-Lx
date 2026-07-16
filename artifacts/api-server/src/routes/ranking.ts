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
let monthlyVolumeSnapshotTablesReady: Promise<void> | null = null;

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

function getJstDayStartUtc(now = new Date()): Date {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  return new Date(Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate(),
    -9,
    0,
    0,
    0,
  ));
}

function getJstDateLabel(utcDayStart: Date): string {
  const jstDate = new Date(utcDayStart.getTime() + JST_OFFSET_MS);
  return [
    jstDate.getUTCFullYear(),
    String(jstDate.getUTCMonth() + 1).padStart(2, "0"),
    String(jstDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function ensureMonthlyVolumeSnapshotTables(): Promise<void> {
  if (!monthlyVolumeSnapshotTablesReady) {
    monthlyVolumeSnapshotTablesReady = pool.query(`
      CREATE TABLE IF NOT EXISTS "monthlyVolumeDailySnapshots" (
        "seasonLabel" TEXT NOT NULL,
        "jstDate" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "displayName" TEXT NOT NULL DEFAULT '',
        "solWallet" TEXT,
        "buyUsd" NUMERIC NOT NULL DEFAULT 0,
        "sellUsd" NUMERIC NOT NULL DEFAULT 0,
        "totalUsd" NUMERIC NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY ("seasonLabel", "jstDate", "userId")
      )
    `)
      .then(() => pool.query(`
        CREATE TABLE IF NOT EXISTS "monthlyVolumeSnapshotRuns" (
          "jstDate" TEXT PRIMARY KEY,
          "seasonLabel" TEXT NOT NULL,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `))
      .then(() => undefined);
  }
  return monthlyVolumeSnapshotTablesReady;
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

async function snapshotMonthlyVolumeDay(args: {
  seasonLabel: string;
  jstDate: string;
  dayStart: Date;
  dayEnd: Date;
  fallbackPrice: number;
}): Promise<void> {
  const { seasonLabel, jstDate, dayStart, dayEnd, fallbackPrice } = args;
  const runExists = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM "monthlyVolumeSnapshotRuns" WHERE "jstDate" = $1) AS exists`,
    [jstDate],
  );
  if (runExists.rows[0]?.exists) return;

  const insertSql = (usdValueExpression: string) => `
    INSERT INTO "monthlyVolumeDailySnapshots"
      ("seasonLabel", "jstDate", "userId", "displayName", "solWallet", "buyUsd", "sellUsd", "totalUsd", "updatedAt")
    SELECT
      $1,
      $2,
      p."userId",
      p."displayName",
      p."solWallet",
      COALESCE(SUM(CASE WHEN th.type = 'buy' THEN ${usdValueExpression} ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN th.type = 'sell' THEN ${usdValueExpression} ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN ${usdValueExpression} ELSE 0 END), 0),
      NOW()
    FROM "tradeHistory" th
    INNER JOIN profile p ON p."userId" = th."userId"
    WHERE th.type IN ('buy', 'sell')
      AND th."tradedAt" >= $3
      AND th."tradedAt" < $4
      AND p."userId" <> $6
      AND position($7 in regexp_replace(coalesce(p."displayName", ''), '\\s+', '', 'g')) = 0
      AND position($7 in regexp_replace(coalesce(p."discordUsername", ''), '\\s+', '', 'g')) = 0
      AND position($7 in regexp_replace(coalesce(p."xId", ''), '\\s+', '', 'g')) = 0
    GROUP BY p."userId", p."displayName", p."solWallet"
    HAVING COALESCE(SUM(CASE WHEN th.type IN ('buy', 'sell') THEN ${usdValueExpression} ELSE 0 END), 0) > 0
    ON CONFLICT ("seasonLabel", "jstDate", "userId") DO UPDATE SET
      "displayName" = EXCLUDED."displayName",
      "solWallet" = EXCLUDED."solWallet",
      "buyUsd" = EXCLUDED."buyUsd",
      "sellUsd" = EXCLUDED."sellUsd",
      "totalUsd" = EXCLUDED."totalUsd",
      "updatedAt" = NOW()
  `;

  try {
    await pool.query(insertSql(`COALESCE(th."usdValue", th."tokenAmount" * $5::numeric)`), [
      seasonLabel,
      jstDate,
      dayStart,
      dayEnd,
      fallbackPrice,
      TEST_ACCOUNT_USER_ID,
      TEST_ACCOUNT_DISPLAY_NAME,
    ]);
  } catch (primaryError) {
    console.error("[Ranking/MonthlyVolume] daily stored USD fallback:", primaryError);
    await pool.query(insertSql(`th."tokenAmount" * $5::numeric`), [
      seasonLabel,
      jstDate,
      dayStart,
      dayEnd,
      fallbackPrice,
      TEST_ACCOUNT_USER_ID,
      TEST_ACCOUNT_DISPLAY_NAME,
    ]);
  }

  await pool.query(`
    INSERT INTO "monthlyVolumeSnapshotRuns" ("jstDate", "seasonLabel", "updatedAt")
    VALUES ($1, $2, NOW())
    ON CONFLICT ("jstDate") DO UPDATE SET
      "seasonLabel" = EXCLUDED."seasonLabel",
      "updatedAt" = NOW()
  `, [jstDate, seasonLabel]);
}

async function ensureMonthlyVolumeSnapshots(season: ReturnType<typeof getMonthlyVolumeSeason>, fallbackPrice: number) {
  await ensureMonthlyVolumeSnapshotTables();
  const currentJstDayStart = getJstDayStartUtc();
  const snapshotEnd = new Date(Math.min(currentJstDayStart.getTime(), season.end.getTime()));
  for (let dayStart = season.start; dayStart.getTime() < snapshotEnd.getTime(); dayStart = addUtcDays(dayStart, 1)) {
    await snapshotMonthlyVolumeDay({
      seasonLabel: season.label,
      jstDate: getJstDateLabel(dayStart),
      dayStart,
      dayEnd: addUtcDays(dayStart, 1),
      fallbackPrice,
    });
  }
}

type MonthlyVolumeDbRow = {
  userId: string;
  displayName: string;
  solWallet: string | null;
  buyUsd: string;
  sellUsd: string;
  totalUsd: string;
};

async function queryMonthlyVolumeFromTrades(
  season: ReturnType<typeof getMonthlyVolumeSeason>,
  fallbackPrice: number,
  limit: number | null,
): Promise<MonthlyVolumeDbRow[]> {
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
    const result = await pool.query<MonthlyVolumeDbRow>(
      buildMonthlyVolumeSql(`COALESCE(th."usdValue", th."tokenAmount" * $3::numeric)`),
      [season.start, season.end, fallbackPrice, TEST_ACCOUNT_USER_ID, TEST_ACCOUNT_DISPLAY_NAME],
    );
    return result.rows;
  } catch (primaryError) {
    console.error("[Ranking/MonthlyVolume] direct stored USD fallback:", primaryError);
    const result = await pool.query<MonthlyVolumeDbRow>(
      buildMonthlyVolumeSql(`th."tokenAmount" * $3::numeric`),
      [season.start, season.end, fallbackPrice, TEST_ACCOUNT_USER_ID, TEST_ACCOUNT_DISPLAY_NAME],
    );
    return result.rows;
  }
}

async function getMonthlyVolumeRanking(limit: number | null = 100) {
  const season = getMonthlyVolumeSeason();
  const currentInmuPrice = await fetchCurrentInmuUsdPrice();
  const fallbackPrice = currentInmuPrice > 0 ? currentInmuPrice : 1;

  try {
    await ensureMonthlyVolumeSnapshots(season, fallbackPrice);
  } catch (snapshotError) {
    console.error("[Ranking/MonthlyVolume] snapshot refresh fallback:", snapshotError);
  }

  let rows: MonthlyVolumeDbRow[] = [];

  try {
    const result = await pool.query<MonthlyVolumeDbRow>(`
      SELECT
        s."userId",
        MAX(s."displayName") AS "displayName",
        MAX(s."solWallet") AS "solWallet",
        COALESCE(SUM(s."buyUsd"), 0)::text AS "buyUsd",
        COALESCE(SUM(s."sellUsd"), 0)::text AS "sellUsd",
        COALESCE(SUM(s."totalUsd"), 0)::text AS "totalUsd"
      FROM "monthlyVolumeDailySnapshots" s
      WHERE s."seasonLabel" = $1
      GROUP BY s."userId"
      HAVING COALESCE(SUM(s."totalUsd"), 0) > 0
      ORDER BY COALESCE(SUM(s."totalUsd"), 0) DESC
      ${limit === null ? "" : `LIMIT ${limit}`}
    `, [season.label]);
    rows = result.rows;
  } catch (readError) {
    console.error("[Ranking/MonthlyVolume] snapshot read fallback:", readError);
  }

  try {
    const directRows = await queryMonthlyVolumeFromTrades(season, fallbackPrice, limit);
    if (rows.length === 0 || directRows.length > rows.length) {
      rows = directRows;
    }
  } catch (directError) {
    console.error("[Ranking/MonthlyVolume] direct read fallback:", directError);
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
    const result = await getMonthlyVolumeRanking(null);
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
