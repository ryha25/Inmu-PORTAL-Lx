import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/session";

const router = Router();

const DEFAULTS: Record<string, { value: string; description: string }> = {
  normal_daily_purchase_limit: { value: "300000",  description: "通常日の1日申請上限（INMU）" },
  event_daily_purchase_limit:  { value: "500000",  description: "イベント日の1日申請上限（INMU）" },
  event_mode_enabled:          { value: "false",   description: "イベント申請モード（ON/OFF）" },
  event_start_date:            { value: "",        description: "イベント対象開始日（YYYY-MM-DD）" },
  event_end_date:              { value: "",        description: "イベント対象終了日（YYYY-MM-DD）" },
  reward_level_inmu:           { value: "30000",   description: "配布キャラ Lv.15 報酬INMU（価格連動報酬計算機）" },
  reward_gacha_lv20_inmu:      { value: "50000",   description: "ガチャキャラ Lv.20 報酬INMU（価格連動報酬計算機）" },
  reward_gacha_lv30_inmu:      { value: "250000",  description: "ガチャキャラ Lv.30 報酬INMU（価格連動報酬計算機）" },
  reward_nyarushian_lv20_inmu: { value: "50000",   description: "ニャルシアン Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_nyarushian_lv30_inmu: { value: "250000",  description: "ニャルシアン Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_takuya_lv20_inmu:     { value: "50000",   description: "拓也 Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_takuya_lv30_inmu:     { value: "250000",  description: "拓也 Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_leon_lv20_inmu:       { value: "50000",   description: "レオン Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_leon_lv30_inmu:       { value: "250000",  description: "レオン Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_chinge_lv20_inmu:     { value: "50000",   description: "チンゲ Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_chinge_lv30_inmu:     { value: "250000",  description: "チンゲ Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_tdn_lv20_inmu:        { value: "50000",   description: "TDN Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_tdn_lv30_inmu:        { value: "250000",  description: "TDN Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_whip_lv20_inmu:       { value: "50000",   description: "ホイップ Lv.20 報酬INMU（未保存時は共通設定を使用）" },
  reward_whip_lv30_inmu:       { value: "250000",  description: "ホイップ Lv.30 報酬INMU（未保存時は共通設定を使用）" },
  reward_daifugo_lv20_inmu:    { value: "20000",   description: "大富豪 Lv.20 報酬INMU" },
  gacha_paid_single_inmu:      { value: "10000",   description: "有償ガチャ1連INMU価格" },
  gacha_paid_eleven_inmu:      { value: "100000",  description: "有償ガチャ11連INMU価格" },
  slot_unlock_2_inmu:          { value: "1000000", description: "スロット解放INMU価格（2枠目）" },
  slot_unlock_3_inmu:          { value: "2000000", description: "スロット解放INMU価格（3枠目）" },
  normal_rebate_rate:          { value: "0",       description: "通常日の購入申請基本還元率（%）" },
  event_rebate_rate:           { value: "0",       description: "イベント日の購入申請基本還元率（%）" },
  pet_gacha_event_name:        { value: "7月17日 新ガチャ", description: "PET gacha event name" },
  pet_gacha_event_start_at:    { value: "2026-07-17T12:00:00+09:00", description: "PET gacha event start datetime" },
  pet_gacha_event_end_at:      { value: "", description: "PET gacha event end datetime" },
  pet_gacha_event_banners:     { value: "{\"points\":[\"asset:20260717-points-main\",\"asset:20260717-chinge\",\"asset:20260717-tdn\",\"asset:20260717-whip\"],\"paid\":[\"asset:20260717-inmu-main\",\"asset:20260717-chinge\",\"asset:20260717-tdn\",\"asset:20260717-whip\"]}", description: "PET gacha banner JSON" },
  pet_gacha_event_points_prizes: { value: "[{\"id\":\"pts100\",\"label\":\"100pt\",\"type\":\"points\",\"amount\":100,\"weight\":50000},{\"id\":\"pts300\",\"label\":\"300pt\",\"type\":\"points\",\"amount\":300,\"weight\":30000},{\"id\":\"pts500\",\"label\":\"500pt\",\"type\":\"points\",\"amount\":500,\"weight\":5000},{\"id\":\"pts1000\",\"label\":\"1,000pt\",\"type\":\"points\",\"amount\":1000,\"weight\":3000},{\"id\":\"pts5000\",\"label\":\"5,000pt\",\"type\":\"points\",\"amount\":5000,\"weight\":1170},{\"id\":\"inmu10k\",\"label\":\"10,000 INMU\",\"type\":\"inmu\",\"amount\":10000,\"weight\":1790},{\"id\":\"premium-food\",\"label\":\"高級ごはん\",\"type\":\"premium_food\",\"amount\":1,\"weight\":4490},{\"id\":\"sleep-tea\",\"label\":\"アイスティー（睡眠薬入り）\",\"type\":\"sleep_tea\",\"amount\":1,\"weight\":4050}]", description: "Point gacha prize JSON except character pools" },
  pet_gacha_event_paid_prizes: { value: "[{\"id\":\"pts1000\",\"label\":\"1,000pt\",\"type\":\"points\",\"amount\":1000,\"weight\":60000},{\"id\":\"pts3000\",\"label\":\"3,000pt\",\"type\":\"points\",\"amount\":3000,\"weight\":20000},{\"id\":\"pts5000\",\"label\":\"5,000pt\",\"type\":\"points\",\"amount\":5000,\"weight\":7000},{\"id\":\"pts10000\",\"label\":\"10,000pt\",\"type\":\"points\",\"amount\":10000,\"weight\":2000},{\"id\":\"premium-food\",\"label\":\"高級ごはん\",\"type\":\"premium_food\",\"amount\":1,\"weight\":4000},{\"id\":\"sleep-tea\",\"label\":\"アイスティー（睡眠薬入り）\",\"type\":\"sleep_tea\",\"amount\":1,\"weight\":5300}]", description: "INMU gacha prize JSON except character pools" },
  pet_gacha_event_points_character_pools: { value: "[{\"id\":\"new-character\",\"label\":\"今回のキャラ（3種）\",\"weight\":300,\"characters\":[\"chinge\",\"tdn\",\"whip\"]},{\"id\":\"legacy-character\",\"label\":\"前回キャラ（その他）\",\"weight\":200,\"characters\":[\"nyarushian\",\"takuya\",\"leon\"]}]", description: "Point gacha new/legacy character pool JSON" },
  pet_gacha_event_paid_character_pools: { value: "[{\"id\":\"new-character\",\"label\":\"今回のキャラ（3種）\",\"weight\":1200,\"characters\":[\"chinge\",\"tdn\",\"whip\"]},{\"id\":\"legacy-character\",\"label\":\"前回キャラ\",\"weight\":500,\"characters\":[\"nyarushian\",\"takuya\",\"leon\"]}]", description: "INMU gacha new/legacy character pool JSON" },
  pet_gacha_event_pity_policy: { value: "carry_over", description: "Paid gacha pity policy" },
};

const HIDDEN_KEYS = new Set(["purchase_request_limit"]);

const PUBLIC_PRICE_KEYS = [
  "gacha_paid_single_inmu",
  "gacha_paid_eleven_inmu",
  "slot_unlock_2_inmu",
  "slot_unlock_3_inmu",
  "reward_level_inmu",
  "reward_gacha_lv20_inmu",
  "reward_gacha_lv30_inmu",
  "reward_nyarushian_lv20_inmu",
  "reward_nyarushian_lv30_inmu",
  "reward_takuya_lv20_inmu",
  "reward_takuya_lv30_inmu",
  "reward_leon_lv20_inmu",
  "reward_leon_lv30_inmu",
  "reward_chinge_lv20_inmu",
  "reward_chinge_lv30_inmu",
  "reward_tdn_lv20_inmu",
  "reward_tdn_lv30_inmu",
  "reward_whip_lv20_inmu",
  "reward_whip_lv30_inmu",
  "reward_daifugo_lv20_inmu",
] as const;

router.get("/admin/system-settings", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const map = new Map(rows.map((row) => [row.key, row]));

    for (const [key, def] of Object.entries(DEFAULTS)) {
      if (!map.has(key)) {
        map.set(key, { key, value: def.value, description: def.description, updatedAt: new Date() });
      }
    }

    const ordered = Object.keys(DEFAULTS)
      .filter((key) => map.has(key) && !HIDDEN_KEYS.has(key))
      .map((key) => map.get(key)!);
    const extra = [...map.values()].filter((row) => !DEFAULTS[row.key] && !HIDDEN_KEYS.has(row.key));

    res.json([...ordered, ...extra]);
  } catch {
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/pet-prices", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(systemSettingsTable);
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const prices: Record<string, number> = {};

    for (const key of PUBLIC_PRICE_KEYS) {
      const raw = map.get(key) ?? DEFAULTS[key].value;
      const value = Number(raw);
      prices[key] = Number.isFinite(value) ? value : Number(DEFAULTS[key].value);
    }

    res.json(prices);
  } catch {
    const fallback: Record<string, number> = {};
    for (const key of PUBLIC_PRICE_KEYS) fallback[key] = Number(DEFAULTS[key].value);
    res.json(fallback);
  }
});

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
