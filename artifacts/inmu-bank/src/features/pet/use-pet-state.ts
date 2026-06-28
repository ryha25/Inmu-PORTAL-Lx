import { useEffect, useState } from 'react'
import { PET_DEFINITIONS, type PetExpression, type PetId } from './pet-data'

const STORAGE_KEY = 'inmu-portal:pet-state:v1'
const MAX_LEVEL = 30

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
export type PetCareResult = {
  expression: 'happy' | 'petted' | 'annoyed' | 'angry'
  motion: 'feed' | 'play' | 'pet' | 'angry'
  message: string
}

export const PET_PETTING_RESET_MS = 60 * 1000
export const PET_SLEEP_RECOVERY_MS = 30 * 60 * 1000

export const PET_CARE_CONFIG: Record<PetCareAction, {
  category: PetCareCategory | 'pet'
  cooldownMs: number
  fullness: number
  exp: number
  affection: number
  sleepiness: number
}> = {
  'feed-basic': { category: 'feed', cooldownMs: 10 * 60 * 1000, fullness: 20, exp: 5, affection: 1, sleepiness: 0 },
  'feed-premium': { category: 'feed', cooldownMs: 30 * 60 * 1000, fullness: 40, exp: 15, affection: 3, sleepiness: 0 },
  'play-yarn': { category: 'play', cooldownMs: 10 * 60 * 1000, fullness: 0, exp: 5, affection: 3, sleepiness: 5 },
  'play-ball': { category: 'play', cooldownMs: 20 * 60 * 1000, fullness: 0, exp: 10, affection: 5, sleepiness: 10 },
  'play-toy': { category: 'play', cooldownMs: 30 * 60 * 1000, fullness: 0, exp: 15, affection: 7, sleepiness: 15 },
  pet: { category: 'pet', cooldownMs: 0, fullness: 0, exp: 1, affection: 1, sleepiness: 0 },
}

type PetActionTimes = Record<PetCareAction, number>
type PetCooldownUntil = Record<PetCareCategory, number>

type PetSaveData = {
  version: 3
  selectedPetId: PetId
  pets: Record<PetId, PetStats>
  lastCareAt: Record<PetId, PetActionTimes>
  cooldownUntil: Record<PetId, PetCooldownUntil>
  expressions: Record<PetId, PetExpressionState>
  petting: Record<PetId, PettingState>
  sleepStartedAt: Record<PetId, number>
}

type LegacySaveData = Partial<PetSaveData> & {
  lastCareAt?: Record<PetId, Record<string, number>>
}

const DEFAULT_STATS: PetStats = { level: 1, exp: 0, fullness: 50, sleepiness: 20, affection: 10 }
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

function sanitizeStats(value: Partial<PetStats> | undefined): PetStats {
  const level = clamp(readNumber(value?.level, DEFAULT_STATS.level), 1, MAX_LEVEL)
  return {
    level,
    exp: level >= MAX_LEVEL ? 0 : clamp(readNumber(value?.exp, DEFAULT_STATS.exp), 0, level * 20 - 1),
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

function createDefaultSave(): PetSaveData {
  return {
    version: 3,
    selectedPetId: PET_DEFINITIONS[0].id,
    pets: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...DEFAULT_STATS }])) as Record<PetId, PetStats>,
    lastCareAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_ACTION_TIMES }])) as Record<PetId, PetActionTimes>,
    cooldownUntil: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_COOLDOWNS }])) as Record<PetId, PetCooldownUntil>,
    expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { kind: 'default', until: 0 }])) as Record<PetId, PetExpressionState>,
    petting: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { count: 0, lastAt: 0 }])) as Record<PetId, PettingState>,
    sleepStartedAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, 0])) as Record<PetId, number>,
  }
}

function loadSave(): PetSaveData {
  const fallback = createDefaultSave()
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as LegacySaveData
    const validSelection = PET_DEFINITIONS.some(pet => pet.id === parsed.selectedPetId)
    const pets = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(parsed.pets?.[pet.id])])) as Record<PetId, PetStats>
    const lastCareAt = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeActionTimes(parsed.lastCareAt?.[pet.id])])) as Record<PetId, PetActionTimes>
    return {
      version: 3,
      selectedPetId: validSelection ? parsed.selectedPetId! : fallback.selectedPetId,
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
      sleepStartedAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, Math.max(0, readNumber(parsed.sleepStartedAt?.[pet.id], pets[pet.id].sleepiness >= 100 ? Date.now() : 0))])) as Record<PetId, number>,
    }
  } catch {
    return fallback
  }
}

function addExp(stats: PetStats, amount: number): PetStats {
  if (stats.level >= MAX_LEVEL) return { ...stats, level: MAX_LEVEL, exp: 0 }
  let level = stats.level
  let exp = stats.exp + amount
  while (level < MAX_LEVEL && exp >= level * 20) {
    exp -= level * 20
    level += 1
  }
  return { ...stats, level, exp: level >= MAX_LEVEL ? 0 : exp }
}

function getEffectiveStats(stats: PetStats, sleepStartedAt: number, now: number): PetStats {
  if (sleepStartedAt <= 0) return stats
  const recovery = Math.floor(((now - sleepStartedAt) / PET_SLEEP_RECOVERY_MS) * 100)
  return { ...stats, sleepiness: clamp(100 - recovery) }
}

