import { Router } from "express";
import { pool } from "@workspace/db";
import { randomUUID } from "crypto";
import { requireAdmin, requireAuth } from "../middlewares/session";
import { fetchInmuBalance } from "./solana";
import { hasActivePetSkill, getFreeGachaState } from "../services/pet-skills";
import { getSystemSettingNumber } from "../services/system-settings-store";

const router = Router();

const MANAGEMENT_WALLET = "Hatp1W4QCzr7GAVbnQqKTVW2BmX7sRaf7jeHJMvETeU4";
const INMU_MINT = "4FDtAagigMuFcPp36rbd9bzcYTJgQah2qLMYcYtfpump";
const INMU_DECIMALS = 6;
const DUPLICATE_CHARACTER_POINTS = 50_000;
const DUPLICATE_CHARACTER_SLEEP_TEA = 3;
const TDN_REROLL_CHANCE = 0.3;
const TDN_REROLL_GUARANTEE_PULLS = 50;
const TDN_REROLL_DAILY_LIMIT = 3;
const PAID_GACHA_PITY_PULLS = 30;
const EVENT_PITY_NEW_CHARACTER_BOOST = 4;
const PITY_UNOWNED_CHARACTER_WEIGHT = 4;
const PITY_OWNED_CHARACTER_WEIGHT = 1;
const POINT_GACHA_DAILY_INMU_LIMIT = 2;
const POINT_GACHA_SLEEP_TEA_INTERNAL_WEIGHT_RATIO = 0.5;
const GACHA_EVENT_SETTING_PREFIX = "pet_gacha_event_";
const DEFAULT_EVENT_START_JST = "2026-07-17T12:00:00+09:00";

const CHARACTERS = [
  { id: "nyarushian", name: "ニャルシアン", release: "legacy" },
  { id: "takuya", name: "拓也", release: "legacy" },
  { id: "leon", name: "レオン", release: "legacy" },
  { id: "chinge", name: "チンゲ", release: "20260717" },
  { id: "tdn", name: "TDN", release: "20260717" },
  { id: "whip", name: "ホイップ", release: "20260717" },
] as const;

type PullType = "single" | "multi" | "eleven";
type GachaMode = "points" | "paid";
type TdnRerollInfo = { token: string; mode: GachaMode; pullType: PullType; expiresAt: string };
type PrizeType = "points" | "inmu" | "premium_food" | "sleep_tea" | "character";
type PrizeSpec = { id: string; label: string; type: PrizeType; amount: number; weight: number; characterId?: string };
type CharacterPoolSpec = { id: "new-character" | "legacy-character"; label: string; weight: number; characters: string[] };
type GachaPoolConfig = {
  banners: string[];
  prizes: PrizeSpec[];
  characterPools: CharacterPoolSpec[];
  rates: Array<{ id: string; label: string; rate: string }>;
};
type GachaEventConfig = {
  active: boolean;
  name: string;
  startsAt: string;
  endsAt: string | null;
  serverTime: string;
  modes: Record<GachaMode, GachaPoolConfig>;
};
type PetGachaPrize = {
  prizeId: string;
  label: string;
  type: PrizeType;
  amount: number;
  characterId?: string;
  isNewCharacter?: boolean;
  isDuplicate?: boolean;
  convertedPoints?: number;
  baseAmount?: number;
};

const PAID_PRIZES = [
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1_000, weight: 6_000 },
  { id: "pts3000", label: "3,000ポイント", type: "points" as const, amount: 3_000, weight: 2_000 },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5_000, weight: 700 },
  { id: "pts10000", label: "10,000ポイント", type: "points" as const, amount: 10_000, weight: 200 },
  { id: "premium-food", label: "高級ごはん", type: "premium_food" as const, amount: 1, weight: 400 },
  { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea" as const, amount: 1, weight: 340 },
  ...CHARACTERS.filter(character => character.release === "legacy").map(character => ({
    id: `character-${character.id}`,
    label: character.name,
    type: "character" as const,
    amount: 1,
    characterId: character.id,
    weight: 120,
  })),
];

const LEGACY_CHARACTER_IDS = ["nyarushian", "takuya", "leon"];
const JULY_17_CHARACTER_IDS = ["chinge", "tdn", "whip"];
const CHARACTER_BY_ID = new Map(CHARACTERS.map(character => [character.id, character]));

