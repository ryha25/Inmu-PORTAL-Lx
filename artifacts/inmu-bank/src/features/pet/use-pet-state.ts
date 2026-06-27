import { useEffect, useState } from 'react'
import { PET_DEFINITIONS, type PetId } from './pet-data'

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

type PetSaveData = {
  version: 1
  selectedPetId: PetId
  pets: Record<PetId, PetStats>
}

const DEFAULT_STATS: PetStats = {
  level: 1,
  exp: 0,
  fullness: 50,
  sleepiness: 20,
  affection: 10,
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function readNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function createDefaultSave(): PetSaveData {
  return {
    version: 1,
    selectedPetId: PET_DEFINITIONS[0].id,
    pets: Object.fromEntries(
      PET_DEFINITIONS.map(pet => [pet.id, { ...DEFAULT_STATS }]),
    ) as Record<PetId, PetStats>,
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

function loadSave(): PetSaveData {
  const fallback = createDefaultSave()
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PetSaveData>
    const validSelection = PET_DEFINITIONS.some(pet => pet.id === parsed.selectedPetId)
    return {
      version: 1,
      selectedPetId: validSelection ? parsed.selectedPetId! : fallback.selectedPetId,
      pets: Object.fromEntries(
        PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(parsed.pets?.[pet.id])]),
      ) as Record<PetId, PetStats>,
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
  if (action === 'feed') {
    return addExp({
      ...stats,
      fullness: clamp(stats.fullness + 20),
      affection: clamp(stats.affection + 1),
    }, 5)
  }
  if (action === 'play') {
    return addExp({
      ...stats,
      affection: clamp(stats.affection + 3),
      sleepiness: clamp(stats.sleepiness + 5),
    }, 5)
  }
  if (action === 'sleep') return { ...stats, sleepiness: 0 }
  return addExp({ ...stats, affection: clamp(stats.affection + 2) }, 2)
}

export function usePetState() {
  const [save, setSave] = useState<PetSaveData>(loadSave)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  }, [save])

  function selectPet(selectedPetId: PetId) {
    setSave(current => ({ ...current, selectedPetId }))
  }

  function care(action: PetAction) {
    setSave(current => {
      const currentStats = current.pets[current.selectedPetId]
      if (action === 'feed' && currentStats.fullness >= 100) return current
      return {
        ...current,
        pets: {
          ...current.pets,
          [current.selectedPetId]: applyAction(currentStats, action),
        },
      }
    })
  }

  return {
    selectedPetId: save.selectedPetId,
    selectedStats: save.pets[save.selectedPetId],
    petStats: save.pets,
    selectPet,
    care,
    maxLevel: MAX_LEVEL,
  }
}
