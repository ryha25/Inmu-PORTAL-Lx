import { Router } from "express";
import { db } from "@workspace/db";
import { missionsTable } from "@workspace/db/schema";
import { eq, and, or, isNull, gte, lte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/session";

const router = Router();

router.get("/missions", requireAuth, async (_req, res): Promise<void> => {
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

    const daily = active.filter((m) => m.type === "daily");
    const weekly = active.filter((m) => m.type === "weekly");

    res.json({ daily, weekly });
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
