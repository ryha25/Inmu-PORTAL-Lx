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
  reward_level_inmu:           { value: "30000",   description: "配布キャラ Lv.15 報酬INMU（価格連動 報酬計算機）" },
  reward_gacha_lv20_inmu:      { value: "50000",   description: "ガチャキャラ Lv.20 報酬INMU（価格連動 報酬計算機）" },
  reward_gacha_lv30_inmu:      { value: "250000",  description: "ガチャキャラ Lv.30 報酬INMU（価格連動 報酬計算機）" },
  gacha_paid_single_inmu:      { value: "10000",   description: "ガチャ関連INMU価格（有償単発）" },
  gacha_paid_eleven_inmu:      { value: "100000",  description: "ガチャ関連INMU価格（有償11連）" },
  slot_unlock_2_inmu:          { value: "1000000", description: "スロット解放INMU価格（2枠目）" },
  slot_unlock_3_inmu:          { value: "2000000", description: "スロット解放INMU価格（3枠目）" },
  normal_rebate_rate:          { value: "0",       description: "通常日の購入申請 基本還元率（%）" },
  event_rebate_rate:           { value: "0",       description: "イベント日の購入申請 基本還元率（%）" },
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

// ── 一般ユーザー: ガチャ・スロット解放の価格のみ公開（認証不要） ──
const PUBLIC_PRICE_KEYS = [
  "gacha_paid_single_inmu",
  "gacha_paid_eleven_inmu",
  "slot_unlock_2_inmu",
  "slot_unlock_3_inmu",
  "reward_level_inmu",
  "reward_gacha_lv20_inmu",
  "reward_gacha_lv30_inmu",
] as const;

router.get("/pet-prices", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const map = new Map(rows.map(r => [r.key, r.value]));
    const prices: Record<string, number> = {};
    for (const key of PUBLIC_PRICE_KEYS) {
      const raw = map.get(key) ?? DEFAULTS[key].value;
      const n = Number(raw);
      prices[key] = Number.isFinite(n) ? n : Number(DEFAULTS[key].value);
    }
    res.json(prices);
  } catch {
    const fallback: Record<string, number> = {};
    for (const key of PUBLIC_PRICE_KEYS) fallback[key] = Number(DEFAULTS[key].value);
    res.json(fallback);
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