const DEFAULT_GACHA_EVENT_CONFIG = {
  name: "7月17日 新ガチャ",
  startsAt: DEFAULT_EVENT_START_JST,
  endsAt: "",
  banners: {
    points: ["asset:20260717-points-main", "asset:20260717-chinge", "asset:20260717-tdn", "asset:20260717-whip"],
    paid: ["asset:20260717-inmu-main", "asset:20260717-chinge", "asset:20260717-tdn", "asset:20260717-whip"],
  },
  characterPools: {
    points: [
      { id: "new-character", label: "今回のキャラ（3種）", weight: 300, characters: JULY_17_CHARACTER_IDS },
      { id: "legacy-character", label: "前回キャラ（その他）", weight: 200, characters: LEGACY_CHARACTER_IDS },
    ],
    paid: [
      { id: "new-character", label: "今回のキャラ（3種）", weight: 1200, characters: JULY_17_CHARACTER_IDS },
      { id: "legacy-character", label: "前回キャラ", weight: 500, characters: LEGACY_CHARACTER_IDS },
    ],
  },
  prizes: {
    points: [
      { id: "pts100", label: "100pt", type: "points", amount: 100, weight: 50_000 },
      { id: "pts300", label: "300pt", type: "points", amount: 300, weight: 30_000 },
      { id: "pts500", label: "500pt", type: "points", amount: 500, weight: 5_000 },
      { id: "pts1000", label: "1,000pt", type: "points", amount: 1_000, weight: 3_000 },
      { id: "pts5000", label: "5,000pt", type: "points", amount: 5_000, weight: 1_170 },
      { id: "inmu10k", label: "10,000 INMU", type: "inmu", amount: 10_000, weight: 1_790 },
      { id: "premium-food", label: "高級ごはん", type: "premium_food", amount: 1, weight: 4_490 },
      { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea", amount: 1, weight: 4_050 },
    ],
    paid: [
      { id: "pts1000", label: "1,000pt", type: "points", amount: 1_000, weight: 60_000 },
      { id: "pts3000", label: "3,000pt", type: "points", amount: 3_000, weight: 20_000 },
      { id: "pts5000", label: "5,000pt", type: "points", amount: 5_000, weight: 7_000 },
      { id: "pts10000", label: "10,000pt", type: "points", amount: 10_000, weight: 2_000 },
      { id: "premium-food", label: "高級ごはん", type: "premium_food", amount: 1, weight: 4_000 },
      { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea", amount: 1, weight: 5_300 },
    ],
  },
} as const;

const POINT_GUARANTEED_EFFECT_RATE = 1 / 514;

// 2026-07-05: アイスティーの排出を内部上2%(3,420/171,000)に、10,000 INMUを内部上1%(1,710/171,000)に調整。
// 減少分の余り(旧比 -2,823 / -428 = 合計3,251)は100ポイントの排出率に加算した(86,878→90,129)。総重み171,000は不変。
const POINT_PRIZES = [
  { id: "pts100", label: "100ポイント", type: "points" as const, amount: 100, weight: 90_129 },
  { id: "pts300", label: "300ポイント", type: "points" as const, amount: 300, weight: 51_300 },
  { id: "pts500", label: "500ポイント", type: "points" as const, amount: 500, weight: 8_550 },
  { id: "pts1000", label: "1,000ポイント", type: "points" as const, amount: 1_000, weight: 5_130 },
  { id: "pts5000", label: "5,000ポイント", type: "points" as const, amount: 5_000, weight: 2_000 },
  { id: "inmu10k", label: "10,000 INMU", type: "inmu" as const, amount: 10_000, weight: 1_710 },
  { id: "premium-food", label: "高級ごはん", type: "premium_food" as const, amount: 1, weight: 7_684 },
  { id: "sleep-tea", label: "アイスティー（睡眠薬入り）", type: "sleep_tea" as const, amount: 1, weight: 3_420 },
  ...CHARACTERS.filter(character => character.release === "legacy").map(character => ({
    id: `character-${character.id}`,
    label: character.name,
    type: "character" as const,
    amount: 1,
    characterId: character.id,
    weight: 359,
  })),
];

let tablePromise: Promise<void> | null = null;
export function ensurePetCommerceTables() {
  if (tablePromise) return tablePromise;
  tablePromise = Promise.all([
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petGachaState" (
        "userId" TEXT PRIMARY KEY,
        "paidPity" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petGachaHistory" (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "gachaType" TEXT NOT NULL,
        "pullType" TEXT NOT NULL,
        "costPoints" INTEGER NOT NULL DEFAULT 0,
        "costInmu" BIGINT NOT NULL DEFAULT 0,
        "txId" TEXT UNIQUE,
        "payerWallet" TEXT,
        results JSONB NOT NULL DEFAULT '[]'::jsonb,
        "tdnRerollToken" TEXT UNIQUE,
        "tdnRerollGrantedAt" TIMESTAMPTZ,
        "tdnRerollUsedAt" TIMESTAMPTZ,
        "tdnRerollSourceId" INTEGER,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petSlotUnlocks" (
        id SERIAL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "slotNumber" INTEGER NOT NULL,
        "paidInmu" BIGINT NOT NULL,
        "txId" TEXT NOT NULL UNIQUE,
        "payerWallet" TEXT,
        "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE ("userId", "slotNumber")
      )
    `),
    pool.query(`
      CREATE TABLE IF NOT EXISTS "petPaymentAttempts" (
        "txId" TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL,
        purpose TEXT NOT NULL,
        "expectedAmount" BIGINT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        "lastError" TEXT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "verifiedAt" TIMESTAMPTZ,
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `),
    pool.query(`ALTER TABLE "gachaResults" ADD COLUMN IF NOT EXISTS "gachaKind" TEXT NOT NULL DEFAULT 'normal'`).catch(() => undefined),
    pool.query(`ALTER TABLE "petGachaHistory" ADD COLUMN IF NOT EXISTS "tdnRerollToken" TEXT UNIQUE`).catch(() => undefined),
    pool.query(`ALTER TABLE "petGachaHistory" ADD COLUMN IF NOT EXISTS "tdnRerollGrantedAt" TIMESTAMPTZ`).catch(() => undefined),
    pool.query(`ALTER TABLE "petGachaHistory" ADD COLUMN IF NOT EXISTS "tdnRerollUsedAt" TIMESTAMPTZ`).catch(() => undefined),
    pool.query(`ALTER TABLE "petGachaHistory" ADD COLUMN IF NOT EXISTS "tdnRerollSourceId" INTEGER`).catch(() => undefined),
  ]).then(() => undefined).catch(error => {
    tablePromise = null;
    throw error;
  });
  return tablePromise;
}

function weightedRoll(table: typeof PAID_PRIZES | typeof POINT_PRIZES) {
  const total = table.reduce((sum, prize) => sum + prize.weight, 0);
  let cursor = Math.floor(Math.random() * total);
  for (const prize of table) {
    if (cursor < prize.weight) return prize;
    cursor -= prize.weight;
  }
  return table[0];
}

function weightedRollSpecs<T extends { weight: number }>(table: readonly T[]): T {
  const total = table.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight) || 0), 0);
  if (total !== 100_000) {
    throw new Error(`ガチャ排出率の合計が100%ではありません: ${(total / 1000).toFixed(3)}%`);
  }
  let cursor = Math.floor(Math.random() * total);
  for (const prize of table) {
    const weight = Math.max(0, Number(prize.weight) || 0);
    if (cursor < weight) return prize;
    cursor -= weight;
  }
  return table[0];
}

function weightedRollByWeight<T extends { weight: number }>(table: readonly T[]): T {
  const total = table.reduce((sum, prize) => sum + Math.max(0, Number(prize.weight) || 0), 0);
  if (total <= 0) return table[0];
  let cursor = Math.floor(Math.random() * total);
  for (const prize of table) {
    const weight = Math.max(0, Number(prize.weight) || 0);
    if (cursor < weight) return prize;
    cursor -= weight;
  }
  return table[0];
}

function tunePointPrizeWeightsForInternalRoll<T extends { id: string; type: PrizeType; weight: number }>(prizes: readonly T[]): T[] {
  const adjusted = prizes.map(prize => ({ ...prize }));
  const sleepTea = adjusted.find(prize => prize.type === "sleep_tea");
  if (!sleepTea) return adjusted;
  const originalWeight = Math.max(0, Number(sleepTea.weight) || 0);
  const loweredWeight = Math.floor(originalWeight * POINT_GACHA_SLEEP_TEA_INTERNAL_WEIGHT_RATIO);
  const redistributedWeight = Math.max(0, originalWeight - loweredWeight);
  sleepTea.weight = loweredWeight;
  const fallbackPrize = adjusted.find(prize => prize.id === "pts100") ?? adjusted.find(prize => prize.type === "points");
  if (fallbackPrize) fallbackPrize.weight = Math.max(0, Number(fallbackPrize.weight) || 0) + redistributedWeight;
  return adjusted as T[];
}

function weightToRate(weight: number): string {
  const rate = weight / 1000;
  return `${Number.isInteger(rate) ? rate.toFixed(0) : rate.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

function parseJsonSetting<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

async function getSystemSettingString(key: string, fallback: string): Promise<string> {
  try {
    const { rows } = await pool.query(`SELECT value FROM "systemSettings" WHERE key=$1`, [key]);
    return rows.length ? String(rows[0].value ?? fallback) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePrizeSpec(prize: any): PrizeSpec | null {
  const id = String(prize?.id ?? "").trim();
  const type = String(prize?.type ?? "").trim() as PrizeType;
  const label = String(prize?.label ?? id).trim();
  const amount = Math.floor(Number(prize?.amount ?? 0));
  const weight = Math.floor(Number(prize?.weight ?? 0));
  if (!id || !["points", "inmu", "premium_food", "sleep_tea"].includes(type) || amount < 0 || weight < 0) return null;
  return { id, label, type, amount, weight };
}

function normalizeCharacterPool(pool: any): CharacterPoolSpec | null {
  const id = pool?.id === "legacy-character" ? "legacy-character" : "new-character";
  const label = String(pool?.label ?? (id === "new-character" ? "今回のキャラ" : "前回キャラ")).trim();
  const weight = Math.floor(Number(pool?.weight ?? 0));
  const characters = Array.isArray(pool?.characters)
    ? pool.characters.map((value: unknown) => String(value).trim()).filter(id => CHARACTER_BY_ID.has(id))
    : [];
  if (weight < 0 || characters.length === 0) return null;
  return { id, label, weight, characters };
}

function buildRates(prizes: PrizeSpec[], characterPools: CharacterPoolSpec[]) {
  return [
    ...prizes.map(prize => ({ id: prize.id, label: prize.label, rate: weightToRate(prize.weight) })),
    ...characterPools.map(pool => ({ id: pool.id, label: pool.label, rate: weightToRate(pool.weight) })),
  ];
}

function buildPool(prizes: PrizeSpec[], characterPools: CharacterPoolSpec[]): GachaPoolConfig {
  const total = [...prizes, ...characterPools].reduce((sum, item) => sum + item.weight, 0);
  if (total !== 100_000) {
    throw new Error(`ガチャ排出率の合計が100%ではありません: ${(total / 1000).toFixed(3)}%`);
  }
  return { banners: [], prizes, characterPools, rates: buildRates(prizes, characterPools) };
}

async function getGachaEventConfig(now = new Date()): Promise<GachaEventConfig> {
  const [name, startsAtRaw, endsAtRaw, bannersRaw, pointPrizesRaw, paidPrizesRaw, pointPoolsRaw, paidPoolsRaw] = await Promise.all([
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}name`, DEFAULT_GACHA_EVENT_CONFIG.name),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}start_at`, DEFAULT_GACHA_EVENT_CONFIG.startsAt),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}end_at`, DEFAULT_GACHA_EVENT_CONFIG.endsAt),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}banners`, JSON.stringify(DEFAULT_GACHA_EVENT_CONFIG.banners)),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}points_prizes`, JSON.stringify(DEFAULT_GACHA_EVENT_CONFIG.prizes.points)),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}paid_prizes`, JSON.stringify(DEFAULT_GACHA_EVENT_CONFIG.prizes.paid)),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}points_character_pools`, JSON.stringify(DEFAULT_GACHA_EVENT_CONFIG.characterPools.points)),
    getSystemSettingString(`${GACHA_EVENT_SETTING_PREFIX}paid_character_pools`, JSON.stringify(DEFAULT_GACHA_EVENT_CONFIG.characterPools.paid)),
  ]);
  const startsAt = new Date(startsAtRaw);
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  const active = Number.isFinite(startsAt.getTime()) && now >= startsAt && (!endsAt || !Number.isFinite(endsAt.getTime()) || now < endsAt);
  if (!active) {
    const points = buildPool([...DEFAULT_GACHA_EVENT_CONFIG.prizes.points], [...DEFAULT_GACHA_EVENT_CONFIG.characterPools.points]);
    const paid = buildPool([...DEFAULT_GACHA_EVENT_CONFIG.prizes.paid], [...DEFAULT_GACHA_EVENT_CONFIG.characterPools.paid]);
    points.banners = [...DEFAULT_GACHA_EVENT_CONFIG.banners.points];
    paid.banners = [...DEFAULT_GACHA_EVENT_CONFIG.banners.paid];
    return {
      active: false,
      name,
      startsAt: Number.isFinite(startsAt.getTime()) ? startsAt.toISOString() : new Date(DEFAULT_EVENT_START_JST).toISOString(),
      endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null,
      serverTime: now.toISOString(),
      modes: { points, paid },
    };
  }
  const banners = parseJsonSetting(bannersRaw, DEFAULT_GACHA_EVENT_CONFIG.banners);
  const pointPrizes = parseJsonSetting<any[]>(pointPrizesRaw, [...DEFAULT_GACHA_EVENT_CONFIG.prizes.points]).map(normalizePrizeSpec).filter(Boolean) as PrizeSpec[];
  const paidPrizes = parseJsonSetting<any[]>(paidPrizesRaw, [...DEFAULT_GACHA_EVENT_CONFIG.prizes.paid]).map(normalizePrizeSpec).filter(Boolean) as PrizeSpec[];
  const pointPools = parseJsonSetting<any[]>(pointPoolsRaw, [...DEFAULT_GACHA_EVENT_CONFIG.characterPools.points]).map(normalizeCharacterPool).filter(Boolean) as CharacterPoolSpec[];
  const paidPools = parseJsonSetting<any[]>(paidPoolsRaw, [...DEFAULT_GACHA_EVENT_CONFIG.characterPools.paid]).map(normalizeCharacterPool).filter(Boolean) as CharacterPoolSpec[];
  const points = buildPool(pointPrizes, pointPools);
  const paid = buildPool(paidPrizes, paidPools);
  points.banners = Array.isArray((banners as any).points) ? (banners as any).points.map(String) : [...DEFAULT_GACHA_EVENT_CONFIG.banners.points];
  paid.banners = Array.isArray((banners as any).paid) ? (banners as any).paid.map(String) : [...DEFAULT_GACHA_EVENT_CONFIG.banners.paid];
  return {
    active,
    name,
    startsAt: Number.isFinite(startsAt.getTime()) ? startsAt.toISOString() : new Date(DEFAULT_EVENT_START_JST).toISOString(),
    endsAt: endsAt && Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null,
    serverTime: now.toISOString(),
    modes: { points, paid },
  };
}

function pickPityCharacterId(characterIds: string[], ownedCharacterIds?: Set<string>) {
  if (!ownedCharacterIds) return characterIds[Math.floor(Math.random() * characterIds.length)];
  const unownedCharacters = characterIds.filter(characterId => !ownedCharacterIds.has(characterId));
  const ownedCharacters = characterIds.filter(characterId => ownedCharacterIds.has(characterId));
  const pityTables = [
    { characters: unownedCharacters, weight: PITY_UNOWNED_CHARACTER_WEIGHT },
    { characters: ownedCharacters, weight: PITY_OWNED_CHARACTER_WEIGHT },
  ].filter(table => table.characters.length > 0);
  const selectedTable = weightedRollByWeight(pityTables);
  return selectedTable.characters[Math.floor(Math.random() * selectedTable.characters.length)];
}

async function getOwnedPetCharacterIds(client: any, userId: string): Promise<Set<string>> {
  const result = await client.query(`SELECT "characterId" FROM "userPetCharacters" WHERE "userId"=$1`, [userId]);
  return new Set(result.rows.map((row: { characterId: string }) => row.characterId));
}

function resolveConfiguredPrize(prize: PrizeSpec | CharacterPoolSpec, ownedCharacterIds?: Set<string>): PrizeSpec {
  if ("characters" in prize) {
    const characterId = pickPityCharacterId(prize.characters, ownedCharacterIds);
    const character = CHARACTER_BY_ID.get(characterId as (typeof CHARACTERS)[number]["id"]);
    if (!character) throw new Error("ガチャキャラクター設定が不正です");
    return { id: `character-${character.id}`, label: character.name, type: "character", amount: 1, characterId: character.id, weight: prize.weight };
  }
  return prize;
}

function randomCharacter(ownedCharacterIds?: Set<string>) {
  const legacyCharacters = CHARACTERS.filter(character => character.release === "legacy");
  const legacyCharacterIds = legacyCharacters.map(character => character.id);
  const characterId = pickPityCharacterId(legacyCharacterIds, ownedCharacterIds);
  return CHARACTER_BY_ID.get(characterId as (typeof CHARACTERS)[number]["id"]) ?? legacyCharacters[Math.floor(Math.random() * legacyCharacters.length)];
}

async function rollPetGachaPrize(mode: GachaMode, guaranteedCharacter = false, ownedCharacterIds?: Set<string>) {
  const config = await getGachaEventConfig();
  if (config.active) {
    const pool = config.modes[mode];
    const poolPrizes = mode === "points" ? tunePointPrizeWeightsForInternalRoll(pool.prizes) : pool.prizes;
    if (guaranteedCharacter) {
      const pityPools = pool.characterPools.map(characterPool => ({
        ...characterPool,
        weight: characterPool.id === "new-character" ? characterPool.weight * EVENT_PITY_NEW_CHARACTER_BOOST : characterPool.weight,
      }));
      const selectedPool = weightedRollByWeight(pityPools);
      return resolveConfiguredPrize(selectedPool, ownedCharacterIds);
    }
    return resolveConfiguredPrize(weightedRollSpecs([...poolPrizes, ...pool.characterPools]));
  }
  if (guaranteedCharacter) {
    const character = randomCharacter(ownedCharacterIds);
    return { id: `character-${character.id}`, label: character.name, type: "character", amount: 1, characterId: character.id };
  }
  return mode === "paid" ? weightedRoll(PAID_PRIZES) : weightedRollByWeight(tunePointPrizeWeightsForInternalRoll(POINT_PRIZES));
}

async function rollPetPointGachaPrizeWithoutInmu() {
  const config = await getGachaEventConfig();
  if (config.active) {
    const pool = config.modes.points;
    const prizes = tunePointPrizeWeightsForInternalRoll(pool.prizes).filter(prize => prize.type !== "inmu");
    return resolveConfiguredPrize(weightedRollByWeight([...prizes, ...pool.characterPools]));
  }
  return weightedRollByWeight(tunePointPrizeWeightsForInternalRoll(POINT_PRIZES).filter(prize => prize.type !== "inmu"));
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchConfirmedTransaction(signature: string) {
  const rpcUrl = process.env.SOLANA_RPC;
  if (!rpcUrl) throw new Error("SOLANA_RPC is not configured");
  let lastError: any = null;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSignatureStatuses",
        params: [[signature], { searchTransactionHistory: true }],
      }),
    });
    const statusRpc = await statusResponse.json() as any;
    const signatureStatus = statusRpc?.result?.value?.[0];
    if (signatureStatus?.err) throw new Error(`送金トランザクションが失敗しています: ${JSON.stringify(signatureStatus.err)}`);
    const commitment = signatureStatus?.confirmationStatus === "finalized" ? "finalized" : "confirmed";
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment, maxSupportedTransactionVersion: 0 }],
      }),
    });
    const rpc = await response.json() as any;
    if (response.ok && !rpc?.error && rpc?.result) return rpc.result;
    lastError = rpc?.error ?? null;
    await wait(1_500);
  }
  throw new Error(lastError?.message ?? "送金確認を継続しています。しばらく待ってから同じ操作を再試行してください");
}

async function verifyStoredPayment(userId: string, signature: string, expectedAmount: number, purpose: string) {
  await pool.query(`
    INSERT INTO "petPaymentAttempts" ("txId","userId",purpose,"expectedAmount",status)
    VALUES ($1,$2,$3,$4,'pending')
    ON CONFLICT ("txId") DO UPDATE SET "updatedAt"=NOW()
  `, [signature, userId, purpose, expectedAmount]);
  try {
    const payment = await verifyInmuPayment(signature, expectedAmount);
    await pool.query(`UPDATE "petPaymentAttempts" SET status='verified',"lastError"=NULL,"verifiedAt"=NOW(),"updatedAt"=NOW() WHERE "txId"=$1`, [signature]);
    return payment;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`UPDATE "petPaymentAttempts" SET "lastError"=$2,"updatedAt"=NOW() WHERE "txId"=$1`, [signature, message]);
    throw error;
  }
}

async function verifyInmuPayment(signature: string, expectedAmount: number) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,100}$/.test(signature)) throw new Error("TXIDの形式が不正です");
  const transaction = await fetchConfirmedTransaction(signature);
  if (transaction.meta?.err) throw new Error(`送金トランザクションが失敗しています: ${JSON.stringify(transaction.meta.err)}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!transaction.blockTime || Math.abs(nowSeconds - Number(transaction.blockTime)) > 60 * 60) {
    throw new Error("この送金は有効期限を過ぎています");
  }

  const sumForOwner = (balances: any[]) => (balances ?? [])
    .filter(balance => balance?.mint === INMU_MINT && balance?.owner === MANAGEMENT_WALLET)
    .reduce((sum, balance) => sum + BigInt(balance?.uiTokenAmount?.amount ?? "0"), 0n);
  const before = sumForOwner(transaction.meta?.preTokenBalances);
  const after = sumForOwner(transaction.meta?.postTokenBalances);
  const expectedRaw = BigInt(Math.round(expectedAmount * 10 ** INMU_DECIMALS));
  if (after - before !== expectedRaw) throw new Error(`送金額が一致しません（必要: ${expectedAmount.toLocaleString()} INMU）`);

  const accountKeys = transaction.transaction?.message?.accountKeys ?? [];
  const payer = accountKeys.find((key: any) => key?.signer)?.pubkey ?? accountKeys[0]?.pubkey ?? null;
  return { payerWallet: payer ? String(payer) : null };
}

async function addPremiumFood(client: any, userId: string, amount: number) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  const premiumFood = state.premiumFood && typeof state.premiumFood === "object"
    ? state.premiumFood
    : { dailyDate: "", dailyUsed: 0, inventory: 0 };
  state.premiumFood = { ...premiumFood, inventory: Math.max(0, Number(premiumFood.inventory ?? 0)) + amount };
  await client.query(`
    INSERT INTO "userPetStates" ("userId", state, "clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function addSleepTea(client: any, userId: string, amount: number) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  const items = state.items && typeof state.items === "object" ? state.items : { sleepTea: 0 };
  state.items = { ...items, sleepTea: Math.max(0, Number(items.sleepTea ?? 0)) + amount };
  await client.query(`
    INSERT INTO "userPetStates" ("userId",state,"clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function initializeCharacterAtLevelOne(client: any, userId: string, characterId: string) {
  const result = await client.query(`SELECT state FROM "userPetStates" WHERE "userId"=$1 FOR UPDATE`, [userId]);
  const now = Date.now();
  const state = result.rows[0]?.state && typeof result.rows[0].state === "object" ? result.rows[0].state : { version: 5 };
  state.pets = { ...(state.pets ?? {}), [characterId]: { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 10 } };
  state.lastCareAt = { ...(state.lastCareAt ?? {}), [characterId]: { "feed-basic": 0, "feed-premium": 0, "play-yarn": 0, "play-ball": 0, "play-toy": 0, pet: 0 } };
  state.cooldownUntil = { ...(state.cooldownUntil ?? {}), [characterId]: { feed: 0, play: 0 } };
  state.expressions = { ...(state.expressions ?? {}), [characterId]: { kind: "default", until: 0 } };
  state.petting = { ...(state.petting ?? {}), [characterId]: { count: 0, lastAt: 0 } };
  state.sleepStartedAt = { ...(state.sleepStartedAt ?? {}), [characterId]: 0 };
  state.progress = { ...(state.progress ?? {}), [characterId]: { fullnessAt: now, sleepinessAt: now } };
  await client.query(`
    INSERT INTO "userPetStates" ("userId",state,"clientUpdatedAt") VALUES ($1,$2::jsonb,$3)
    ON CONFLICT ("userId") DO UPDATE SET state=EXCLUDED.state,"clientUpdatedAt"=EXCLUDED."clientUpdatedAt","updatedAt"=NOW()
  `, [userId, JSON.stringify(state), now]);
}

async function applyPrizes(client: any, userId: string, rawPrizes: any[]) {
  const results: PetGachaPrize[] = [];
  let totalPoints = 0;
  let premiumFood = 0;
  let sleepTea = 0;
  let inmuCount = 0;
  const pointMultiplier = 1; // ニャルシアン効果はガチャポイントの対象外
  for (const raw of rawPrizes) {
    if (raw.type === "character") {
      const inserted = await client.query(`
        INSERT INTO "userPetCharacters" ("userId","characterId") VALUES ($1,$2)
        ON CONFLICT ("userId","characterId") DO NOTHING RETURNING id
      `, [userId, raw.characterId]);
      const isNew = inserted.rowCount === 1;
      if (isNew) await initializeCharacterAtLevelOne(client, userId, raw.characterId);
      const convertedPoints = isNew ? 0 : DUPLICATE_CHARACTER_POINTS * pointMultiplier;
      if (!isNew) {
        totalPoints += convertedPoints;
        sleepTea += DUPLICATE_CHARACTER_SLEEP_TEA;
      }
      results.push({
        prizeId: raw.id,
        label: isNew ? raw.label : `${raw.label}は既に所持しています。${convertedPoints.toLocaleString()}ポイント＋アイスティー${DUPLICATE_CHARACTER_SLEEP_TEA}個に変換されました。`,
        type: "character",
        amount: 1,
        characterId: raw.characterId,
        isNewCharacter: isNew,
        isDuplicate: !isNew,
        convertedPoints,
        ...(!isNew ? { baseAmount: DUPLICATE_CHARACTER_POINTS, convertedSleepTea: DUPLICATE_CHARACTER_SLEEP_TEA } : {}),
      });
    } else if (raw.type === "premium_food") {
      premiumFood += raw.amount;
      results.push({ prizeId: raw.id, label: raw.label, type: "premium_food", amount: raw.amount });
    } else if (raw.type === "sleep_tea") {
      sleepTea += raw.amount;
      results.push({ prizeId: raw.id, label: raw.label, type: "sleep_tea", amount: raw.amount });
    } else if (raw.type === "inmu") {
      inmuCount += 1;
      results.push({ prizeId: raw.id, label: raw.label, type: "inmu", amount: raw.amount });
    } else {
      const awarded = raw.amount * pointMultiplier;
      totalPoints += awarded;
      results.push({ prizeId: raw.id, label: `${awarded.toLocaleString()}ポイント`, type: "points", amount: awarded, baseAmount: raw.amount });
    }
  }
  if (premiumFood > 0) await addPremiumFood(client, userId, premiumFood);
  if (sleepTea > 0) await addSleepTea(client, userId, sleepTea);
  if (totalPoints > 0) {
    const month = new Date().toISOString().slice(0, 7);
    await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"+$1,"updatedAt"=NOW() WHERE "userId"=$2`, [totalPoints, userId]);
    await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_gacha_reward','INMU PETガチャ報酬',$3)`, [userId, totalPoints, month]);
  }
  return { results, totalPoints, premiumFood, sleepTea, pointMultiplier, inmuCount, hasInmu: inmuCount > 0 };
}

async function getCurrentPoints(client: any, userId: string) {
  const result = await client.query(`SELECT "monthlyPoints" FROM profile WHERE "userId"=$1`, [userId]);
  return Number(result.rows[0]?.monthlyPoints ?? 0);
}

function jstTodayStartUtc(): Date {
  const jstOffset = 9 * 3600 * 1000;
  const nowJst = new Date(Date.now() + jstOffset);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0) - jstOffset);
}

function jstTomorrowStartUtc(): Date {
  const today = jstTodayStartUtc();
  return new Date(today.getTime() + 24 * 3600 * 1000);
}

async function countTodayPointGachaInmuWins(client: any, userId: string) {
  const todayStart = jstTodayStartUtc();
  const result = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM "gachaInmuWins" w
     JOIN "gachaResults" r ON r.id=w."spinId"
     WHERE w."userId"=$1
       AND r."gachaKind"='normal'
       AND r."createdAt">=$2`,
    [userId, todayStart.toISOString()],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function enforcePointGachaDailyInmuLimit(client: any, userId: string, rolled: any[]) {
  const todayWins = await countTodayPointGachaInmuWins(client, userId);
  let remainingInmuWins = Math.max(0, POINT_GACHA_DAILY_INMU_LIMIT - todayWins);
  const adjusted = [];
  for (const prize of rolled) {
    if (prize?.type !== "inmu") {
      adjusted.push(prize);
      continue;
    }
    if (remainingInmuWins > 0) {
      remainingInmuWins -= 1;
      adjusted.push(prize);
      continue;
    }
    adjusted.push(await rollPetPointGachaPrizeWithoutInmu());
  }
  return adjusted;
}

async function getUnusedTdnReroll(client: any, userId: string): Promise<TdnRerollInfo | null> {
  const todayStart = jstTodayStartUtc();
  const existing = await client.query(
    `SELECT "tdnRerollToken","gachaType","pullType"
     FROM "petGachaHistory"
     WHERE "userId"=$1
       AND "tdnRerollGrantedAt">=$2
       AND "tdnRerollToken" IS NOT NULL
       AND "tdnRerollUsedAt" IS NULL
     ORDER BY "tdnRerollGrantedAt" DESC
     LIMIT 1`,
    [userId, todayStart.toISOString()],
  );
  const row = existing.rows[0];
  if (!row?.tdnRerollToken) return null;
  const mode = row.gachaType === "paid" ? "paid" : "points";
  const pullType = (row.pullType === "eleven" ? "eleven" : row.pullType === "multi" ? "multi" : "single") as PullType;
  return { token: String(row.tdnRerollToken), mode, pullType, expiresAt: jstTomorrowStartUtc().toISOString() };
}

async function grantTdnReroll(client: any, userId: string, historyId: number, mode: GachaMode, pullType: PullType): Promise<TdnRerollInfo | null> {
  const tdnSkillActive = await hasActivePetSkill(userId, "tdn");
  if (!tdnSkillActive) return null;
  const unusedReroll = await getUnusedTdnReroll(client, userId);
  if (unusedReroll) return unusedReroll;
  const todayStart = jstTodayStartUtc();
  const todayGrants = await client.query(
    `SELECT COUNT(*)::int AS count FROM "petGachaHistory"
     WHERE "userId"=$1 AND "tdnRerollGrantedAt">=$2`,
    [userId, todayStart.toISOString()],
  );
  if (Number(todayGrants.rows[0]?.count ?? 0) >= TDN_REROLL_DAILY_LIMIT) return null;

  const lastGrant = await client.query(
    `SELECT "tdnRerollGrantedAt" FROM "petGachaHistory"
     WHERE "userId"=$1 AND "tdnRerollGrantedAt" IS NOT NULL
     ORDER BY "tdnRerollGrantedAt" DESC LIMIT 1`,
    [userId],
  );
  const sinceLastGrant = lastGrant.rows[0]?.tdnRerollGrantedAt
    ? new Date(lastGrant.rows[0].tdnRerollGrantedAt).toISOString()
    : "1970-01-01T00:00:00.000Z";
  const attempts = await client.query(
    `SELECT COALESCE(SUM(
       CASE "pullType"
         WHEN 'eleven' THEN 11
         WHEN 'multi' THEN 10
         ELSE 1
       END
     ), 0)::int AS pulls
     FROM "petGachaHistory"
     WHERE "userId"=$1
       AND "tdnRerollSourceId" IS NULL
       AND "createdAt" > $2`,
    [userId, sinceLastGrant],
  );
  const pullsSinceLastGrant = Number(attempts.rows[0]?.pulls ?? 0);
  const guaranteed = pullsSinceLastGrant >= TDN_REROLL_GUARANTEE_PULLS;
  if (!guaranteed && Math.random() >= TDN_REROLL_CHANCE) {
    return null;
  }
  const token = randomUUID();
  await client.query(
    `UPDATE "petGachaHistory" SET "tdnRerollToken"=$1,"tdnRerollGrantedAt"=NOW() WHERE id=$2 AND "userId"=$3`,
    [token, historyId, userId],
  );
  return { token, mode, pullType, expiresAt: jstTomorrowStartUtc().toISOString() };
}

router.get("/pet-commerce/status", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetCommerceTables();
    const [state, slots, history] = await Promise.all([
      pool.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1`, [req.userId!]),
      pool.query(`SELECT "slotNumber","paidInmu","txId","unlockedAt" FROM "petSlotUnlocks" WHERE "userId"=$1 ORDER BY "slotNumber"`, [req.userId!]),
      pool.query(`SELECT id,"gachaType","pullType","costPoints","costInmu","txId",results,"createdAt" FROM "petGachaHistory" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 30`, [req.userId!]),
    ]);
    res.json({ paidPity: Number(state.rows[0]?.paidPity ?? 0), unlockedSlots: 1 + slots.rows.length, slotUnlocks: slots.rows, history: history.rows });
  } catch (error) {
    console.error("[PetCommerce] status", error);
    res.status(500).json({ error: "PETガチャ情報の取得に失敗しました" });
  }
});

