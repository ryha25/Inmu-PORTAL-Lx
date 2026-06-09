import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/session";

const router = Router();

// 設定のデフォルト値（テーブル未挿入時のフォールバック）
const DEFAULTS: Record<string, { value: string; description: string }> = {
  purchase_request_limit: { value: "1000000", description: "購入枚数申請上限（INMU）" },
};

// ── 管理者: 全設定一覧 ──
router.get("/admin/system-settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    // デフォルトにないキーも含め、デフォルトキーは必ず返す
    const map = new Map(rows.map(r => [r.key, r]));
    for (const [key, def] of Object.entries(DEFAULTS)) {
      if (!map.has(key)) {
        map.set(key, { key, value: def.value, description: def.description, updatedAt: new Date() });
      }
    }
    res.json(Array.from(map.values()));
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理者: 設定を更新（upsert） ──
router.put("/admin/system-settings/:key", requireAdmin, async (req, res): Promise<void> => {
  const { key } = req.params;
  const { value, description } = req.body as { value?: string; description?: string };

  if (value == null || String(value).trim() === "") {
    res.status(400).json({ error: "value は必須です" });
    return;
  }

  try {
    await db
      .insert(systemSettingsTable)
      .values({
        key,
        value: String(value).trim(),
        description: description?.trim() || DEFAULTS[key]?.description || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: {
          value: String(value).trim(),
          description: description?.trim() || DEFAULTS[key]?.description || undefined,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true, key, value: String(value).trim() });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
