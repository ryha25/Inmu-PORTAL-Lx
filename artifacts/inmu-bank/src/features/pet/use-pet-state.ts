import { useEffect, useRef, useState } from 'react'
import { PET_BY_ID, PET_DEFINITIONS, type PetExpression, type PetId } from './pet-data'

const STORAGE_KEY = 'inmu-portal:pet-state:v1'

export type PetStats = {
  level: number
  exp: number
  fullness: number
  sleepiness: number
  affection: number
}

export type PetCareAction = 'feed-basic' | 'feed-premium' | 'play-yarn' | 'play-ball' | 'play-toy' | 'pet'
export type PetCareCategory = 'feed' | 'play'
export type PetExpressionState = { kind: PetExpression; until: number }
export type PettingState = { count: number; lastAt: number }
export type PremiumFoodState = { dailyRemaining: number; inventory: number; totalAvailable: number }
export type PetWalkItem = 'none' | 'takuya_sunglasses' | 'cat_headband'
export type PetWalkRewardType = 'points' | 'sleep_tea' | 'premium_food' | 'takuya_sunglasses' | 'cat_headband' | null
export type PetItemState = { sleepTea: number; takuyaSunglasses: number; catHeadband: number }
export type PetWalkSession = { id: string; petId: PetId; startedAt: number; endsAt: number; item: PetWalkItem }
export type PetWalkResult = {
  id: string
  petId: PetId
  createdAt: number
  exp: number
  sleepiness: number
  rewardType: PetWalkRewardType
  rewardAmount: number
  rewardLabel: string | null
  pointsGrantStatus?: 'pending' | 'granted'
  seen?: boolean
}
export type PetAffectionGift = {
  id: string
  petId: PetId
  createdAt: number
  rewardType: Exclude<PetWalkRewardType, null>
  rewardAmount: number
  rewardLabel: string
  pointsGrantStatus?: 'pending' | 'granted'
  seen?: boolean
}
export type PetWalkState = {
  dailyDate: string
  dailyCount: number
  petDaily: Partial<Record<PetId, string>>
  active: Partial<Record<PetId, PetWalkSession>>
  results: PetWalkResult[]
  depressionUntil: Partial<Record<PetId, number>>
  postDepressionUntil: Partial<Record<PetId, number>>
  depressionMessageUntil: Partial<Record<PetId, number>>
  sleepTeaBlockedDate: Partial<Record<PetId, string>>
}
export type PetCareResult = {
  expression: 'happy' | 'petted' | 'annoyed' | 'angry'
  motion: 'feed' | 'play' | 'pet' | 'angry'
  message: string
  expressionUntil?: number
}

export const PET_PETTING_RESET_MS = 60 * 1000
export const PET_PETTING_ANGER_COUNT = 6
export const PET_ANGER_HOLD_MS = 30 * 1000
export const PET_SLEEP_THRESHOLD = 99
export const PET_SLEEP_PETTING_ANGER_CHANCE = 0.25
export const PET_SLEEP_PETTING_ANGER_COUNT = 3
// ── 2026-07-05: 眠気に応じて「眠る」演出の発生確率を変化させる行動AI改修。
// 眠っている間は経過時間(オフライン含む)ベースで一定量ずつ眠気を回復し、
// 十分回復したら通常行動に戻る。既存の固定30分回復方式から変更。
// 2026-07-05追記: 回復速度を「10秒で1」に調整。表示は小数点以下を出さない(丸め)。
// また、必ずしも眠気0まで眠り続けるわけではなく、入眠時にランダムな「目覚めポイント」を
// 決めておき、そこまで回復したら途中で目が覚めることがある(オフライン経過でも成立する設計)。
export const PET_SLEEP_RECOVERY_PER_10_SEC = 1
export const PET_SLEEP_RECOVERY_PER_SEC = PET_SLEEP_RECOVERY_PER_10_SEC / 10
export const PET_EARLY_NAP_CHECK_MS = 60 * 1000

// 入眠開始時の眠気(startValue)から、ランダムに「ここまで回復したら起きる」しきい値を決める。
// 0に近ければぐっすり眠り、startValueに近ければすぐ目が覚める。
function rollSleepWakeThreshold(startValue: number): number {
  if (startValue <= 0) return 0
  return Math.random() * startValue
}
export const PET_EARLY_NAP_MIN_SLEEPINESS = 45
export const PET_FULLNESS_DECAY_MS = 12 * 60 * 1000
export const PET_SLEEPINESS_GAIN_MS = 10 * 60 * 1000
export const PET_PREMIUM_DAILY_FREE = 3
export const PET_WALK_BASE_DURATION_MS = 60 * 60 * 1000
export const PET_WALK_DAILY_LIMIT = 3
export const PET_WALK_WHIP_DAILY_BONUS = 1
export const PET_WALK_BASE_EXP = 40
export const PET_WALK_BASE_SLEEPINESS = 20
export const PET_WALK_ITEM_CHANCE = 0.35
export const PET_WALK_SUNGLASSES_ITEM_CHANCE = 0.6
export const PET_WALK_DEPRESSION_MS = 60 * 60 * 1000
export const PET_WALK_POST_DEBUFF_MS = 24 * 60 * 60 * 1000
export const PET_WALK_TAKUYA_CAT_EVENT_CHANCE = 0.3
export const PET_AFFECTION_GIFT_INTERVAL = 5
export const PET_AFFECTION_GIFT_CHANCE = 0.35
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 眠気の値から「今この瞬間に眠り始める確率」を算出する。
// 低いうちはほぼ0%、閾値(PET_SLEEP_THRESHOLD)付近では100%に近づく。
export function getSleepChance(sleepiness: number): number {
  if (sleepiness >= PET_SLEEP_THRESHOLD) return 1
  if (sleepiness < PET_EARLY_NAP_MIN_SLEEPINESS) return 0
  const t = (sleepiness - PET_EARLY_NAP_MIN_SLEEPINESS) / (PET_SLEEP_THRESHOLD - PET_EARLY_NAP_MIN_SLEEPINESS)
  return Math.min(0.25, Math.pow(t, 2.4) * 0.25)
}

export type PetLevelCurve = { baseExp: number; perLevelExp: number }
// Eased progression (2026-07-03): reduced required EXP across all levels to make leveling less grindy.
export const DEFAULT_PET_LEVEL_CURVE: PetLevelCurve = { baseExp: 48, perLevelExp: 36 }
export const PET_LEVEL_CURVES: Partial<Record<PetId, PetLevelCurve>> = {}

export function getRequiredPetExp(level: number, petId: PetId) {
  const curve = PET_LEVEL_CURVES[petId] ?? DEFAULT_PET_LEVEL_CURVE
  return curve.baseExp + Math.max(0, level - 1) * curve.perLevelExp
}

export const PET_CARE_CONFIG: Record<PetCareAction, {
  category: PetCareCategory | 'pet'
  cooldownMs: number
  fullness: number
  exp: number
  affection: number
  sleepiness: number
}> = {
  'feed-basic': { category: 'feed', cooldownMs: 10 * 60 * 1000, fullness: 20, exp: 10, affection: 1, sleepiness: 0 },
  'feed-premium': { category: 'feed', cooldownMs: 0, fullness: 40, exp: 30, affection: 2, sleepiness: 0 },
  'play-yarn': { category: 'play', cooldownMs: 10 * 60 * 1000, fullness: 0, exp: 10, affection: 1, sleepiness: 5 },
  'play-ball': { category: 'play', cooldownMs: 20 * 60 * 1000, fullness: 0, exp: 20, affection: 1, sleepiness: 10 },
  'play-toy': { category: 'play', cooldownMs: 30 * 60 * 1000, fullness: 0, exp: 30, affection: 1, sleepiness: 15 },
  pet: { category: 'pet', cooldownMs: 0, fullness: 0, exp: 2, affection: 1, sleepiness: 0 },
}

type PetActionTimes = Record<PetCareAction, number>
type PetCooldownUntil = Record<PetCareCategory, number>
type PetProgressState = { fullnessAt: number; sleepinessAt: number }
type PremiumFoodSave = { dailyDate: string; dailyUsed: number; inventory: number }
type PetInventorySnapshot = { sleepTea: number; premiumInventory: number; takuyaSunglasses: number; catHeadband: number }

type PetSaveData = {
  version: 5 | 6 | 7 | 8
  selectedPetId: PetId
  activePetIds: PetId[]
  pets: Record<PetId, PetStats>
  lastCareAt: Record<PetId, PetActionTimes>
  cooldownUntil: Record<PetId, PetCooldownUntil>
  expressions: Record<PetId, PetExpressionState>
  petting: Record<PetId, PettingState>
  sleepStartedAt: Record<PetId, number>
  // 眠り始めた瞬間の眠気の値。1秒あたりPET_SLEEP_RECOVERY_PER_SECずつの回復計算の起点として使う。
  sleepStartValue: Record<PetId, number>
  // 入眠時に決めた「ここまで回復したら起きる」しきい値(0〜sleepStartValue)。必ずしも0まで眠るとは限らない。
  sleepWakeAt: Record<PetId, number>
  progress: Record<PetId, PetProgressState>
  premiumFood: PremiumFoodSave
  items: PetItemState
  walks: PetWalkState
  hungerAffectionPenaltyAt: Record<PetId, number>
  affectionGiftProgress: Record<PetId, number>
  affectionGifts: PetAffectionGift[]
  skillGiftProgress: Record<PetId, number>
  skillState: Record<PetId, boolean>
  skillActiveCharacterIds: PetId[]
}

type LegacySaveData = Partial<PetSaveData> & {
  lastCareAt?: Record<PetId, Record<string, number>>
}

