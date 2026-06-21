import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/session";

const router = Router();

// 管理画面に表示・編集する設定（新仕様のみ）
const DEFAULTS: Record<string, { value: string; description: string }> = {
  normal_daily_purchase_limit: { value: "300000",  description: "通常日の1日申請上限（INMU）" },
  event_daily_purchase_limit:  { value: "500000",  description: "イベント日の1日申請上限（INMU）" },
  event_mode_enabled:          { value: "false",   description: "イベント申請モード（ON/OFF）" },
  event_start_date:            { value: "",        description: "イベント対象開始日（YYYY-MM-DD）" },
  event_end_date:              { value: "",        description: "イベント対象終了日（YYYY-MM-DD）" },
};

// DBに残っているが表示・編集しない旧設定キー
const HIDDEN_KEYS = new Set(["purchase_request_limit"]);

// ── 管理者: 全設定一覧 ──
router.get("/admin/system-settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const map = new Map(rows.map(r => [r.key, r]));

    // DEFAULTS に無いキーは DEFAULTS の初期値で補完
    for (const [key, def] of Object.entries(DEFAULTS)) {
      if (!map.has(key)) {
        map.set(key, { key, value: def.value, description: def.description, updatedAt: new Date() });
      }
    }

    // 定義順で返す（HIDDEN_KEYS は除外）
    const ordered = Object.keys(DEFAULTS)
      .filter(k => map.has(k) && !HIDDEN_KEYS.has(k))
      .map(k => map.get(k)!);

    // DEFAULTS以外の追加設定（HIDDEN_KEYSを除く）
    const extra = [...map.values()].filter(r => !DEFAULTS[r.key] && !HIDDEN_KEYS.has(r.key));

    res.json([...ordered, ...extra]);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

// ── 管理者: 設定を更新（upsert） ──
router.put("/admin/system-settings/:key", requireAdmin, async (req, res): Promise<void> => {
  const { key } = req.params;
  const { value, description } = req.body as { value?: string; description?: string };

  if (value == null) {
    res.status(400).json({ error: "value は必須です" });
    return;
  }
  const strVal = String(value).trim();

  try {
    await db
      .insert(systemSettingsTable)
      .values({
        key,
        value: strVal,
        description: description?.trim() || DEFAULTS[key]?.description || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: {
          value: strVal,
          description: description?.trim() || DEFAULTS[key]?.description || undefined,
          updatedAt: new Date(),
        },
      });

    res.json({ ok: true, key, value: strVal });
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