router.get("/admin/pet-gacha/history", requireAdmin, async (_req, res): Promise<void> => {
  try {
    await ensurePetCommerceTables();
    const result = await pool.query(`
      SELECT
        h.id,
        h."userId",
        p."displayName",
        p."solWallet",
        h."gachaType",
        h."pullType",
        h."costPoints",
        h."costInmu",
        h."txId",
        h."payerWallet",
        h.results,
        h."tdnRerollGrantedAt",
        h."tdnRerollUsedAt",
        h."tdnRerollSourceId",
        h."createdAt"
      FROM "petGachaHistory" h
      LEFT JOIN profile p ON p."userId" = h."userId"
      ORDER BY h."createdAt" DESC
      LIMIT 200
    `);
    res.json(result.rows.map(row => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
      tdnRerollGrantedAt: row.tdnRerollGrantedAt ? new Date(row.tdnRerollGrantedAt).toISOString() : null,
      tdnRerollUsedAt: row.tdnRerollUsedAt ? new Date(row.tdnRerollUsedAt).toISOString() : null,
    })));
  } catch (error) {
    console.error("[PetCommerce] admin history", error);
    res.status(500).json({ error: "PETガチャ履歴の取得に失敗しました" });
  }
});

router.get("/pet-gacha/config", requireAuth, async (_req, res): Promise<void> => {
  try {
    const config = await getGachaEventConfig();
    res.json(config);
  } catch (error) {
    console.error("[PetCommerce] gacha config", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "ガチャ設定の取得に失敗しました" });
  }
});

