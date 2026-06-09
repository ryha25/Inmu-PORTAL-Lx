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

async function fetchInmuBalanceForMission(wallet: string): Promise<number> {
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
      const data = await res.json() as { result?: { value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string } } } } } }> } };
      const accounts = data.result?.value ?? [];
      const totalRaw = accounts.reduce((sum, acct) => sum + Number(acct.account.data.parsed.info.tokenAmount.amount), 0);
      return totalRaw / Math.pow(10, INMU_DECIMALS);
    } catch { continue; }
  }
  throw new Error("RPC unavailable");
}
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

function getPeriod(type: string): string {
  const now = new Date();
  if (type === "weekly") {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const startOfYear = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return now.toISOString().slice(0, 10);
}

router.get("/missions", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const now = new Date();
    const missions = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.isActive, true));

    const active = missions.filter((m) => {
      if (m.endAt && m.endAt < now) return false;
      return true;
    });

    const dailyPeriod = getPeriod("daily");
    const weeklyPeriod = getPeriod("weekly");

    const participations = await db
      .select({
        missionId: missionParticipationsTable.missionId,
        period: missionParticipationsTable.period,
        status: missionParticipationsTable.status,
      })
      .from(missionParticipationsTable)
      .where(eq(missionParticipationsTable.userId, userId));

    const legacyCompletions = await db
      .select({
        missionId: missionCompletionsTable.missionId,
        period: missionCompletionsTable.period,
      })
      .from(missionCompletionsTable)
      .where(eq(missionCompletionsTable.userId, userId));

    const participationMap = new Map(
      participations.map((p) => [`${p.missionId}:${p.period}`, p.status]),
    );

    const legacySet = new Set(
      legacyCompletions.map((c) => `${c.missionId}:${c.period}`),
    );

    function getStatus(missionId: number, period: string): string | null {
      const key = `${missionId}:${period}`;
      if (participationMap.has(key)) return participationMap.get(key)!;
      if (legacySet.has(key)) return "rewarded";
      return null;
    }

    const daily = active
      .filter((m) => m.type === "daily")
      .map((m) => ({ ...m, participationStatus: getStatus(m.id, dailyPeriod) }));

    const weekly = active
      .filter((m) => m.type === "weekly")
      .map((m) => ({ ...m, participationStatus: getStatus(m.id, weeklyPeriod) }));

    res.json({ daily, weekly });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/missions/:id/join", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const mission = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.id, missionId))
      .then((r) => r[0]);

    if (!mission || !mission.isActive) {
      res.status(404).json({ error: "ミッションが見つかりません" });
      return;
    }

    const now = new Date();
    if (mission.endAt && mission.endAt < now) {
      res.status(400).json({ error: "このミッションは終了しています" });
      return;
    }

    const period = getPeriod(mission.type);

    const existing = await db
      .select()
      .from(missionParticipationsTable)
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      )
      .then((r) => r[0]);

    if (existing) {
      res.json({ ok: true, status: existing.status });
      return;
    }

    await db.insert(missionParticipationsTable).values({
      userId,
      missionId,
      period,
      status: "joined",
    });

    res.json({ ok: true, status: "joined" });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/missions/:id/achieve", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const mission = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.id, missionId))
      .then((r) => r[0]);

    if (!mission || !mission.isActive) {
      res.status(404).json({ error: "ミッションが見つかりません" });
      return;
    }

    const period = getPeriod(mission.type);

    const existing = await db
      .select()
      .from(missionParticipationsTable)
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      )
      .then((r) => r[0]);

    if (!existing) {
      res.status(400).json({ error: "先に「参加する」を押してください" });
      return;
    }

    if (existing.status === "rewarded") {
      res.status(409).json({ error: "already_completed" });
      return;
    }

    if (existing.status === "achieved") {
      res.json({ ok: true, status: "achieved" });
      return;
    }

    // ── 条件チェック ──
    const condType = mission.conditionType;
    const condVal = mission.conditionValue ? Number(mission.conditionValue) : null;

    if (condType && condType !== "none" && condType !== "link_visit" && condVal !== null) {
      const profile = await db
        .select()
        .from(profileTable)
        .where(eq(profileTable.userId, userId))
        .then((r) => r[0]);

      if (condType === "inmu_balance") {
        if (!profile?.solWallet) {
          res.status(400).json({ error: "ウォレットアドレスが設定されていません" });
          return;
        }
        try {
          const balance = await fetchInmuBalanceForMission(profile.solWallet);
          if (balance < condVal) {
            res.status(400).json({ error: `INMU保有枚数が不足しています（必要: ${condVal.toLocaleString()} INMU、現在: ${balance.toLocaleString()} INMU）` });
            return;
          }
        } catch {
          res.status(500).json({ error: "INMU残高の取得に失敗しました。しばらくしてから再試行してください。" });
          return;
        }
      } else if (condType === "login_streak") {
        const streak = await db
          .select()
          .from(loginStreaksTable)
          .where(eq(loginStreaksTable.userId, userId))
          .then((r) => r[0]);
        if ((streak?.streak ?? 0) < condVal) {
          res.status(400).json({ error: `連続ログイン日数が不足しています（必要: ${condVal}日、現在: ${streak?.streak ?? 0}日）` });
          return;
        }
      } else if (condType === "login_total") {
        const [row] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(pointsTable)
          .where(and(eq(pointsTable.userId, userId), eq(pointsTable.type, "daily_login")));
        const loginCount = Number(row?.cnt ?? 0);
        if (loginCount < condVal) {
          res.status(400).json({ error: `累計ログイン日数が不足しています（必要: ${condVal}日、現在: ${loginCount}日）` });
          return;
        }
      } else if (condType === "buy_daily") {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const [row] = await db
          .select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` })
          .from(tradeHistoryTable)
          .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, todayStart)));
        if (Number(row?.total ?? 0) < condVal) {
          res.status(400).json({ error: `本日の購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU）` });
          return;
        }
      } else if (condType === "buy_weekly") {
        const weekStart = new Date();
        weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
        weekStart.setUTCHours(0, 0, 0, 0);
        const [row] = await db
          .select({ total: sql<string>`coalesce(sum("tokenAmount"), '0')` })
          .from(tradeHistoryTable)
          .where(and(eq(tradeHistoryTable.userId, userId), eq(tradeHistoryTable.type, "buy"), gte(tradeHistoryTable.tradedAt, weekStart)));
        if (Number(row?.total ?? 0) < condVal) {
          res.status(400).json({ error: `今週の購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU）` });
          return;
        }
      } else if (condType === "buy_total") {
        const totalBought = Number(profile?.totalBought ?? 0);
        if (totalBought < condVal) {
          res.status(400).json({ error: `累計購入枚数が不足しています（必要: ${condVal.toLocaleString()} INMU、現在: ${totalBought.toLocaleString()} INMU）` });
          return;
        }
      }
    }

    await db
      .update(missionParticipationsTable)
      .set({ status: "achieved", achievedAt: new Date() })
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      );

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
    const mission = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.id, missionId))
      .then((r) => r[0]);

    if (!mission || !mission.isActive) {
      res.status(404).json({ error: "ミッションが見つかりません" });
      return;
    }

    const now = new Date();
    const period = getPeriod(mission.type);

    const existing = await db
      .select()
      .from(missionParticipationsTable)
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      )
      .then((r) => r[0]);

    if (!existing) {
      res.status(400).json({ error: "先に「参加する」を押してください" });
      return;
    }

    if (existing.status === "rewarded") {
      res.status(409).json({ error: "already_completed", message: "このミッションは既に達成済みです" });
      return;
    }

    if (existing.status === "joined") {
      res.status(400).json({ error: "先に達成条件を満たしてください" });
      return;
    }

    await db
      .update(missionParticipationsTable)
      .set({ status: "rewarded", rewardedAt: now })
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      );

    await db.insert(missionCompletionsTable).values({ userId, missionId, period }).catch(() => {});

    if (mission.points > 0) {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await db.insert(pointsTable).values({
        userId,
        amount: String(mission.points),
        type: "mission",
        source: mission.title,
        month,
      });
      await db
        .update(profileTable)
        .set({
          monthlyPoints: sql`${profileTable.monthlyPoints} + ${mission.points}`,
          updatedAt: now,
        })
        .where(eq(profileTable.userId, userId));
    }

    await db.insert(notificationsTable).values({
      userId,
      type: "mission",
      title: "ミッション達成！",
      message: `「${mission.title}」を達成して ${mission.points} ポイントを獲得しました`,
    });

    res.json({ ok: true, points: mission.points });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/missions/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const missionId = Number(req.params.id);
  if (isNaN(missionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    const mission = await db
      .select()
      .from(missionsTable)
      .where(eq(missionsTable.id, missionId))
      .then((r) => r[0]);

    if (!mission || !mission.isActive) {
      res.status(404).json({ error: "ミッションが見つかりません" });
      return;
    }

    const now = new Date();
    if (mission.endAt && mission.endAt < now) {
      res.status(400).json({ error: "このミッションは終了しています" });
      return;
    }

    const period = getPeriod(mission.type);

    const already = await db
      .select()
      .from(missionCompletionsTable)
      .where(
        and(
          eq(missionCompletionsTable.userId, userId),
          eq(missionCompletionsTable.missionId, missionId),
          eq(missionCompletionsTable.period, period),
        ),
      )
      .then((r) => r[0]);

    if (already) {
      res.status(409).json({ error: "already_completed", message: "このミッションは既に達成済みです" });
      return;
    }

    await db.insert(missionCompletionsTable).values({ userId, missionId, period });

    await db
      .update(missionParticipationsTable)
      .set({ status: "rewarded", rewardedAt: now })
      .where(
        and(
          eq(missionParticipationsTable.userId, userId),
          eq(missionParticipationsTable.missionId, missionId),
          eq(missionParticipationsTable.period, period),
        ),
      );

    if (mission.points > 0) {
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      await db.insert(pointsTable).values({
        userId,
        amount: String(mission.points),
        type: "mission",
        source: mission.title,
        month,
      });
      await db
        .update(profileTable)
        .set({
          monthlyPoints: sql`${profileTable.monthlyPoints} + ${mission.points}`,
          updatedAt: now,
        })
        .where(eq(profileTable.userId, userId));
    }

    await db.insert(notificationsTable).values({
      userId,
      type: "mission",
      title: "ミッション達成！",
      message: `「${mission.title}」を達成して ${mission.points} ポイントを獲得しました`,
    });

    res.json({ ok: true, points: mission.points });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/admin/missions", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const missions = await db
      .select()
      .from(missionsTable)
      .orderBy(sql`${missionsTable.createdAt} DESC`);
    res.json(missions);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/admin/missions", requireAdmin, async (req, res): Promise<void> => {
  const { title, description, type, points, startAt, endAt, linkUrl, isActive } =
    req.body as {
      title?: string;
      description?: string;
      type?: string;
      points?: number;
      startAt?: string;
      endAt?: string;
      linkUrl?: string;
      isActive?: boolean;
    };
  if (!title?.trim() || !type) {
    res.status(400).json({ error: "title and type required" });
    return;
  }
  try {
    const [mission] = await db
      .insert(missionsTable)
      .values({
        title: title.trim(),
        description: description?.trim() || null,
        type: type === "weekly" ? "weekly" : "daily",
        points: points ?? 0,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        linkUrl: linkUrl?.trim() || null,
        isActive: isActive !== false,
      })
      .returning();
    res.status(201).json(mission);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.put("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, description, type, points, startAt, endAt, linkUrl, isActive } =
    req.body as {
      title?: string;
      description?: string;
      type?: string;
      points?: number;
      startAt?: string | null;
      endAt?: string | null;
      linkUrl?: string | null;
      isActive?: boolean;
    };
  try {
    await db
      .update(missionsTable)
      .set({
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(type !== undefined && { type: type === "weekly" ? "weekly" : "daily" }),
        ...(points !== undefined && { points }),
        ...(startAt !== undefined && { startAt: startAt ? new Date(startAt) : null }),
        ...(endAt !== undefined && { endAt: endAt ? new Date(endAt) : null }),
        ...(linkUrl !== undefined && { linkUrl: linkUrl?.trim() || null }),
        ...(isActive !== undefined && { isActive }),
      })
      .where(eq(missionsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.delete("/admin/missions/:id", requireAdmin, async (req, res): Promise<void> => {
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