const DEFAULT_STATS: PetStats = { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 50 }
const EMPTY_ACTION_TIMES: PetActionTimes = { 'feed-basic': 0, 'feed-premium': 0, 'play-yarn': 0, 'play-ball': 0, 'play-toy': 0, pet: 0 }
const EMPTY_COOLDOWNS: PetCooldownUntil = { feed: 0, play: 0 }
const VALID_EXPRESSIONS = new Set<PetExpression>(['default', 'blink', 'happy', 'sleepy', 'hungry', 'petted', 'affectionate', 'annoyed', 'angry'])

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeStats(value: Partial<PetStats> | undefined, petId: PetId): PetStats {
  const maxLevel = PET_BY_ID[petId].maxLevel
  const level = clamp(readNumber(value?.level, DEFAULT_STATS.level), 1, maxLevel)
  return {
    level,
    exp: level >= maxLevel ? 0 : clamp(readNumber(value?.exp, DEFAULT_STATS.exp), 0, getRequiredPetExp(level, petId) - 1),
    fullness: clamp(readNumber(value?.fullness, DEFAULT_STATS.fullness)),
    sleepiness: clamp(readNumber(value?.sleepiness, DEFAULT_STATS.sleepiness)),
    affection: clamp(readNumber(value?.affection, DEFAULT_STATS.affection)),
  }
}

function sanitizeExpression(value: Partial<PetExpressionState> | undefined): PetExpressionState {
  const kind = VALID_EXPRESSIONS.has(value?.kind as PetExpression) ? value!.kind as PetExpression : 'default'
  const until = Math.max(0, readNumber(value?.until, 0))
  return until > Date.now() ? { kind, until } : { kind: 'default', until: 0 }
}

function sanitizeActionTimes(value: Record<string, number> | undefined): PetActionTimes {
  return {
    'feed-basic': Math.max(0, readNumber(value?.['feed-basic'] ?? value?.feed, 0)),
    'feed-premium': Math.max(0, readNumber(value?.['feed-premium'], 0)),
    'play-yarn': Math.max(0, readNumber(value?.['play-yarn'] ?? value?.play, 0)),
    'play-ball': Math.max(0, readNumber(value?.['play-ball'], 0)),
    'play-toy': Math.max(0, readNumber(value?.['play-toy'], 0)),
    pet: Math.max(0, readNumber(value?.pet, 0)),
  }
}

function sanitizePetIdList(value: unknown): PetId[] {
  return Array.isArray(value)
    ? value.filter((id, index, list): id is PetId => Boolean(PET_BY_ID[id as PetId]) && list.indexOf(id) === index).slice(0, 3)
    : []
}

function getJstDateKey(timestamp = Date.now()) {
  return new Date(timestamp + JST_OFFSET_MS).toISOString().slice(0, 10)
}

function getJstDayStartMs(timestamp = Date.now()) {
  const shifted = new Date(timestamp + JST_OFFSET_MS)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JST_OFFSET_MS
}

function countJstMidnightsBetween(from: number, to: number) {
  if (to <= from) return 0
  const first = getJstDayStartMs(from) + DAY_MS
  const last = getJstDayStartMs(to)
  return last >= first ? Math.floor((last - first) / DAY_MS) + 1 : 0
}

function createPetNumberRecord(value = 0): Record<PetId, number> {
  return Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, value])) as Record<PetId, number>
}

function sanitizePetNumberRecord(value: Partial<Record<PetId, number>> | undefined, fallback = 0): Record<PetId, number> {
  return Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, Math.max(0, readNumber(value?.[pet.id], fallback))])) as Record<PetId, number>
}

export function getAffectionExpMultiplier(affection: number) {
  if (affection >= 100) return 1.3
  if (affection >= 80) return 1.2
  if (affection >= 50) return 1.1
  if (affection >= 20) return 1
  return 0.8
}

function getAffectionWalkRewardMultiplier(affection: number) {
  if (affection >= 100) return 1.5
  if (affection >= 80) return 1.35
  if (affection >= 50) return 1.15
  if (affection >= 20) return 1
  return 0.65
}

function getModifiedExp(baseExp: number, affection: number, postDebuffActive: boolean) {
  if (baseExp <= 0) return 0
  return Math.max(1, Math.floor(baseExp * getAffectionExpMultiplier(affection) * (postDebuffActive ? 0.5 : 1)))
}

function getModifiedAffection(baseAffection: number, postDebuffActive: boolean) {
  if (baseAffection <= 0) return baseAffection
  return Math.max(0, Math.floor(baseAffection * (postDebuffActive ? 0.5 : 1)))
}

function createDefaultWalkState(now = Date.now()): PetWalkState {
  return {
    dailyDate: getJstDateKey(now),
    dailyCount: 0,
    petDaily: {},
    active: {},
    results: [],
    depressionUntil: {},
    postDepressionUntil: {},
    depressionMessageUntil: {},
    sleepTeaBlockedDate: {},
  }
}

function readItemNumber(value: Partial<PetItemState> | Record<string, unknown> | undefined, camelKey: keyof PetItemState, snakeKey: string) {
  const record = value as Record<string, unknown> | undefined
  return Math.max(0, Math.floor(readNumber(record?.[camelKey] ?? record?.[snakeKey], 0)))
}

function sanitizeItems(value: Partial<PetItemState> | Record<string, unknown> | undefined): PetItemState {
  return {
    sleepTea: readItemNumber(value, 'sleepTea', 'sleep_tea'),
    takuyaSunglasses: readItemNumber(value, 'takuyaSunglasses', 'takuya_sunglasses'),
    catHeadband: readItemNumber(value, 'catHeadband', 'cat_headband'),
  }
}

function sanitizeWalkItem(value: unknown): PetWalkItem {
  return value === 'takuya_sunglasses' || value === 'cat_headband' ? value : 'none'
}

function sanitizeWalkSession(petId: PetId, value: unknown, now = Date.now()): PetWalkSession | null {
  if (!value || typeof value !== 'object') return null
  const session = value as Partial<PetWalkSession>
  const startedAt = Math.max(0, readNumber(session.startedAt, now))
  const fallbackEndsAt = startedAt + PET_WALK_BASE_DURATION_MS
  const endsAt = Math.max(startedAt, readNumber(session.endsAt, fallbackEndsAt))
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt)) return null
  return {
    id: String(session.id ?? `walk-${petId}-${startedAt}`),
    petId,
    startedAt,
    endsAt,
    item: sanitizeWalkItem(session.item),
  }
}

function sanitizeWalks(value: Partial<PetWalkState> | undefined, now = Date.now()): PetWalkState {
  const today = getJstDateKey(now)
  const sameDay = value?.dailyDate === today
  const active = Object.fromEntries(
    Object.entries(value?.active ?? {}).flatMap(([id, session]) => {
      if (!PET_BY_ID[id as PetId]) return []
      const sanitized = sanitizeWalkSession(id as PetId, session, now)
      return sanitized ? [[id, sanitized]] : []
    }),
  ) as Partial<Record<PetId, PetWalkSession>>
  return {
    dailyDate: today,
    dailyCount: sameDay ? clamp(readNumber(value?.dailyCount, 0), 0, PET_WALK_DAILY_LIMIT + PET_WALK_WHIP_DAILY_BONUS) : 0,
    petDaily: sameDay && value?.petDaily && typeof value.petDaily === 'object' ? { ...value.petDaily } : {},
    active,
    results: Array.isArray(value?.results)
      ? value.results.filter(result => result && typeof result === 'object').slice(-8).map(result => ({
          id: String(result.id ?? `walk-${now}`),
          petId: PET_BY_ID[result.petId as PetId] ? result.petId as PetId : PET_DEFINITIONS[0].id,
          createdAt: Math.max(0, readNumber(result.createdAt, now)),
          exp: Math.max(0, Math.floor(readNumber(result.exp, 0))),
          sleepiness: Math.max(0, Math.floor(readNumber(result.sleepiness, 0))),
          rewardType: result.rewardType === 'points' || result.rewardType === 'sleep_tea' || result.rewardType === 'premium_food' || result.rewardType === 'takuya_sunglasses' || result.rewardType === 'cat_headband' ? result.rewardType : null,
          rewardAmount: Math.max(0, Math.floor(readNumber(result.rewardAmount, 0))),
          rewardLabel: result.rewardLabel ? String(result.rewardLabel) : null,
          pointsGrantStatus: result.pointsGrantStatus === 'granted' ? 'granted' : result.rewardType === 'points' ? 'pending' : undefined,
          seen: result.seen === true,
        }))
      : [],
    depressionUntil: { ...(value?.depressionUntil ?? {}) },
    postDepressionUntil: { ...(value?.postDepressionUntil ?? {}) },
    depressionMessageUntil: { ...(value?.depressionMessageUntil ?? {}) },
    sleepTeaBlockedDate: { ...(value?.sleepTeaBlockedDate ?? {}) },
  }
}

function sanitizePremiumFood(value: Partial<PremiumFoodSave> | undefined, now = Date.now()): PremiumFoodSave {
  const today = getJstDateKey(now)
  return {
    dailyDate: today,
    dailyUsed: value?.dailyDate === today ? clamp(readNumber(value.dailyUsed, 0), 0, PET_PREMIUM_DAILY_FREE) : 0,
    inventory: Math.max(0, Math.floor(readNumber(value?.inventory, 0))),
  }
}

function getPremiumFoodState(value: PremiumFoodSave, now = Date.now()): PremiumFoodState {
  const normalized = sanitizePremiumFood(value, now)
  const dailyRemaining = Math.max(0, PET_PREMIUM_DAILY_FREE - normalized.dailyUsed)
  return { dailyRemaining, inventory: normalized.inventory, totalAvailable: dailyRemaining + normalized.inventory }
}

function getInventorySnapshot(save: PetSaveData): PetInventorySnapshot {
  const items = sanitizeItems(save.items)
  const premiumFood = sanitizePremiumFood(save.premiumFood)
  return {
    sleepTea: items.sleepTea,
    premiumInventory: premiumFood.inventory,
    takuyaSunglasses: items.takuyaSunglasses,
    catHeadband: items.catHeadband,
  }
}

function sameInventorySnapshot(a: PetInventorySnapshot | null | undefined, b: PetInventorySnapshot | null | undefined) {
  if (!a || !b) return false
  return a.sleepTea === b.sleepTea
    && a.premiumInventory === b.premiumInventory
    && a.takuyaSunglasses === b.takuyaSunglasses
    && a.catHeadband === b.catHeadband
}

