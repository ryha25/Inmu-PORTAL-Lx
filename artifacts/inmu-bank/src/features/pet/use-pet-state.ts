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

export type PetAction = 'feed' | 'play' | 'sleep' | 'pet'
export type PetActionTimes = Record<PetAction, number>
export type PetExpressionState = { kind: PetExpression; until: number }

// 管理画面対応時はこの設定値をAPI由来へ置き換える。
export const PET_CARE_COOLDOWNS_MS: Record<PetAction, number> = {
  feed: 10 * 60 * 1000,
  play: 10 * 60 * 1000,
  sleep: 30 * 60 * 1000,
  pet: 3 * 60 * 1000,
}

type PetSaveData = {
  version: 2
  selectedPetId: PetId
  pets: Record<PetId, PetStats>
  lastCareAt: Record<PetId, PetActionTimes>
  expressions: Record<PetId, PetExpressionState>
}

const DEFAULT_STATS: PetStats = {
  level: 1,
  exp: 0,
  fullness: 50,
  sleepiness: 20,
  affection: 10,
}

const EMPTY_ACTION_TIMES: PetActionTimes = { feed: 0, play: 0, sleep: 0, pet: 0 }
const VALID_EXPRESSIONS = new Set<PetExpression>(['default', 'blink', 'happy', 'sleepy', 'hungry', 'petted', 'affectionate'])

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createDefaultSave(): PetSaveData {
  return {
    version: 2,
    selectedPetId: PET_DEFINITIONS[0].id,
    pets: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...DEFAULT_STATS }])) as Record<PetId, PetStats>,
    lastCareAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_ACTION_TIMES }])) as Record<PetId, PetActionTimes>,
    expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { kind: 'default', until: 0 }])) as Record<PetId, PetExpressionState>,
  }
}

function sanitizeStats(value: Partial<PetStats> | undefined): PetStats {
  const level = clamp(readNumber(value?.level, DEFAULT_STATS.level), 1, MAX_LEVEL)
  const requiredExp = level * 20
  return {
    level,
    exp: level >= MAX_LEVEL ? 0 : clamp(readNumber(value?.exp, DEFAULT_STATS.exp), 0, requiredExp - 1),
    fullness: clamp(readNumber(value?.fullness, DEFAULT_STATS.fullness)),
    sleepiness: clamp(readNumber(value?.sleepiness, DEFAULT_STATS.sleepiness)),
    affection: clamp(readNumber(value?.affection, DEFAULT_STATS.affection)),
  }
}

function sanitizeActionTimes(value: Partial<PetActionTimes> | undefined): PetActionTimes {
  return {
    feed: Math.max(0, readNumber(value?.feed, 0)),
    play: Math.max(0, readNumber(value?.play, 0)),
    sleep: Math.max(0, readNumber(value?.sleep, 0)),
    pet: Math.max(0, readNumber(value?.pet, 0)),
  }
}

function sanitizeExpression(value: Partial<PetExpressionState> | undefined): PetExpressionState {
  const kind = VALID_EXPRESSIONS.has(value?.kind as PetExpression) ? value!.kind as PetExpression : 'default'
  const until = Math.max(0, readNumber(value?.until, 0))
  return until > Date.now() ? { kind, until } : { kind: 'default', until: 0 }
}

function loadSave(): PetSaveData {
  const fallback = createDefaultSave()
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PetSaveData>
    const validSelection = PET_DEFINITIONS.some(pet => pet.id === parsed.selectedPetId)
    return {
      version: 2,
      selectedPetId: validSelection ? parsed.selectedPetId! : fallback.selectedPetId,
      pets: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(parsed.pets?.[pet.id])])) as Record<PetId, PetStats>,
      lastCareAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeActionTimes(parsed.lastCareAt?.[pet.id])])) as Record<PetId, PetActionTimes>,
      expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeExpression(parsed.expressions?.[pet.id])])) as Record<PetId, PetExpressionState>,
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

function applyAction(stats: PetStats, action: PetAction): PetStats {
  if (action === 'feed') return addExp({ ...stats, fullness: clamp(stats.fullness + 20), affection: clamp(stats.affection + 1) }, 5)
  if (action === 'play') return addExp({ ...stats, affection: clamp(stats.affection + 3), sleepiness: clamp(stats.sleepiness + 5) }, 5)
  if (action === 'sleep') return { ...stats, sleepiness: 0 }
  return addExp({ ...stats, affection: clamp(stats.affection + 2) }, 2)
}

export function getPetCooldownRemaining(action: PetAction, lastCareAt: PetActionTimes, now = Date.now()) {
  return Math.max(0, PET_CARE_COOLDOWNS_MS[action] - (now - lastCareAt[action]))
}

export function usePetState() {
  const [save, setSave] = useState<PetSaveData>(loadSave)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  }, [save])

  function selectPet(selectedPetId: PetId) {
    setSave(current => ({ ...current, selectedPetId }))
  }

  function care(action: PetAction, now = Date.now()) {
    const currentStats = save.pets[save.selectedPetId]
    if (action === 'feed' && currentStats.fullness >= 100) return false
    if (getPetCooldownRemaining(action, save.lastCareAt[save.selectedPetId], now) > 0) return false

    setSave(current => {
      const petId = current.selectedPetId
      const stats = current.pets[petId]
      if (action === 'feed' && stats.fullness >= 100) return current
      if (getPetCooldownRemaining(action, current.lastCareAt[petId], now) > 0) return current
      return {
        ...current,
        pets: { ...current.pets, [petId]: applyAction(stats, action) },
        lastCareAt: {
          ...current.lastCareAt,
          [petId]: { ...current.lastCareAt[petId], [action]: now },
        },
      }
    })
    return true
  }

  function setExpression(kind: PetExpression, durationMs = 0, now = Date.now()) {
    setSave(current => ({
      ...current,
      expressions: {
        ...current.expressions,
        [current.selectedPetId]: { kind, until: durationMs > 0 ? now + durationMs : 0 },
      },
    }))
  }

  return {
    selectedPetId: save.selectedPetId,
    selectedStats: save.pets[save.selectedPetId],
    petStats: save.pets,
    lastCareAt: save.lastCareAt[save.selectedPetId],
    expressionState: save.expressions[save.selectedPetId],
    selectPet,
    care,
    setExpression,
    maxLevel: MAX_LEVEL,
  }
}