router.get("/pet-gacha/free-status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  try {
    await ensurePetCommerceTables();
    const state = await getFreeGachaState(userId);
    const nextReset = jstTomorrowStartUtc().toISOString();
    res.json({
      used: !state.canDrawPaid,
      usedCount: state.paidUsed,
      allowance: 1 + state.sharedBonus,
      remaining: state.paidRemaining,
      baseRemaining: state.paidBaseRemaining,
      sharedRemaining: state.sharedRemaining,
      sharedBonus: state.sharedBonus,
      nextReset,
    });
  } catch (e) {
    console.error("[PetCommerce] free-status error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

router.get("/pet-commerce/inmu-balance", requireAuth, async (req, res): Promise<void> => {
  try {
    await ensurePetCommerceTables();
    const walletResult = await pool.query(`
      SELECT COALESCE(
        NULLIF(p."solWallet", ''),
        (SELECT h."payerWallet" FROM "petGachaHistory" h WHERE h."userId"=$1 AND h."payerWallet" IS NOT NULL ORDER BY h."createdAt" DESC LIMIT 1),
        (SELECT s."payerWallet" FROM "petSlotUnlocks" s WHERE s."userId"=$1 AND s."payerWallet" IS NOT NULL ORDER BY s."unlockedAt" DESC LIMIT 1)
      ) AS wallet
      FROM profile p WHERE p."userId"=$1
    `, [req.userId!]);
    const wallet = String(walletResult.rows[0]?.wallet ?? '');
    if (!wallet) { res.json({ balance: 0, wallet: null }); return; }
    const balance = await fetchInmuBalance(wallet);
    res.json({ balance, wallet });
  } catch (error) {
    console.error("[PetCommerce] INMU balance", error);
    res.status(502).json({ error: "INMU残高を取得できませんでした", balance: 0 });
  }
});

router.post("/pet-gacha/points", requireAuth, async (req, res): Promise<void> => {
  const pullType: PullType = req.body?.pullType === "multi" ? "multi" : "single";
  const count = pullType === "multi" ? 10 : 1;
  const costPoints = pullType === "multi" ? 10_000 : 1_000;
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    await client.query("BEGIN");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`pet-point-gacha-inmu:${req.userId!}`]);
    const currentPoints = await getCurrentPoints(client, req.userId!);
    if (currentPoints < costPoints) throw new Error("ポイントが不足しています");
    await client.query(`UPDATE profile SET "monthlyPoints"="monthlyPoints"-$1,"updatedAt"=NOW() WHERE "userId"=$2`, [costPoints, req.userId!]);
    await client.query(`INSERT INTO points ("userId",amount,type,source,month) VALUES ($1,$2,'pet_gacha_cost','INMU PETポイントガチャ', $3)`, [req.userId!, -costPoints, new Date().toISOString().slice(0, 7)]);
    const rolled = [];
    for (let index = 0; index < count; index += 1) rolled.push(await rollPetGachaPrize("points"));
    const adjustedRolled = await enforcePointGachaDailyInmuLimit(client, req.userId!, rolled);
    const applied = await applyPrizes(client, req.userId!, adjustedRolled);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costPoints",results)
      VALUES ($1,'points',$2,$3,$4::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, pullType, costPoints, JSON.stringify(applied.results)]);
    const wasGuaranteed = Math.random() < POINT_GUARANTEED_EFFECT_RATE;
    const legacySpin = await client.query(`
      INSERT INTO "gachaResults" ("userId","pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","gachaKind")
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',$7,$8,false,'normal') RETURNING id
    `, [req.userId!, pullType, JSON.stringify(applied.results), applied.totalPoints, applied.inmuCount > 0, applied.inmuCount, wasGuaranteed, costPoints]);
    if (applied.inmuCount > 0) {
      for (let index = 0; index < applied.inmuCount; index += 1) {
        await client.query(`INSERT INTO "gachaInmuWins" ("spinId","userId","pullType","inmuAmount","inmuSentStatus") VALUES ($1,$2,$3,10000,'pending')`, [legacySpin.rows[0].id, req.userId!, pullType]);
      }
    }
    const newPoints = await getCurrentPoints(client, req.userId!);
    const tdnReroll = await grantTdnReroll(client, req.userId!, Number(history.rows[0].id), "points", pullType);
    await client.query("COMMIT");
    res.json({ ...applied, costPoints, costInmu: 0, newPoints, historyId: history.rows[0].id, paidPity: null, wasGuaranteed, tdnReroll });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] points gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "ガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-gacha/paid", requireAuth, async (req, res): Promise<void> => {
  const pullType: PullType = req.body?.pullType === "eleven" ? "eleven" : "single";
  const count = pullType === "eleven" ? 11 : 1;
  const costInmu = pullType === "eleven"
    ? await getSystemSettingNumber("gacha_paid_eleven_inmu", 100_000)
    : await getSystemSettingNumber("gacha_paid_single_inmu", 10_000);
  const txId = String(req.body?.txId ?? "").trim();
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const existing = await pool.query(`SELECT "userId",results,"costInmu" FROM "petGachaHistory" WHERE "txId"=$1`, [txId]);
    if (existing.rowCount) {
      if (existing.rows[0].userId !== req.userId) throw new Error("このTXIDは既に使用されています");
      const currentPoints = await getCurrentPoints(client, req.userId!);
      const state = await pool.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1`, [req.userId!]);
      const recoveredResults = Array.isArray(existing.rows[0].results) ? existing.rows[0].results : [];
      const totalPoints = recoveredResults.reduce((sum: number, prize: any) => sum + (prize.type === "points" ? Number(prize.amount ?? 0) : Number(prize.convertedPoints ?? 0)), 0);
      const tdnReroll = await getUnusedTdnReroll(client, req.userId!);
      res.json({ results: recoveredResults, totalPoints, premiumFood: recoveredResults.filter((prize: any) => prize.type === "premium_food").length, hasInmu: false, costPoints: 0, costInmu: Number(existing.rows[0].costInmu), txId, newPoints: currentPoints, paidPity: Number(state.rows[0]?.paidPity ?? 0), recovered: true, tdnReroll });
      return;
    }
    const payment = await verifyStoredPayment(req.userId!, txId, costInmu, `paid-gacha:${pullType}`);
    await client.query("BEGIN");
    const duplicateTx = await client.query(`SELECT id FROM "petGachaHistory" WHERE "txId"=$1`, [txId]);
    if (duplicateTx.rowCount) throw new Error("このTXIDは既に使用されています");
    const state = await client.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1 FOR UPDATE`, [req.userId!]);
    let pity = Number(state.rows[0]?.paidPity ?? 0);
    const ownedCharacterIds = await getOwnedPetCharacterIds(client, req.userId!);
    const rolled: any[] = [];
    for (let index = 0; index < count; index += 1) {
      const guaranteedCharacter = pity >= PAID_GACHA_PITY_PULLS - 1;
      const prize = await rollPetGachaPrize("paid", guaranteedCharacter, guaranteedCharacter ? ownedCharacterIds : undefined);
      rolled.push(prize);
      if (prize.type === "character" && prize.characterId) ownedCharacterIds.add(prize.characterId);
      pity = prize.type === "character" ? 0 : pity + 1;
    }
    const applied = await applyPrizes(client, req.userId!, rolled);
    await client.query(`
      INSERT INTO "petGachaState" ("userId","paidPity") VALUES ($1,$2)
      ON CONFLICT ("userId") DO UPDATE SET "paidPity"=EXCLUDED."paidPity","updatedAt"=NOW()
    `, [req.userId!, pity]);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costInmu","txId","payerWallet",results)
      VALUES ($1,'paid',$2,$3,$4,$5,$6::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, pullType, costInmu, txId, payment.payerWallet, JSON.stringify(applied.results)]);
    const newPoints = await getCurrentPoints(client, req.userId!);
    const tdnReroll = await grantTdnReroll(client, req.userId!, Number(history.rows[0].id), "paid", pullType);
    await client.query("COMMIT");
    res.json({ ...applied, costPoints: 0, costInmu, txId, newPoints, paidPity: pity, historyId: history.rows[0].id, tdnReroll });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] paid gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "INMUガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-gacha/paid-free", requireAuth, async (req, res): Promise<void> => {
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const initialState = await getFreeGachaState(req.userId!);
    if (!initialState.canDrawPaid) {
      res.status(400).json({ error: "本日の無料ガチャは使用済みです" });
      return;
    }
    await client.query("BEGIN");
    const recheckState = await getFreeGachaState(req.userId!);
    if (!recheckState.canDrawPaid) throw new Error("本日の無料ガチャは使用済みです");
    const state = await client.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1 FOR UPDATE`, [req.userId!]);
    let pity = Number(state.rows[0]?.paidPity ?? 0);
    const guaranteedCharacter = pity >= PAID_GACHA_PITY_PULLS - 1;
    const ownedCharacterIds = guaranteedCharacter ? await getOwnedPetCharacterIds(client, req.userId!) : undefined;
    const prize = await rollPetGachaPrize("paid", guaranteedCharacter, ownedCharacterIds);
    pity = prize.type === "character" ? 0 : pity + 1;
    const applied = await applyPrizes(client, req.userId!, [prize]);
    await client.query(`
      INSERT INTO "petGachaState" ("userId","paidPity") VALUES ($1,$2)
      ON CONFLICT ("userId") DO UPDATE SET "paidPity"=EXCLUDED."paidPity","updatedAt"=NOW()
    `, [req.userId!, pity]);
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costInmu",results)
      VALUES ($1,'paid','free',0,$2::jsonb) RETURNING id,"createdAt"
    `, [req.userId!, JSON.stringify(applied.results)]);
    const wasGuaranteed = applied.results.some(prize => prize.type === "character");
    await client.query(`
      INSERT INTO "gachaResults" ("userId","pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","gachaKind")
      VALUES ($1,'free',$2::jsonb,$3,false,0,'pending',$4,0,true,'paid')
    `, [req.userId!, JSON.stringify(applied.results), applied.totalPoints, wasGuaranteed]);
    const newPoints = await getCurrentPoints(client, req.userId!);
    const tdnReroll = await grantTdnReroll(client, req.userId!, Number(history.rows[0].id), "paid", "single");
    await client.query("COMMIT");
    res.json({ ...applied, costPoints: 0, costInmu: 0, txId: null, newPoints, paidPity: pity, historyId: history.rows[0].id, wasGuaranteed, tdnReroll });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] paid free gacha", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "無料ガチャに失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-gacha/tdn-reroll", requireAuth, async (req, res): Promise<void> => {
  const token = String(req.body?.token ?? "").trim();
  if (!token) {
    res.status(400).json({ error: "再抽選トークンがありません" });
    return;
  }
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    await client.query("BEGIN");
    const todayStart = jstTodayStartUtc();
    const source = await client.query(
      `SELECT id,"gachaType","pullType","tdnRerollUsedAt"
       FROM "petGachaHistory"
       WHERE "userId"=$1 AND "tdnRerollToken"=$2 AND "tdnRerollGrantedAt">=$3
       FOR UPDATE`,
      [req.userId!, token, todayStart.toISOString()],
    );
    if (!source.rowCount) throw new Error("再抽選の有効期限が切れています");
    if (source.rows[0].tdnRerollUsedAt) throw new Error("この再抽選は使用済みです");
    if (!await hasActivePetSkill(req.userId!, "tdn")) throw new Error("TDNの固有スキルが有効ではありません");

    const mode = (source.rows[0].gachaType === "paid" ? "paid" : "points") as GachaMode;
    const pullType = (source.rows[0].pullType === "eleven" ? "eleven" : source.rows[0].pullType === "multi" ? "multi" : "single") as PullType;
    const count = pullType === "eleven" ? 11 : pullType === "multi" ? 10 : 1;
    if (mode === "points") {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`pet-point-gacha-inmu:${req.userId!}`]);
    }
    const state = mode === "paid"
      ? await client.query(`SELECT "paidPity" FROM "petGachaState" WHERE "userId"=$1 FOR UPDATE`, [req.userId!])
      : null;
    let pity = Number(state?.rows[0]?.paidPity ?? 0);
    const ownedCharacterIds = mode === "paid" ? await getOwnedPetCharacterIds(client, req.userId!) : undefined;
    const rolled: any[] = [];
    for (let index = 0; index < count; index += 1) {
      const guaranteedCharacter = mode === "paid" && pity >= PAID_GACHA_PITY_PULLS - 1;
      const prize = await rollPetGachaPrize(mode, guaranteedCharacter, guaranteedCharacter ? ownedCharacterIds : undefined);
      rolled.push(prize);
      if (mode === "paid" && prize.type === "character" && prize.characterId) ownedCharacterIds?.add(prize.characterId);
      if (mode === "paid") pity = prize.type === "character" ? 0 : pity + 1;
    }
    const adjustedRolled = mode === "points"
      ? await enforcePointGachaDailyInmuLimit(client, req.userId!, rolled)
      : rolled;
    const applied = await applyPrizes(client, req.userId!, adjustedRolled);
    if (mode === "paid") {
      await client.query(`
        INSERT INTO "petGachaState" ("userId","paidPity") VALUES ($1,$2)
        ON CONFLICT ("userId") DO UPDATE SET "paidPity"=EXCLUDED."paidPity","updatedAt"=NOW()
      `, [req.userId!, pity]);
    }
    const history = await client.query(`
      INSERT INTO "petGachaHistory" ("userId","gachaType","pullType","costPoints","costInmu",results,"tdnRerollSourceId","tdnRerollUsedAt")
      VALUES ($1,$2,$3,0,0,$4::jsonb,$5,NOW()) RETURNING id
    `, [req.userId!, mode, pullType, JSON.stringify(applied.results), source.rows[0].id]);
    await client.query(`UPDATE "petGachaHistory" SET "tdnRerollUsedAt"=NOW() WHERE id=$1`, [source.rows[0].id]);
    if (mode === "points") {
      const legacySpin = await client.query(`
        INSERT INTO "gachaResults" ("userId","pullType",results,"totalPoints","hasInmu","inmuCount","inmuSentStatus","wasGuaranteed","costPoints","isFree","gachaKind")
        VALUES ($1,$2,$3::jsonb,$4,$5,$6,'pending',false,0,false,'normal') RETURNING id
      `, [req.userId!, pullType, JSON.stringify(applied.results), applied.totalPoints, applied.inmuCount > 0, applied.inmuCount]);
      if (applied.inmuCount > 0) {
        for (let index = 0; index < applied.inmuCount; index += 1) {
          await client.query(`INSERT INTO "gachaInmuWins" ("spinId","userId","pullType","inmuAmount","inmuSentStatus") VALUES ($1,$2,$3,10000,'pending')`, [legacySpin.rows[0].id, req.userId!, pullType]);
        }
      }
    }
    const newPoints = await getCurrentPoints(client, req.userId!);
    await client.query("COMMIT");
    const hasCharacter = applied.results.some(prize => prize.type === "character");
    res.json({ ...applied, costPoints: 0, costInmu: 0, txId: null, newPoints, paidPity: mode === "paid" ? pity : null, historyId: history.rows[0].id, wasGuaranteed: hasCharacter, tdnReroll: null });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] tdn reroll", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "再抽選に失敗しました" });
  } finally {
    client.release();
  }
});