function createDefaultSave(): PetSaveData {
  const now = Date.now()
  return {
    version: 8,
    selectedPetId: PET_DEFINITIONS[0].id,
    activePetIds: [],
    pets: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...DEFAULT_STATS }])) as Record<PetId, PetStats>,
    lastCareAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_ACTION_TIMES }])) as Record<PetId, PetActionTimes>,
    cooldownUntil: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_COOLDOWNS }])) as Record<PetId, PetCooldownUntil>,
    expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { kind: 'default', until: 0 }])) as Record<PetId, PetExpressionState>,
    petting: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { count: 0, lastAt: 0 }])) as Record<PetId, PettingState>,
    sleepStartedAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, 0])) as Record<PetId, number>,
    sleepStartValue: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, 0])) as Record<PetId, number>,
    sleepWakeAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, 0])) as Record<PetId, number>,
    progress: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { fullnessAt: now, sleepinessAt: now }])) as Record<PetId, PetProgressState>,
    premiumFood: { dailyDate: getJstDateKey(now), dailyUsed: 0, inventory: 0 },
    items: { sleepTea: 0, takuyaSunglasses: 0, catHeadband: 0 },
    walks: createDefaultWalkState(now),
    hungerAffectionPenaltyAt: createPetNumberRecord(now),
    affectionGiftProgress: createPetNumberRecord(0),
    affectionGifts: [],
    skillGiftProgress: createPetNumberRecord(0),
    skillState: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, true])) as Record<PetId, boolean>,
    skillActiveCharacterIds: [],
  }
}

function loadSave(source?: unknown): PetSaveData {
  const fallback = createDefaultSave()
  try {
    const parsed = (source && typeof source === 'object'
      ? source
      : JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')) as LegacySaveData
    const validSelection = PET_DEFINITIONS.some(pet => pet.id === parsed.selectedPetId)
    const activePetIds = sanitizePetIdList(parsed.activePetIds)
    const pets = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(parsed.pets?.[pet.id], pet.id)])) as Record<PetId, PetStats>
    const lastCareAt = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeActionTimes(parsed.lastCareAt?.[pet.id])])) as Record<PetId, PetActionTimes>
    return {
      version: 8,
      selectedPetId: validSelection ? parsed.selectedPetId! : fallback.selectedPetId,
      activePetIds,
      pets,
      lastCareAt,
      cooldownUntil: Object.fromEntries(PET_DEFINITIONS.map(pet => {
        const saved = parsed.cooldownUntil?.[pet.id]
        const legacy = parsed.lastCareAt?.[pet.id]
        return [pet.id, {
          feed: Math.max(0, readNumber(saved?.feed, legacy?.feed ? legacy.feed + 10 * 60 * 1000 : 0)),
          play: Math.max(0, readNumber(saved?.play, legacy?.play ? legacy.play + 10 * 60 * 1000 : 0)),
        }]
      })) as Record<PetId, PetCooldownUntil>,
      expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeExpression(parsed.expressions?.[pet.id])])) as Record<PetId, PetExpressionState>,
      petting: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, {
        count: Math.max(0, readNumber(parsed.petting?.[pet.id]?.count, 0)),
        lastAt: Math.max(0, readNumber(parsed.petting?.[pet.id]?.lastAt, 0)),
      }])) as Record<PetId, PettingState>,
      sleepStartedAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, Math.max(0, readNumber(parsed.sleepStartedAt?.[pet.id], pets[pet.id].sleepiness >= PET_SLEEP_THRESHOLD ? Date.now() : 0))])) as Record<PetId, number>,
      sleepStartValue: Object.fromEntries(PET_DEFINITIONS.map(pet => {
        const savedAt = Math.max(0, readNumber(parsed.sleepStartedAt?.[pet.id], 0))
        const fallbackValue = savedAt > 0 ? pets[pet.id].sleepiness : 0
        return [pet.id, clamp(readNumber(parsed.sleepStartValue?.[pet.id], fallbackValue))]
      })) as Record<PetId, number>,
      // 旧セーブにこのフィールドが無い場合は0(=起きるまで満回復)にフォールバックし、既存の挙動を壊さない。
      sleepWakeAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, Math.max(0, readNumber(parsed.sleepWakeAt?.[pet.id], 0))])) as Record<PetId, number>,
      progress: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, {
        fullnessAt: Math.max(0, readNumber(parsed.progress?.[pet.id]?.fullnessAt, Date.now())),
        sleepinessAt: Math.max(0, readNumber(parsed.progress?.[pet.id]?.sleepinessAt, Date.now())),
      }])) as Record<PetId, PetProgressState>,
      premiumFood: sanitizePremiumFood(parsed.premiumFood),
      items: sanitizeItems(parsed.items),
      walks: sanitizeWalks(parsed.walks),
      hungerAffectionPenaltyAt: sanitizePetNumberRecord(parsed.hungerAffectionPenaltyAt, Date.now()),
      affectionGiftProgress: sanitizePetNumberRecord(parsed.affectionGiftProgress, 0),
      affectionGifts: Array.isArray(parsed.affectionGifts)
        ? parsed.affectionGifts.filter(gift => gift && typeof gift === 'object').slice(-8).map(gift => ({
            id: String(gift.id ?? `affection-${Date.now()}`),
            petId: PET_BY_ID[gift.petId as PetId] ? gift.petId as PetId : PET_DEFINITIONS[0].id,
            createdAt: Math.max(0, readNumber(gift.createdAt, Date.now())),
            rewardType: gift.rewardType === 'points' || gift.rewardType === 'sleep_tea' || gift.rewardType === 'premium_food' || gift.rewardType === 'takuya_sunglasses' || gift.rewardType === 'cat_headband' ? gift.rewardType : 'premium_food',
            rewardAmount: Math.max(1, Math.floor(readNumber(gift.rewardAmount, 1))),
            rewardLabel: String(gift.rewardLabel ?? ''),
            pointsGrantStatus: gift.pointsGrantStatus === 'granted' ? 'granted' : gift.rewardType === 'points' ? 'pending' : undefined,
            seen: gift.seen === true,
          }))
        : [],
      skillGiftProgress: sanitizePetNumberRecord(parsed.skillGiftProgress, 0),
      skillState: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, parsed.skillState?.[pet.id] !== false])) as Record<PetId, boolean>,
      skillActiveCharacterIds: (() => {
        const legacySingle = (parsed as { skillActiveCharacterId?: unknown }).skillActiveCharacterId
        const rawList = Array.isArray(parsed.skillActiveCharacterIds)
          ? parsed.skillActiveCharacterIds
          : legacySingle != null ? [legacySingle] : []
        return sanitizePetIdList(rawList)
      })(),
    }
  } catch {
    return fallback
  }
}

function addExp(stats: PetStats, amount: number, petId: PetId): PetStats {
  if (PET_BY_ID[petId].experienceMode === 'evolved-training-only') return stats
  const maxLevel = PET_BY_ID[petId].maxLevel
  if (stats.level >= maxLevel) return { ...stats, level: maxLevel, exp: 0 }
  let level = stats.level
  let exp = stats.exp + amount
  while (level < maxLevel && exp >= getRequiredPetExp(level, petId)) {
    exp -= getRequiredPetExp(level, petId)
    level += 1
  }
  return { ...stats, level, exp: level >= maxLevel ? 0 : exp }
}

function rollRewardItem(): Pick<PetWalkResult, 'rewardType' | 'rewardAmount' | 'rewardLabel'> {
  const candidates = ['points', 'sleep_tea', 'premium_food', 'takuya_sunglasses', 'cat_headband'] as const
  const rewardType = candidates[Math.floor(Math.random() * candidates.length)]
  if (rewardType === 'points') {
    const amount = (Math.floor(Math.random() * 50) + 1) * 100
    return { rewardType, rewardAmount: amount, rewardLabel: `${amount.toLocaleString('ja-JP')}ポイント` }
  }
  if (rewardType === 'sleep_tea') return { rewardType, rewardAmount: 1, rewardLabel: 'アイスティー（睡眠薬入り）' }
  if (rewardType === 'premium_food') return { rewardType, rewardAmount: 1, rewardLabel: '高級ごはん' }
  if (rewardType === 'takuya_sunglasses') return { rewardType, rewardAmount: 1, rewardLabel: '拓也のサングラス' }
  return { rewardType, rewardAmount: 1, rewardLabel: '猫のカチューシャ' }
}

function rollWalkReward(item: PetWalkItem, affection: number, hasWhipSkill: boolean): Pick<PetWalkResult, 'rewardType' | 'rewardAmount' | 'rewardLabel'> {
  const baseChance = item === 'takuya_sunglasses' ? PET_WALK_SUNGLASSES_ITEM_CHANCE : PET_WALK_ITEM_CHANCE
  const chance = Math.min(0.9, baseChance * getAffectionWalkRewardMultiplier(affection) * (hasWhipSkill ? 2 : 1))
  if (Math.random() >= chance) return { rewardType: null, rewardAmount: 0, rewardLabel: null }
  return rollRewardItem()
}

function isPetSkillActive(save: Pick<PetSaveData, 'skillActiveCharacterIds' | 'activePetIds'>, petId: PetId): boolean {
  const skillIds = sanitizePetIdList(save.skillActiveCharacterIds)
  return skillIds.includes(petId)
}

