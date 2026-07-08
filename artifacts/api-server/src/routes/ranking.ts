import { Router } from "express";
import { db } from "@workspace/db";
import { profileTable, transactionsTable, missionParticipationsTable, pointsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { requireAuthOrAdmin } from "../middlewares/session";

const router = Router();

const INMU_TOKEN_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";

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
      }).from(profileTable).limit(500),
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

export default router;