router.post("/pet-slots/unlock", requireAuth, async (req, res): Promise<void> => {
  const txId = String(req.body?.txId ?? "").trim();
  const client = await pool.connect();
  try {
    await ensurePetCommerceTables();
    const existing = await pool.query(`SELECT "userId","slotNumber","paidInmu","unlockedAt" FROM "petSlotUnlocks" WHERE "txId"=$1`, [txId]);
    if (existing.rowCount) {
      if (existing.rows[0].userId !== req.userId) throw new Error("このTXIDは既に使用されています");
      res.json({ ok: true, unlockedSlots: Number(existing.rows[0].slotNumber), slotNumber: Number(existing.rows[0].slotNumber), paidInmu: Number(existing.rows[0].paidInmu), txId, unlockedAt: existing.rows[0].unlockedAt, recovered: true });
      return;
    }
    const current = await pool.query(`SELECT COUNT(*)::int AS count FROM "petSlotUnlocks" WHERE "userId"=$1`, [req.userId!]);
    const slotNumber = Number(current.rows[0]?.count ?? 0) + 2;
    if (slotNumber > 3) throw new Error("育成枠は既に最大です");
    const paidInmu = slotNumber === 2
      ? await getSystemSettingNumber("slot_unlock_2_inmu", 1_000_000)
      : await getSystemSettingNumber("slot_unlock_3_inmu", 2_000_000);
    const payment = await verifyStoredPayment(req.userId!, txId, paidInmu, `slot-unlock:${slotNumber}`);
    await client.query("BEGIN");
    const inserted = await client.query(`
      INSERT INTO "petSlotUnlocks" ("userId","slotNumber","paidInmu","txId","payerWallet")
      VALUES ($1,$2,$3,$4,$5) RETURNING "slotNumber","unlockedAt"
    `, [req.userId!, slotNumber, paidInmu, txId, payment.payerWallet]);
    await client.query("COMMIT");
    res.json({ ok: true, unlockedSlots: slotNumber, slotNumber, paidInmu, txId, unlockedAt: inserted.rows[0].unlockedAt });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[PetCommerce] unlock slot", error);
    res.status(400).json({ error: error instanceof Error ? error.message : "育成枠の解放に失敗しました" });
  } finally {
    client.release();
  }
});

export default router;