function rollAffectionGift(petId: PetId, now: number): PetAffectionGift | null {
  if (Math.random() >= PET_AFFECTION_GIFT_CHANCE) return null
  const reward = rollRewardItem()
  if (!reward.rewardType || !reward.rewardLabel) return null
  return {
    id: `affection-${petId}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    petId,
    createdAt: now,
    rewardType: reward.rewardType,
    rewardAmount: reward.rewardAmount,
    rewardLabel: reward.rewardLabel,
    pointsGrantStatus: reward.rewardType === 'points' ? 'pending' : undefined,
    seen: false,
  }
}

function rollShikoirukaSkillGift(now: number): PetAffectionGift {
  const roll = Math.random()
  const count = Math.floor(Math.random() * 3) + 1
  if (roll < 0.02) {
    return {
      id: `affection-shikoiruka-skill-${now}-${Math.random().toString(36).slice(2, 8)}`,
      petId: 'shikoiruka',
      createdAt: now,
      rewardType: 'sleep_tea',
      rewardAmount: 1,
      rewardLabel: 'アイスティー（睡眠薬入り）',
      seen: false,
    }
  }
  if (roll < 0.18) {
    const amount = (Math.floor(Math.random() * 5) + 1) * 100
    return {
      id: `affection-shikoiruka-skill-${now}-${Math.random().toString(36).slice(2, 8)}`,
      petId: 'shikoiruka',
      createdAt: now,
      rewardType: 'points',
      rewardAmount: amount,
      rewardLabel: `${amount.toLocaleString('ja-JP')}ポイント`,
      pointsGrantStatus: 'pending',
      seen: false,
    }
  }
  if (roll < 0.46) {
    return {
      id: `affection-shikoiruka-skill-${now}-${Math.random().toString(36).slice(2, 8)}`,
      petId: 'shikoiruka',
      createdAt: now,
      rewardType: 'takuya_sunglasses',
      rewardAmount: count,
      rewardLabel: `拓也のサングラス ×${count}`,
      seen: false,
    }
  }
  if (roll < 0.74) {
    return {
      id: `affection-shikoiruka-skill-${now}-${Math.random().toString(36).slice(2, 8)}`,
      petId: 'shikoiruka',
      createdAt: now,
      rewardType: 'cat_headband',
      rewardAmount: count,
      rewardLabel: `猫のカチューシャ ×${count}`,
      seen: false,
    }
  }
  return {
    id: `affection-shikoiruka-skill-${now}-${Math.random().toString(36).slice(2, 8)}`,
    petId: 'shikoiruka',
    createdAt: now,
    rewardType: 'premium_food',
    rewardAmount: count,
    rewardLabel: `高級ごはん ×${count}`,
    seen: false,
  }
}

function rollShikoirukaSkillGiftAfterCare(
  save: Pick<PetSaveData, 'skillActiveCharacterIds' | 'activePetIds'>,
  progress: Record<PetId, number>,
  gifts: PetAffectionGift[],
  now: number,
) {
  const nextProgress = { ...progress }
  let nextGifts = gifts
  let gift: PetAffectionGift | null = null
  if (isPetSkillActive(save, 'shikoiruka')) {
    const count = (nextProgress.shikoiruka ?? 0) + 1
    const shouldTrigger = count >= 5 || (count >= 4 && Math.random() < 0.5)
    if (shouldTrigger) {
      nextProgress.shikoiruka = 0
      gift = rollShikoirukaSkillGift(now)
      nextGifts = [...nextGifts, gift].slice(-8)
    } else {
      nextProgress.shikoiruka = count
    }
  } else {
    nextProgress.shikoiruka = 0
  }
  return { progress: nextProgress, gifts: nextGifts, gift }
}

function applyRewardToInventory(
  reward: Pick<PetWalkResult, 'rewardType' | 'rewardAmount'> | PetAffectionGift,
  items: PetItemState,
  premiumFood: PremiumFoodSave,
) {
  const nextItems = { ...items }
  let nextPremiumFood = premiumFood
  if (reward.rewardType === 'sleep_tea') nextItems.sleepTea += reward.rewardAmount
  if (reward.rewardType === 'premium_food') nextPremiumFood = { ...nextPremiumFood, inventory: nextPremiumFood.inventory + reward.rewardAmount }
  if (reward.rewardType === 'takuya_sunglasses') nextItems.takuyaSunglasses += reward.rewardAmount
  if (reward.rewardType === 'cat_headband') nextItems.catHeadband += reward.rewardAmount
  return { items: nextItems, premiumFood: nextPremiumFood }
}

function rollAffectionGiftAfterCare(
  petId: PetId,
  affection: number,
  progress: Record<PetId, number>,
  gifts: PetAffectionGift[],
  now: number,
) {
  const nextProgress = { ...progress }
  let nextGifts = gifts
  let gift: PetAffectionGift | null = null
  if (affection >= 100) {
    const count = (nextProgress[petId] ?? 0) + 1
    if (count >= PET_AFFECTION_GIFT_INTERVAL) {
      nextProgress[petId] = 0
      gift = rollAffectionGift(petId, now)
      if (gift) nextGifts = [...nextGifts, gift].slice(-8)
    } else {
      nextProgress[petId] = count
    }
  } else {
    nextProgress[petId] = 0
  }
  return { progress: nextProgress, gifts: nextGifts, gift }
}

function materializeSaveAt(save: PetSaveData, now: number): PetSaveData {
  const selectedPetId = PET_BY_ID[save.selectedPetId] ? save.selectedPetId : PET_DEFINITIONS[0].id
  const activePetIds = sanitizePetIdList(save.activePetIds)
  const skillActiveCharacterIds = sanitizePetIdList(save.skillActiveCharacterIds)
  const pets = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(save.pets?.[pet.id], pet.id)])) as Record<PetId, PetStats>
  const lastCareAt = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeActionTimes(save.lastCareAt?.[pet.id])])) as Record<PetId, PetActionTimes>
  const cooldownUntil = Object.fromEntries(PET_DEFINITIONS.map(pet => {
    const saved = save.cooldownUntil?.[pet.id]
    return [pet.id, {
      feed: Math.max(0, readNumber(saved?.feed, 0)),
      play: Math.max(0, readNumber(saved?.play, 0)),
    }]
  })) as Record<PetId, PetCooldownUntil>
  const expressions = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeExpression(save.expressions?.[pet.id])])) as Record<PetId, PetExpressionState>
  const petting = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, {
    count: Math.max(0, readNumber(save.petting?.[pet.id]?.count, 0)),
    lastAt: Math.max(0, readNumber(save.petting?.[pet.id]?.lastAt, 0)),
  }])) as Record<PetId, PettingState>
  const progress = Object.fromEntries(PET_DEFINITIONS.map(pet => {
    const savedProgress = save.progress?.[pet.id]
    return [pet.id, {
      fullnessAt: Math.max(0, readNumber(savedProgress?.fullnessAt, now)),
      sleepinessAt: Math.max(0, readNumber(savedProgress?.sleepinessAt, now)),
    }]
  })) as Record<PetId, PetProgressState>
  const sleepStartedAt = { ...sanitizePetNumberRecord(save.sleepStartedAt, 0) }
  const sleepStartValue = { ...sanitizePetNumberRecord(save.sleepStartValue, 0) }
  const sleepWakeAt = { ...sanitizePetNumberRecord(save.sleepWakeAt, 0) }
  const items = { ...sanitizeItems(save.items) }
  const walks = sanitizeWalks(save.walks, now)
  const hungerAffectionPenaltyAt = { ...sanitizePetNumberRecord(save.hungerAffectionPenaltyAt, now) }
  let affectionGiftProgress = { ...sanitizePetNumberRecord(save.affectionGiftProgress, 0) }
  let affectionGifts = Array.isArray(save.affectionGifts) ? save.affectionGifts.slice(-8) : []
  let skillGiftProgress = { ...sanitizePetNumberRecord(save.skillGiftProgress, 0) }
  let premiumFood = sanitizePremiumFood(save.premiumFood, now)
  const skillState = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, save.skillState?.[pet.id] !== false])) as Record<PetId, boolean>

  PET_DEFINITIONS.forEach(pet => {
    const id = pet.id
    const stats = pets[id]
    const currentProgress = progress[id]
    const fullnessSteps = Math.max(0, Math.floor((now - currentProgress.fullnessAt) / PET_FULLNESS_DECAY_MS))
    const nextProgress: PetProgressState = {
      fullnessAt: currentProgress.fullnessAt + fullnessSteps * PET_FULLNESS_DECAY_MS,
      sleepinessAt: currentProgress.sleepinessAt,
    }
    let nextStats = { ...stats, fullness: clamp(stats.fullness - fullnessSteps) }
    if (nextStats.fullness <= 0) {
      const zeroReachedAt = stats.fullness <= 0
        ? currentProgress.fullnessAt
        : currentProgress.fullnessAt + Math.max(0, stats.fullness) * PET_FULLNESS_DECAY_MS
      const penaltyBase = Math.max(hungerAffectionPenaltyAt[id] ?? 0, zeroReachedAt)
      const penaltyDays = countJstMidnightsBetween(penaltyBase, now)
      if (penaltyDays > 0) {
        nextStats = { ...nextStats, affection: clamp(nextStats.affection - penaltyDays * 30) }
        hungerAffectionPenaltyAt[id] = getJstDayStartMs(now)
      }
    } else {
      hungerAffectionPenaltyAt[id] = now
    }
    const depressionActive = (walks.depressionUntil[id] ?? 0) > now

    if (depressionActive) {
      nextStats = { ...nextStats, sleepiness: 100 }
      nextProgress.sleepinessAt = now
      sleepStartedAt[id] = now
      sleepStartValue[id] = 100
      sleepWakeAt[id] = 0
    } else if (sleepStartedAt[id] > 0) {
      // ── 眠っている間は、経過時間(オフラインでの経過分も含む)に応じて
      // 「10秒で1」ずつ眠気を回復させる。入眠時に決めたsleepWakeAt(0〜startValue)まで
      // 回復したら起床する(必ずしも0まで眠るとは限らない)。以降は通常の眠気蓄積に戻る。
      const startValue = sleepStartValue[id] ?? stats.sleepiness
      const wakeThreshold = clamp(sleepWakeAt[id] ?? 0, 0, startValue)
      const elapsedSec = Math.max(0, (now - sleepStartedAt[id]) / 1000)
      const recovered = elapsedSec * PET_SLEEP_RECOVERY_PER_SEC
      const currentSleepiness = startValue - recovered
      if (currentSleepiness <= wakeThreshold) {
        const recoveryDurationMs = ((startValue - wakeThreshold) / PET_SLEEP_RECOVERY_PER_SEC) * 1000
        const wokeAt = sleepStartedAt[id] + recoveryDurationMs
        const awakeSteps = Math.max(0, Math.floor((now - wokeAt) / PET_SLEEPINESS_GAIN_MS))
        nextStats = { ...nextStats, sleepiness: clamp(Math.round(wakeThreshold) + awakeSteps) }
        nextProgress.sleepinessAt = wokeAt + awakeSteps * PET_SLEEPINESS_GAIN_MS
        if (nextStats.sleepiness >= PET_SLEEP_THRESHOLD) {
          sleepStartedAt[id] = now
          sleepStartValue[id] = nextStats.sleepiness
          sleepWakeAt[id] = rollSleepWakeThreshold(nextStats.sleepiness)
        } else {
          sleepStartedAt[id] = 0
          sleepStartValue[id] = 0
          sleepWakeAt[id] = 0
        }
      } else {
        nextStats = { ...nextStats, sleepiness: clamp(Math.round(currentSleepiness)) }
        nextProgress.sleepinessAt = now
      }
    } else {
      const sleepinessSteps = Math.max(0, Math.floor((now - currentProgress.sleepinessAt) / PET_SLEEPINESS_GAIN_MS))
      nextStats = { ...nextStats, sleepiness: clamp(stats.sleepiness + sleepinessSteps) }
      nextProgress.sleepinessAt = currentProgress.sleepinessAt + sleepinessSteps * PET_SLEEPINESS_GAIN_MS
      if (nextStats.sleepiness >= PET_SLEEP_THRESHOLD) {
        sleepStartedAt[id] = now
        sleepStartValue[id] = nextStats.sleepiness
        sleepWakeAt[id] = rollSleepWakeThreshold(nextStats.sleepiness)
      }
    }

    pets[id] = nextStats
    progress[id] = nextProgress
  })

  for (const [rawPetId, session] of Object.entries(walks.active ?? {})) {
    const petId = rawPetId as PetId
    if (!PET_BY_ID[petId] || !session || session.endsAt > now) continue
    delete walks.active[petId]
    if (walks.results.some(result => result.id === session.id)) continue
    const postDebuffActive = (walks.postDepressionUntil[petId] ?? 0) > now && (walks.depressionUntil[petId] ?? 0) <= now
    const exp = getModifiedExp(session.item === 'cat_headband' ? 70 : PET_WALK_BASE_EXP, pets[petId].affection, postDebuffActive)
    const sleepiness = session.item === 'cat_headband' ? 8 : session.item === 'takuya_sunglasses' ? 30 : PET_WALK_BASE_SLEEPINESS
    const reward = rollWalkReward(session.item, pets[petId].affection, skillActiveCharacterIds.includes('whip'))
    const nextStats = addExp({
      ...pets[petId],
      sleepiness: clamp(pets[petId].sleepiness + sleepiness),
      affection: clamp(pets[petId].affection + getModifiedAffection(1, postDebuffActive)),
    }, exp, petId)
    pets[petId] = nextStats
    if (nextStats.sleepiness >= PET_SLEEP_THRESHOLD) {
      sleepStartedAt[petId] = sleepStartedAt[petId] || now
      sleepStartValue[petId] = sleepStartValue[petId] || nextStats.sleepiness
      sleepWakeAt[petId] = sleepWakeAt[petId] || rollSleepWakeThreshold(nextStats.sleepiness)
    }
    const rewardInventory = applyRewardToInventory(reward, items, premiumFood)
    Object.assign(items, rewardInventory.items)
    premiumFood = rewardInventory.premiumFood
    const giftRoll = rollAffectionGiftAfterCare(petId, nextStats.affection, affectionGiftProgress, affectionGifts, now)
    affectionGiftProgress = giftRoll.progress
    affectionGifts = giftRoll.gifts
    if (giftRoll.gift) {
      const giftInventory = applyRewardToInventory(giftRoll.gift, items, premiumFood)
      Object.assign(items, giftInventory.items)
      premiumFood = giftInventory.premiumFood
    }
    const skillGiftRoll = petId === 'shikoiruka'
      ? rollShikoirukaSkillGiftAfterCare({ skillActiveCharacterIds, activePetIds }, skillGiftProgress, affectionGifts, now)
      : { progress: skillGiftProgress, gifts: affectionGifts, gift: null }
    skillGiftProgress = skillGiftRoll.progress
    affectionGifts = skillGiftRoll.gifts
    if (skillGiftRoll.gift) {
      const skillGiftInventory = applyRewardToInventory(skillGiftRoll.gift, items, premiumFood)
      Object.assign(items, skillGiftInventory.items)
      premiumFood = skillGiftInventory.premiumFood
    }
    walks.results = [
      ...walks.results,
      {
        id: session.id,
        petId,
        createdAt: now,
        exp,
        sleepiness,
        ...reward,
        pointsGrantStatus: reward.rewardType === 'points' ? 'pending' as const : undefined,
        seen: false,
      },
    ].slice(-8)
  }

  return {
    ...save,
    selectedPetId,
    activePetIds,
    pets,
    lastCareAt,
    cooldownUntil,
    expressions,
    petting,
    progress,
    sleepStartedAt,
    sleepStartValue,
    sleepWakeAt,
    items,
    walks,
    hungerAffectionPenaltyAt,
    affectionGiftProgress,
    affectionGifts,
    skillGiftProgress,
    premiumFood,
    skillState,
    skillActiveCharacterIds,
  }
}

export function getCareCooldownRemaining(category: PetCareCategory, cooldownUntil: PetCooldownUntil, now = Date.now()) {
  if (category === 'feed') return 0
  return Math.max(0, cooldownUntil[category] - now)
}

export function getActionCooldownRemaining(action: PetCareAction, lastCareAt: Partial<Record<PetCareAction, number>>, now = Date.now()) {
  const config = PET_CARE_CONFIG[action]
  return Math.max(0, (lastCareAt[action] ?? 0) + config.cooldownMs - now)
}

export function usePetState() {
  const [save, setSave] = useState<PetSaveData>(loadSave)
  const [isHydrated, setIsHydrated] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [skillLockStatus, setSkillLockStatus] = useState<Record<string, boolean>>({})
  const initialLocalSave = useRef(save)
  // ── サーバーに最後に伝えた消費アイテム数の基準値。
  // 定期autosaveのフルステート上書きでミッション/ガチャ付与分を
  // 消してしまわないよう、サーバー側の差分マージ計算に使う。
  const itemsBaselineRef = useRef<PetInventorySnapshot | null>(null)
  const now = Date.now()
  const effectiveSave = materializeSaveAt(save, now)
  const selectedPetId = effectiveSave.selectedPetId
  const selectedStats = effectiveSave.pets[selectedPetId] ?? DEFAULT_STATS
  const isSleeping = (effectiveSave.sleepStartedAt[selectedPetId] ?? 0) > 0
  const activePetIds = sanitizePetIdList(effectiveSave.activePetIds)
  const skillActiveCharacterIds = sanitizePetIdList(effectiveSave.skillActiveCharacterIds)
  const premiumFood = getPremiumFoodState(effectiveSave.premiumFood, now)
  const walks = effectiveSave.walks
  const selectedWalkSession = walks.active[selectedPetId] ?? null
  const isWalking = Boolean(selectedWalkSession)
  const walkRemainingValue = selectedWalkSession ? selectedWalkSession.endsAt - now : 0
  const walkRemaining = Number.isFinite(walkRemainingValue) ? Math.max(0, walkRemainingValue) : 0
  const depressionUntil = walks.depressionUntil[selectedPetId] ?? 0
  const postDepressionUntil = walks.postDepressionUntil[selectedPetId] ?? 0
  const depressionMessage = (walks.depressionMessageUntil[selectedPetId] ?? 0) > now ? '罵声を浴びせられてうつ状態' : ''

  useEffect(() => {
    let cancelled = false
    async function hydrateFromDatabase() {
      try {
        const response = await fetch('/api/pet/state', { credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'INMU PETデータの取得に失敗しました')
        if (cancelled) return
        if (data.hasState && data.state) {
          const hydrated = loadSave(data.state)
          setSave(hydrated)
          itemsBaselineRef.current = getInventorySnapshot(hydrated)
          setSkillLockStatus(data.skillLockStatus && typeof data.skillLockStatus === 'object' ? data.skillLockStatus : {})
        } else {
          const migrateResponse = await fetch('/api/pet/state', {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: initialLocalSave.current, clientUpdatedAt: Date.now() }),
          })
          if (!migrateResponse.ok) {
            const migrateData = await migrateResponse.json().catch(() => ({}))
            throw new Error(migrateData.error ?? 'INMU PETデータの初期保存に失敗しました')
          }
          itemsBaselineRef.current = getInventorySnapshot(initialLocalSave.current)
        }
        setSyncError(null)
      } catch (error) {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : 'INMU PETデータの同期に失敗しました')
      } finally {
        if (!cancelled) setIsHydrated(true)
      }
    }
    void hydrateFromDatabase()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
    if (!isHydrated) return
    void fetch('/api/pet/state', {
      method: 'PUT',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: save, clientUpdatedAt: Date.now(), baseline: itemsBaselineRef.current ?? undefined }),
    }).then(async response => {
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'INMU PETデータの保存に失敗しました')
      }
      const data = await response.json().catch(() => ({}))
      if (data?.mergedItems && typeof data.mergedItems === 'object') {
        const mergedSleepTea = Number(data.mergedItems.sleepTea ?? 0)
        const mergedPremiumInventory = Number(data.mergedItems.premiumInventory ?? 0)
        const mergedTakuyaSunglasses = Number(data.mergedItems.takuyaSunglasses ?? 0)
        const mergedCatHeadband = Number(data.mergedItems.catHeadband ?? 0)
        itemsBaselineRef.current = { sleepTea: mergedSleepTea, premiumInventory: mergedPremiumInventory, takuyaSunglasses: mergedTakuyaSunglasses, catHeadband: mergedCatHeadband }
        setSave(current => {
          const materialized = materializeSaveAt(current, Date.now())
          if (Number(materialized.items.sleepTea ?? 0) === mergedSleepTea && Number(materialized.premiumFood.inventory ?? 0) === mergedPremiumInventory && Number(materialized.items.takuyaSunglasses ?? 0) === mergedTakuyaSunglasses && Number(materialized.items.catHeadband ?? 0) === mergedCatHeadband) {
            return current
          }
          return {
            ...materialized,
            items: { ...materialized.items, sleepTea: mergedSleepTea, takuyaSunglasses: mergedTakuyaSunglasses, catHeadband: mergedCatHeadband },
            premiumFood: { ...materialized.premiumFood, inventory: mergedPremiumInventory },
          }
        })
      } else {
        itemsBaselineRef.current = getInventorySnapshot(save)
      }
      if (data?.petProgress && typeof data.petProgress === 'object') {
        setSave(current => {
          const materialized = materializeSaveAt(current, Date.now())
          const pets = { ...materialized.pets }
          let changed = false
          Object.entries(data.petProgress as Record<string, unknown>).forEach(([rawPetId, progress]) => {
            if (!PET_BY_ID[rawPetId as PetId] || !progress || typeof progress !== 'object') return
            const petId = rawPetId as PetId
            const record = progress as Record<string, unknown>
            const remoteLevel = Math.max(1, Math.floor(readNumber(record.level, 1)))
            const remoteExp = Math.max(0, Math.floor(readNumber(record.exp, 0)))
            const local = pets[petId]
            if (remoteLevel < local.level || (remoteLevel === local.level && remoteExp <= local.exp)) return
            pets[petId] = { ...local, level: remoteLevel, exp: remoteExp }
            changed = true
          })
          return changed ? { ...materialized, pets } : current
        })
      }
      setSyncError(null)
    }).catch(error => setSyncError(error instanceof Error ? error.message : 'INMU PETデータの保存に失敗しました'))
  }, [isHydrated, save])

  useEffect(() => {
    if (!isHydrated) return
    let cancelled = false
    async function refreshServerInventory() {
      try {
        const response = await fetch('/api/pet/state', { credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !data.hasState || !data.state || cancelled) return
        const remoteSave = loadSave(data.state)
        const remoteSnapshot = getInventorySnapshot(remoteSave)
        setSave(current => {
          const materialized = materializeSaveAt(current, Date.now())
          const currentSnapshot = getInventorySnapshot(materialized)
          const baseline = itemsBaselineRef.current
          if (baseline && !sameInventorySnapshot(currentSnapshot, baseline)) return current
          itemsBaselineRef.current = remoteSnapshot
          if (sameInventorySnapshot(currentSnapshot, remoteSnapshot)) return current
          return {
            ...materialized,
            items: remoteSave.items,
            premiumFood: { ...materialized.premiumFood, inventory: remoteSave.premiumFood.inventory },
          }
        })
      } catch {
        // Server-side item grants are opportunistic; normal autosave still handles local play.
      }
    }
    void refreshServerInventory()
    const interval = window.setInterval(refreshServerInventory, 15_000)
    window.addEventListener('focus', refreshServerInventory)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshServerInventory)
    }
  }, [isHydrated])

  useEffect(() => {
    const materialize = () => setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      return JSON.stringify(materialized) === JSON.stringify(current) ? current : materialized
    })
    materialize()
    const interval = window.setInterval(materialize, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [])

  // ── 行動AI: 眠気の高さに応じて「眠る」演出への突入をランダムに判定する。
  // 眠気99以上での強制睡眠(materializeSaveAt側)とは別に、それ未満の段階でも
  // 眠気が高いほど頻繁に(そして眠気100付近ではほぼ常に)眠るようにする。
  // レベル・経験値・所持アイテム・固有スキルなど他のデータには一切触れない。
  useEffect(() => {
    const rollEarlyNap = () => {
      const rollAt = Date.now()
      setSave(current => {
        const materialized = materializeSaveAt(current, rollAt)
        let changed = false
        const sleepStartedAt = { ...materialized.sleepStartedAt }
        const sleepStartValue = { ...materialized.sleepStartValue }
        const sleepWakeAt = { ...materialized.sleepWakeAt }
        PET_DEFINITIONS.forEach(pet => {
          const id = pet.id
          if (sleepStartedAt[id] > 0) return
          const sleepiness = materialized.pets[id].sleepiness
          const chance = getSleepChance(sleepiness)
          if (chance > 0 && Math.random() < chance) {
            sleepStartedAt[id] = rollAt
            sleepStartValue[id] = sleepiness
            sleepWakeAt[id] = rollSleepWakeThreshold(sleepiness)
            changed = true
          }
        })
        return changed ? { ...materialized, sleepStartedAt, sleepStartValue, sleepWakeAt } : materialized
      })
    }
    const interval = window.setInterval(rollEarlyNap, PET_EARLY_NAP_CHECK_MS)
    return () => window.clearInterval(interval)
  }, [])

  function selectPet(selectedPetId: PetId) {
    setSave(current => ({ ...current, selectedPetId }))
  }

  function setActivePetIds(nextActivePetIds: PetId[] | ((current: PetId[]) => PetId[])) {
    setSave(current => {
      const activePetIds = typeof nextActivePetIds === 'function'
        ? nextActivePetIds(sanitizePetIdList(current.activePetIds))
        : nextActivePetIds
      return {
        ...current,
        activePetIds: sanitizePetIdList(activePetIds),
      }
    })
  }

  function setSkillActiveCharacterIds(nextIds: PetId[] | ((current: PetId[]) => PetId[])) {
    setSave(current => {
      const skillActiveCharacterIds = typeof nextIds === 'function'
        ? nextIds(sanitizePetIdList(current.skillActiveCharacterIds))
        : nextIds
      return {
        ...current,
        skillActiveCharacterIds: sanitizePetIdList(skillActiveCharacterIds),
      }
    })
  }

  const refreshSkillLockStatus = useRef(async () => {
    try {
      const response = await fetch('/api/pet/skill-lock-status', { credentials: 'include' })
      if (!response.ok) return
      const data = await response.json().catch(() => ({}))
      setSkillLockStatus(data.skillLockStatus && typeof data.skillLockStatus === 'object' ? data.skillLockStatus : {})
    } catch {
      // Keep the previously known lock status on transient network errors.
    }
  }).current

  function recordShikoirukaSkillLockIfNeeded(currentSave: Pick<PetSaveData, 'skillActiveCharacterIds' | 'activePetIds'>) {
    if (!isPetSkillActive(currentSave, 'shikoiruka') || skillLockStatus.shikoiruka) return
    setSkillLockStatus(current => ({ ...current, shikoiruka: true }))
    void fetch('/api/pet/skill-use', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: 'shikoiruka' }),
    }).then(async response => {
      const data = await response.json().catch(() => ({}))
      if (response.ok && data.skillLockStatus && typeof data.skillLockStatus === 'object') {
        setSkillLockStatus(data.skillLockStatus)
      }
    }).catch(() => {
      // The local lock keeps the selector stable; the next status refresh will reconcile.
    })
  }

  function recordDaifugoSkillRewardIfNeeded(
    currentSave: Pick<PetSaveData, 'skillActiveCharacterIds' | 'activePetIds'>,
    careAction: 'feed' | 'play' | 'pet' | 'walk',
    actionId: string,
  ) {
    if (!isPetSkillActive(currentSave, 'daifugo')) return
    setSkillLockStatus(current => ({ ...current, daifugo: true }))
    void fetch('/api/pet/skill-use', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId: 'daifugo', careAction, actionId }),
    }).then(async response => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) return
      if (data.skillLockStatus && typeof data.skillLockStatus === 'object') {
        setSkillLockStatus(data.skillLockStatus)
      }
      if (Number(data.pointsGranted) > 0) {
        window.dispatchEvent(new CustomEvent('inmu-pet-skill-points', {
          detail: { pointsGranted: Number(data.pointsGranted), remainingBalance: Number(data.remainingBalance) },
        }))
      }
    }).catch(() => {
      // Autosave and the next lock refresh reconcile transient request failures.
    })
  }

  function care(action: PetCareAction, actionNow = Date.now()): PetCareResult | null {
    const config = PET_CARE_CONFIG[action]
    const currentEffective = materializeSaveAt(save, actionNow)
    const petId = currentEffective.selectedPetId
    const stats = currentEffective.pets[petId]
    const sleeping = currentEffective.sleepStartedAt[petId] > 0
    if (currentEffective.walks.active[petId]) return null
    if (sleeping && action !== 'pet') return null
    if (config.category === 'feed' && stats.fullness >= 100) return null
    if (config.category === 'feed' && getActionCooldownRemaining(action, currentEffective.lastCareAt[petId], actionNow) > 0) return null
    if (config.category !== 'pet' && getCareCooldownRemaining(config.category, currentEffective.cooldownUntil[petId], actionNow) > 0) return null
    if (action === 'feed-premium' && getPremiumFoodState(currentEffective.premiumFood, actionNow).totalAvailable <= 0) return null
    // 大富豪限定制限: 普通ごはん・毛糸・ボールは拒否
    if (petId === 'daifugo' && action === 'feed-basic') return null
    if (petId === 'daifugo' && (action === 'play-yarn' || action === 'play-ball')) return null
    recordShikoirukaSkillLockIfNeeded(currentEffective)

    const previousPetting = currentEffective.petting[petId]
    const currentExpression = currentEffective.expressions[petId]
    const angryActive = action === 'pet' && currentExpression.kind === 'angry' && currentExpression.until > actionNow
    const petCount = action === 'pet'
      ? (actionNow - previousPetting.lastAt <= PET_PETTING_RESET_MS ? previousPetting.count + 1 : 1)
      : previousPetting.count
    const sleepPettingAnger = action === 'pet' && sleeping && (
      petCount >= PET_SLEEP_PETTING_ANGER_COUNT || Math.random() < PET_SLEEP_PETTING_ANGER_CHANCE
    )
    const angry = angryActive || sleepPettingAnger || (action === 'pet' && petCount >= PET_PETTING_ANGER_COUNT)
    const result: PetCareResult = angry
      ? {
          expression: 'angry',
          motion: 'angry',
          message: 'overpetted',
          expressionUntil: angryActive ? currentExpression.until : actionNow + PET_ANGER_HOLD_MS,
        }
      : action === 'pet'
          ? { expression: 'petted', motion: 'pet', message: 'petted' }
          : config.category === 'feed'
            ? { expression: 'happy', motion: 'feed', message: 'fed' }
            : { expression: 'happy', motion: 'play', message: 'played' }
    if (result.message !== 'overpetted' && petId === 'daifugo') {
      const careAction = action === 'pet' ? 'pet' : config.category
      recordDaifugoSkillRewardIfNeeded(currentEffective, careAction, `care:${actionNow}:${petId}:${action}`)
    }

    setSave(current => {
      const materialized = materializeSaveAt(current, actionNow)
      const currentPetId = materialized.selectedPetId
      const currentStats = materialized.pets[currentPetId]
      const currentConfig = PET_CARE_CONFIG[action]
      const currentSleeping = materialized.sleepStartedAt[currentPetId] > 0
      if (materialized.walks.active[currentPetId]) return current
      if (currentSleeping && action !== 'pet') return current
      if (currentConfig.category === 'feed' && currentStats.fullness >= 100) return current
      if (currentConfig.category === 'feed' && getActionCooldownRemaining(action, materialized.lastCareAt[currentPetId], actionNow) > 0) return current
      if (currentConfig.category !== 'pet' && getCareCooldownRemaining(currentConfig.category, materialized.cooldownUntil[currentPetId], actionNow) > 0) return current
      const premiumState = getPremiumFoodState(materialized.premiumFood, actionNow)
      if (action === 'feed-premium' && premiumState.totalAvailable <= 0) return current
      // 大富豪限定制限: 普通ごはん・毛糸・ボールは拒否
      if (currentPetId === 'daifugo' && action === 'feed-basic') return current
      if (currentPetId === 'daifugo' && (action === 'play-yarn' || action === 'play-ball')) return current

      const previous = materialized.petting[currentPetId]
      const savedExpression = materialized.expressions[currentPetId]
      const stillAngry = action === 'pet' && savedExpression.kind === 'angry' && savedExpression.until > actionNow
      const count = action === 'pet' ? (actionNow - previous.lastAt <= PET_PETTING_RESET_MS ? previous.count + 1 : 1) : previous.count
      const triggeredAnger = action === 'pet' && !stillAngry && (sleepPettingAnger || count >= PET_PETTING_ANGER_COUNT)
      const overpetted = stillAngry || triggeredAnger
      const postDebuffActive = (materialized.walks.postDepressionUntil[currentPetId] ?? 0) > actionNow && (materialized.walks.depressionUntil[currentPetId] ?? 0) <= actionNow
      const affectionDelta = overpetted ? -3 : getModifiedAffection(currentConfig.affection, postDebuffActive)
      // 大富豪は高級ごはんでも普通ごはんと同じ満腹回復量
      const effectiveFullness = currentPetId === 'daifugo' && action === 'feed-premium'
        ? PET_CARE_CONFIG['feed-basic'].fullness
        : currentConfig.fullness
      const nextStats = addExp({
        ...currentStats,
        fullness: clamp(currentStats.fullness + effectiveFullness),
        sleepiness: clamp(currentStats.sleepiness + currentConfig.sleepiness),
        affection: clamp(currentStats.affection + affectionDelta),
      }, overpetted ? 0 : getModifiedExp(currentConfig.exp, currentStats.affection, postDebuffActive), currentPetId)
      const startsSleeping = nextStats.sleepiness >= PET_SLEEP_THRESHOLD
      let premiumFood = materialized.premiumFood
      if (action === 'feed-premium') {
        premiumFood = premiumState.dailyRemaining > 0
          ? { ...premiumFood, dailyUsed: premiumFood.dailyUsed + 1 }
          : { ...premiumFood, inventory: Math.max(0, premiumFood.inventory - 1) }
      }
      let items = materialized.items
      let affectionGiftProgress = materialized.affectionGiftProgress
      let affectionGifts = materialized.affectionGifts
      let skillGiftProgress = materialized.skillGiftProgress
      if (!overpetted) {
        const giftRoll = rollAffectionGiftAfterCare(currentPetId, nextStats.affection, materialized.affectionGiftProgress, materialized.affectionGifts, actionNow)
        affectionGiftProgress = giftRoll.progress
        affectionGifts = giftRoll.gifts
        if (giftRoll.gift) {
          const giftInventory = applyRewardToInventory(giftRoll.gift, items, premiumFood)
          items = giftInventory.items
          premiumFood = giftInventory.premiumFood
        }
        const skillGiftRoll = currentPetId === 'shikoiruka'
          ? rollShikoirukaSkillGiftAfterCare(materialized, skillGiftProgress, affectionGifts, actionNow)
          : { progress: skillGiftProgress, gifts: affectionGifts, gift: null }
        skillGiftProgress = skillGiftRoll.progress
        affectionGifts = skillGiftRoll.gifts
        if (skillGiftRoll.gift) {
          const skillGiftInventory = applyRewardToInventory(skillGiftRoll.gift, items, premiumFood)
          items = skillGiftInventory.items
          premiumFood = skillGiftInventory.premiumFood
        }
      }

      return {
        ...materialized,
        pets: { ...materialized.pets, [currentPetId]: nextStats },
        lastCareAt: { ...materialized.lastCareAt, [currentPetId]: { ...materialized.lastCareAt[currentPetId], [action]: actionNow } },
        cooldownUntil: currentConfig.category === 'pet' || currentConfig.cooldownMs <= 0 ? materialized.cooldownUntil : {
          ...materialized.cooldownUntil,
          [currentPetId]: { ...materialized.cooldownUntil[currentPetId], [currentConfig.category]: actionNow + currentConfig.cooldownMs },
        },
        petting: action === 'pet' ? {
          ...materialized.petting,
          [currentPetId]: { count: overpetted ? 0 : count, lastAt: actionNow },
        } : materialized.petting,
        sleepStartedAt: { ...materialized.sleepStartedAt, [currentPetId]: startsSleeping ? (materialized.sleepStartedAt[currentPetId] || actionNow) : 0 },
        sleepStartValue: {
          ...materialized.sleepStartValue,
          [currentPetId]: startsSleeping ? (materialized.sleepStartedAt[currentPetId] ? materialized.sleepStartValue[currentPetId] : nextStats.sleepiness) : 0,
        },
        sleepWakeAt: {
          ...materialized.sleepWakeAt,
          [currentPetId]: startsSleeping ? (materialized.sleepStartedAt[currentPetId] ? materialized.sleepWakeAt[currentPetId] : rollSleepWakeThreshold(nextStats.sleepiness)) : 0,
        },
        hungerAffectionPenaltyAt: { ...materialized.hungerAffectionPenaltyAt, [currentPetId]: actionNow },
        affectionGiftProgress,
        affectionGifts,
        skillGiftProgress,
        items,
        premiumFood,
      }
    })
    return result
  }

  function setExpression(kind: PetExpression, durationMs = 0, expressionNow = Date.now()) {
    setSave(current => {
      const materialized = materializeSaveAt(current, expressionNow)
      return {
        ...materialized,
        expressions: {
          ...materialized.expressions,
          [materialized.selectedPetId]: { kind, until: durationMs > 0 ? expressionNow + durationMs : 0 },
        },
      }
    })
  }

  function grantPremiumFood(amount: number) {
    const grant = Math.max(0, Math.floor(amount))
    if (grant <= 0) return
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      return {
        ...materialized,
        premiumFood: { ...materialized.premiumFood, inventory: materialized.premiumFood.inventory + grant },
      }
    })
  }

  function useSleepTea(amount: number) {
    const requested = Math.min(3, Math.max(1, Math.floor(amount)))
    const petId = effectiveSave.selectedPetId
    if (PET_BY_ID[petId].experienceMode === 'evolved-training-only') return 0
    if ((effectiveSave.sleepStartedAt[petId] ?? 0) > 0) return 0
    if (effectiveSave.walks.active[petId]) return 0
    if (effectiveSave.walks.sleepTeaBlockedDate[petId] === getJstDateKey()) return 0
    const available = Math.max(0, Math.floor(effectiveSave.items?.sleepTea ?? 0))
    const maxBySleepiness = Math.max(0, Math.floor((100 - effectiveSave.pets[petId].sleepiness) / 33))
    const used = Math.min(requested, available, Math.max(0, PET_BY_ID[petId].maxLevel - effectiveSave.pets[petId].level), maxBySleepiness)
    if (used <= 0) return 0
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      const currentPetId = materialized.selectedPetId
      if (PET_BY_ID[currentPetId].experienceMode === 'evolved-training-only') return current
      if ((materialized.sleepStartedAt[currentPetId] ?? 0) > 0) return current
      if (materialized.walks.active[currentPetId]) return current
      if (materialized.walks.sleepTeaBlockedDate[currentPetId] === getJstDateKey()) return current
      const stats = materialized.pets[currentPetId]
      const currentAvailable = Math.max(0, Math.floor(materialized.items?.sleepTea ?? 0))
      const currentMaxBySleepiness = Math.max(0, Math.floor((100 - stats.sleepiness) / 33))
      const applied = Math.min(used, currentAvailable, Math.max(0, PET_BY_ID[currentPetId].maxLevel - stats.level), currentMaxBySleepiness)
      if (applied <= 0) return current
      const nextStats = {
        ...stats,
        level: stats.level + applied,
        exp: 0,
        sleepiness: clamp(stats.sleepiness + 33 * applied),
      }
      const actionNow = Date.now()
      return {
        ...materialized,
        pets: { ...materialized.pets, [currentPetId]: nextStats },
        items: { ...materialized.items, sleepTea: currentAvailable - applied },
        sleepStartedAt: {
          ...materialized.sleepStartedAt,
          [currentPetId]: nextStats.sleepiness >= PET_SLEEP_THRESHOLD ? (materialized.sleepStartedAt[currentPetId] || actionNow) : 0,
        },
        sleepStartValue: {
          ...materialized.sleepStartValue,
          [currentPetId]: nextStats.sleepiness >= PET_SLEEP_THRESHOLD ? (materialized.sleepStartedAt[currentPetId] ? materialized.sleepStartValue[currentPetId] : nextStats.sleepiness) : 0,
        },
        sleepWakeAt: {
          ...materialized.sleepWakeAt,
          [currentPetId]: nextStats.sleepiness >= PET_SLEEP_THRESHOLD ? (materialized.sleepStartedAt[currentPetId] ? materialized.sleepWakeAt[currentPetId] : rollSleepWakeThreshold(nextStats.sleepiness)) : 0,
        },
      }
    })
    return used
  }

  function startWalk(item: PetWalkItem = 'none', walkNow = Date.now()): { ok: true; special: boolean } | { ok: false; reason: string } {
    const currentEffective = materializeSaveAt(save, walkNow)
    const petId = currentEffective.selectedPetId
    const currentWalks = sanitizeWalks(currentEffective.walks, walkNow)
    const dailyLimit = PET_WALK_DAILY_LIMIT + (isPetSkillActive(currentEffective, 'whip') ? PET_WALK_WHIP_DAILY_BONUS : 0)
    if (currentEffective.sleepStartedAt[petId] > 0) return { ok: false, reason: 'sleeping' }
    if (currentWalks.active[petId]) return { ok: false, reason: 'walking' }
    if (currentWalks.dailyCount >= dailyLimit) return { ok: false, reason: 'daily_limit' }
    if (currentWalks.petDaily[petId] === getJstDateKey(walkNow)) return { ok: false, reason: 'pet_daily_limit' }
    if (item === 'takuya_sunglasses' && currentEffective.items.takuyaSunglasses <= 0) return { ok: false, reason: 'no_item' }
    if (item === 'cat_headband' && currentEffective.items.catHeadband <= 0) return { ok: false, reason: 'no_item' }
    // 大富豪は愛情度50以上でないと散歩しない
    if (petId === 'daifugo' && currentEffective.pets[petId].affection < 50) return { ok: false, reason: 'low_affection' }
    recordShikoirukaSkillLockIfNeeded(currentEffective)
    const special = petId === 'takuya' && item === 'cat_headband' && Math.random() < PET_WALK_TAKUYA_CAT_EVENT_CHANCE
    const sessionId = `walk-${petId}-${walkNow}-${Math.random().toString(36).slice(2, 8)}`
    setSave(current => {
      const materialized = materializeSaveAt(current, walkNow)
      const currentPetId = materialized.selectedPetId
      const walks = sanitizeWalks(materialized.walks, walkNow)
      const materializedDailyLimit = PET_WALK_DAILY_LIMIT + (isPetSkillActive(materialized, 'whip') ? PET_WALK_WHIP_DAILY_BONUS : 0)
      if (materialized.sleepStartedAt[currentPetId] > 0 || walks.active[currentPetId] || walks.dailyCount >= materializedDailyLimit || walks.petDaily[currentPetId] === getJstDateKey(walkNow)) return current
      // 大富豪は愛情度50以上でないと散歩しない
      if (currentPetId === 'daifugo' && materialized.pets[currentPetId].affection < 50) return current
      const items = { ...materialized.items }
      if (item === 'takuya_sunglasses') {
        if (items.takuyaSunglasses <= 0) return current
        items.takuyaSunglasses -= 1
      }
      if (item === 'cat_headband') {
        if (items.catHeadband <= 0) return current
        items.catHeadband -= 1
      }
      const nextWalks: PetWalkState = {
        ...walks,
        dailyCount: walks.dailyCount + 1,
        petDaily: { ...walks.petDaily, [currentPetId]: getJstDateKey(walkNow) },
        active: { ...walks.active },
      }
      const pets = { ...materialized.pets }
      const sleepStartedAt = { ...materialized.sleepStartedAt }
      const sleepStartValue = { ...materialized.sleepStartValue }
      const sleepWakeAt = { ...materialized.sleepWakeAt }
      if (special) {
        delete nextWalks.active[currentPetId]
        nextWalks.depressionUntil = { ...nextWalks.depressionUntil, [currentPetId]: walkNow + PET_WALK_DEPRESSION_MS }
        nextWalks.postDepressionUntil = { ...nextWalks.postDepressionUntil, [currentPetId]: walkNow + PET_WALK_DEPRESSION_MS + PET_WALK_POST_DEBUFF_MS }
        nextWalks.depressionMessageUntil = { ...nextWalks.depressionMessageUntil, [currentPetId]: walkNow + PET_WALK_DEPRESSION_MS }
        nextWalks.sleepTeaBlockedDate = { ...nextWalks.sleepTeaBlockedDate, [currentPetId]: getJstDateKey(walkNow) }
        pets[currentPetId] = {
          ...pets[currentPetId],
          fullness: clamp(pets[currentPetId].fullness - 30),
          sleepiness: 100,
          affection: clamp(Math.floor(pets[currentPetId].affection / 2)),
        }
        sleepStartedAt[currentPetId] = walkNow
        sleepStartValue[currentPetId] = 100
        sleepWakeAt[currentPetId] = 0
      } else {
        nextWalks.active[currentPetId] = {
          id: sessionId,
          petId: currentPetId,
          startedAt: walkNow,
          endsAt: walkNow + PET_WALK_BASE_DURATION_MS + (item === 'takuya_sunglasses' ? PET_WALK_BASE_DURATION_MS : 0),
          item,
        }
      }
      return { ...materialized, items, walks: nextWalks, pets, sleepStartedAt, sleepStartValue, sleepWakeAt }
    })
    return { ok: true, special }
  }

  function markWalkResultSeen(resultId: string) {
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      return {
        ...materialized,
        walks: {
          ...materialized.walks,
          results: materialized.walks.results.map(result => result.id === resultId ? { ...result, seen: true } : result),
        },
      }
    })
  }

  function markWalkPointsGranted(resultId: string) {
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      return {
        ...materialized,
        walks: {
          ...materialized.walks,
          results: materialized.walks.results.map(result => result.id === resultId ? { ...result, pointsGrantStatus: 'granted' } : result),
        },
      }
    })
  }

  function markAffectionGiftPointsGranted(giftId: string) {
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      return {
        ...materialized,
        affectionGifts: materialized.affectionGifts.map(gift => gift.id === giftId ? { ...gift, pointsGrantStatus: 'granted' } : gift),
      }
    })
  }

  return {
    selectedPetId,
    activePetIds,
    selectedStats,
    petStats: effectiveSave.pets,
    cooldownUntil: effectiveSave.cooldownUntil?.[selectedPetId] ?? EMPTY_COOLDOWNS,
    lastCareAt: effectiveSave.lastCareAt?.[selectedPetId] ?? EMPTY_ACTION_TIMES,
    expressionState: effectiveSave.expressions?.[selectedPetId] ?? { kind: 'default', until: 0 },
    pettingState: effectiveSave.petting?.[selectedPetId] ?? { count: 0, lastAt: 0 },
    premiumFood,
    items: effectiveSave.items,
    isSleeping,
    isWalking,
    walkRemaining,
    walks,
    affectionGifts: effectiveSave.affectionGifts,
    depressionUntil,
    postDepressionUntil,
    depressionMessage,
    selectPet,
    setActivePetIds,
    care,
    setExpression,
    grantPremiumFood,
    useSleepTea,
    startWalk,
    markWalkResultSeen,
    markWalkPointsGranted,
    markAffectionGiftPointsGranted,
    maxLevel: PET_BY_ID[selectedPetId].maxLevel,
    isHydrated,
    syncError,
    skillState: effectiveSave.skillState,
    skillActiveCharacterIds,
    setSkillActiveCharacterIds,
    skillLockStatus,
    refreshSkillLockStatus,
  }
}

export function initializeAwardedPetAtLevelOne(petId: string) {
  if (!(petId in PET_BY_ID)) return
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PetSaveData>
    const id = petId as PetId
    if (parsed.pets?.[id] && typeof parsed.pets[id] === 'object') return
    const fallback = createDefaultSave()
    const current = materializeSaveAt(parsed.version ? { ...fallback, ...parsed } as PetSaveData : fallback, Date.now())
    const now = Date.now()
    const next: PetSaveData = {
      ...current,
      pets: { ...current.pets, [id]: { ...DEFAULT_STATS } },
      lastCareAt: { ...current.lastCareAt, [id]: { ...EMPTY_ACTION_TIMES } },
      cooldownUntil: { ...current.cooldownUntil, [id]: { ...EMPTY_COOLDOWNS } },
      expressions: { ...current.expressions, [id]: { kind: 'default', until: 0 } },
      petting: { ...current.petting, [id]: { count: 0, lastAt: 0 } },
      sleepStartedAt: { ...current.sleepStartedAt, [id]: 0 },
      sleepStartValue: { ...current.sleepStartValue, [id]: 0 },
      sleepWakeAt: { ...current.sleepWakeAt, [id]: 0 },
      progress: { ...current.progress, [id]: { fullnessAt: now, sleepinessAt: now } },
      items: sanitizeItems(current.items),
      walks: sanitizeWalks(current.walks, now),
      hungerAffectionPenaltyAt: { ...sanitizePetNumberRecord(current.hungerAffectionPenaltyAt, now), [id]: now },
      affectionGiftProgress: { ...sanitizePetNumberRecord(current.affectionGiftProgress, 0), [id]: 0 },
      affectionGifts: Array.isArray(current.affectionGifts) ? current.affectionGifts.slice(-8) : [],
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A broken local save should not prevent receiving the character.
  }
}
