import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/session";

const router = Router();

function normalizeCorruptedNotification<T extends { type: string; title: string; message: string | null }>(notification: T): T {
  const combined = `${notification.title} ${notification.message ?? ""}`;
  if (!/\?{2,}/.test(combined)) return notification;

  if (/INMU/i.test(combined) && /810/.test(combined)) {
    return {
      ...notification,
      title: "ミッション達成！",
      message: "「ログイン日数通算7日達成」を達成して INMUくん（810祭りVer.）を獲得しました",
    };
  }
  if (/ログイン/.test(combined)) {
    return {
      ...notification,
      title: "ミッション達成！",
      message: "「ログインせよ」を達成して 100ポイントを獲得しました",
    };
  }
  if (notification.type === "mission") {
    return {
      ...notification,
      title: "ミッション達成！",
      message: "ミッション報酬を受け取りました",
    };
  }
  return { ...notification, title: "お知らせ", message: "新しいお知らせがあります" };
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(sql`${notificationsTable.createdAt} DESC`)
      .limit(50);
    const normalizedRows = rows.map(normalizeCorruptedNotification);
    await Promise.all(normalizedRows.map((notification, index) => {
      const original = rows[index];
      if (notification.title === original.title && notification.message === original.message) return Promise.resolve();
      return db.update(notificationsTable)
        .set({ title: notification.title, message: notification.message })
        .where(and(eq(notificationsTable.id, original.id), eq(notificationsTable.userId, userId)));
    }));
    res.json(normalizedRows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })));
  } catch (error) {
    console.error("[Notifications] fetch fallback:", error);
    res.json([]);
  }
});

router.post("/notifications/mark-all-read", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.userId, userId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.patch("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const id = Number(req.params.id);
  try {
    const n = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.id, id))
      .then((r) => r[0]);
    if (!n || n.userId !== userId) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(eq(notificationsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
