import { Router } from "express";
import { db } from "@workspace/db";
import {
  missionsTable,
  missionCompletionsTable,
  missionParticipationsTable,
  profileTable,
  pointsTable,
  notificationsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
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