export function getCareCooldownRemaining(category: PetCareCategory, cooldownUntil: PetCooldownUntil, now = Date.now()) {
  return Math.max(0, cooldownUntil[category] - now)
}

export function usePetState() {
  const [save, setSave] = useState<PetSaveData>(loadSave)
  const now = Date.now()
  const effectivePets = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, getEffectiveStats(save.pets[pet.id], save.sleepStartedAt[pet.id], now)])) as Record<PetId, PetStats>
  const selectedStats = effectivePets[save.selectedPetId]
  const isSleeping = save.sleepStartedAt[save.selectedPetId] > 0 && selectedStats.sleepiness > 0

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  }, [save])

  function selectPet(selectedPetId: PetId) {
    setSave(current => ({ ...current, selectedPetId }))
  }

  function care(action: PetCareAction, actionNow = Date.now()): PetCareResult | null {
    const petId = save.selectedPetId
    const config = PET_CARE_CONFIG[action]
    const stats = getEffectiveStats(save.pets[petId], save.sleepStartedAt[petId], actionNow)
    const sleeping = save.sleepStartedAt[petId] > 0 && stats.sleepiness > 0
    if (sleeping && action !== 'pet') return null
    if (config.category === 'feed' && stats.fullness >= 100) return null
    if (config.category !== 'pet' && getCareCooldownRemaining(config.category, save.cooldownUntil[petId], actionNow) > 0) return null

    const previousPetting = save.petting[petId]
    const petCount = action === 'pet'
      ? (actionNow - previousPetting.lastAt <= PET_PETTING_RESET_MS ? previousPetting.count + 1 : 1)
      : previousPetting.count
    const angry = action === 'pet' && petCount > 10
    const annoyed = action === 'pet' && petCount > 5
    const result: PetCareResult = angry
      ? { expression: 'angry', motion: 'angry', message: 'overpetted' }
      : annoyed
        ? { expression: 'annoyed', motion: 'pet', message: 'annoyed' }
        : action === 'pet'
          ? { expression: 'petted', motion: 'pet', message: 'petted' }
          : config.category === 'feed'
            ? { expression: 'happy', motion: 'feed', message: 'fed' }
            : { expression: 'happy', motion: 'play', message: 'played' }

    setSave(current => {
      const currentPetId = current.selectedPetId
      const currentStats = getEffectiveStats(current.pets[currentPetId], current.sleepStartedAt[currentPetId], actionNow)
      const currentConfig = PET_CARE_CONFIG[action]
      const currentSleeping = current.sleepStartedAt[currentPetId] > 0 && currentStats.sleepiness > 0
      if (currentSleeping && action !== 'pet') return current
      if (currentConfig.category === 'feed' && currentStats.fullness >= 100) return current
      if (currentConfig.category !== 'pet' && getCareCooldownRemaining(currentConfig.category, current.cooldownUntil[currentPetId], actionNow) > 0) return current

      const previous = current.petting[currentPetId]
      const count = action === 'pet' ? (actionNow - previous.lastAt <= PET_PETTING_RESET_MS ? previous.count + 1 : 1) : previous.count
      const overpetted = action === 'pet' && count > 10
      const nextStats = addExp({
        ...currentStats,
        fullness: clamp(currentStats.fullness + currentConfig.fullness),
        sleepiness: clamp(currentStats.sleepiness + currentConfig.sleepiness),
        affection: clamp(currentStats.affection + (overpetted ? -3 : currentConfig.affection)),
      }, overpetted ? 0 : currentConfig.exp)
      const startsSleeping = nextStats.sleepiness >= 100

      return {
        ...current,
        pets: { ...current.pets, [currentPetId]: nextStats },
        lastCareAt: { ...current.lastCareAt, [currentPetId]: { ...current.lastCareAt[currentPetId], [action]: actionNow } },
        cooldownUntil: currentConfig.category === 'pet' ? current.cooldownUntil : {
          ...current.cooldownUntil,
          [currentPetId]: { ...current.cooldownUntil[currentPetId], [currentConfig.category]: actionNow + currentConfig.cooldownMs },
        },
        petting: action === 'pet' ? { ...current.petting, [currentPetId]: { count, lastAt: actionNow } } : current.petting,
        sleepStartedAt: { ...current.sleepStartedAt, [currentPetId]: startsSleeping ? (current.sleepStartedAt[currentPetId] || actionNow) : 0 },
      }
    })
    return result
  }

  function setExpression(kind: PetExpression, durationMs = 0, expressionNow = Date.now()) {
    setSave(current => ({
      ...current,
      expressions: { ...current.expressions, [current.selectedPetId]: { kind, until: durationMs > 0 ? expressionNow + durationMs : 0 } },
    }))
  }

  return {
    selectedPetId: save.selectedPetId,
    selectedStats,
    petStats: effectivePets,
    cooldownUntil: save.cooldownUntil[save.selectedPetId],
    expressionState: save.expressions[save.selectedPetId],
    pettingState: save.petting[save.selectedPetId],
    isSleeping,
    selectPet,
    care,
    setExpression,
    maxLevel: MAX_LEVEL,
  }
}
