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
export type PetItemState = { sleepTea: number }
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
export const PET_SLEEP_RECOVERY_MS = 30 * 60 * 1000
export const PET_FULLNESS_DECAY_MS = 12 * 60 * 1000
export const PET_SLEEPINESS_GAIN_MS = 10 * 60 * 1000
export const PET_PREMIUM_DAILY_FREE = 3

export type PetLevelCurve = { baseExp: number; perLevelExp: number }
// Keep progression deliberate, but avoid the previous early-level spike.
export const DEFAULT_PET_LEVEL_CURVE: PetLevelCurve = { baseExp: 90, perLevelExp: 70 }
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
  'feed-basic': { category: 'feed', cooldownMs: 10 * 60 * 1000, fullness: 20, exp: 5, affection: 2, sleepiness: 0 },
  'feed-premium': { category: 'feed', cooldownMs: 0, fullness: 40, exp: 15, affection: 10, sleepiness: 0 },
  'play-yarn': { category: 'play', cooldownMs: 10 * 60 * 1000, fullness: 0, exp: 5, affection: 3, sleepiness: 5 },
  'play-ball': { category: 'play', cooldownMs: 20 * 60 * 1000, fullness: 0, exp: 10, affection: 5, sleepiness: 10 },
  'play-toy': { category: 'play', cooldownMs: 30 * 60 * 1000, fullness: 0, exp: 15, affection: 7, sleepiness: 15 },
  pet: { category: 'pet', cooldownMs: 0, fullness: 0, exp: 1, affection: 1, sleepiness: 0 },
}

type PetActionTimes = Record<PetCareAction, number>
type PetCooldownUntil = Record<PetCareCategory, number>
type PetProgressState = { fullnessAt: number; sleepinessAt: number }
type PremiumFoodSave = { dailyDate: string; dailyUsed: number; inventory: number }

type PetSaveData = {
  version: 5
  selectedPetId: PetId
  activePetIds: PetId[]
  pets: Record<PetId, PetStats>
  lastCareAt: Record<PetId, PetActionTimes>
  cooldownUntil: Record<PetId, PetCooldownUntil>
  expressions: Record<PetId, PetExpressionState>
  petting: Record<PetId, PettingState>
  sleepStartedAt: Record<PetId, number>
  progress: Record<PetId, PetProgressState>
  premiumFood: PremiumFoodSave
  items: PetItemState
  skillState: Record<PetId, boolean>
  skillActiveCharacterIds: PetId[]
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

function getJstDateKey(timestamp = Date.now()) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
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

function createDefaultSave(): PetSaveData {
  const now = Date.now()
  return {
    version: 5,
    selectedPetId: PET_DEFINITIONS[0].id,
    activePetIds: [],
    pets: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...DEFAULT_STATS }])) as Record<PetId, PetStats>,
    lastCareAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_ACTION_TIMES }])) as Record<PetId, PetActionTimes>,
    cooldownUntil: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { ...EMPTY_COOLDOWNS }])) as Record<PetId, PetCooldownUntil>,
    expressions: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { kind: 'default', until: 0 }])) as Record<PetId, PetExpressionState>,
    petting: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { count: 0, lastAt: 0 }])) as Record<PetId, PettingState>,
    sleepStartedAt: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, 0])) as Record<PetId, number>,
    progress: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, { fullnessAt: now, sleepinessAt: now }])) as Record<PetId, PetProgressState>,
    premiumFood: { dailyDate: getJstDateKey(now), dailyUsed: 0, inventory: 0 },
    items: { sleepTea: 0 },
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
    const activePetIds = Array.isArray(parsed.activePetIds)
      ? parsed.activePetIds.filter((id, index, list): id is PetId => Boolean(PET_BY_ID[id as PetId]) && list.indexOf(id) === index).slice(0, 3)
      : []
    const pets = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeStats(parsed.pets?.[pet.id], pet.id)])) as Record<PetId, PetStats>
    const lastCareAt = Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, sanitizeActionTimes(parsed.lastCareAt?.[pet.id])])) as Record<PetId, PetActionTimes>
    return {
      version: 5,
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
      progress: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, {
        fullnessAt: Math.max(0, readNumber(parsed.progress?.[pet.id]?.fullnessAt, Date.now())),
        sleepinessAt: Math.max(0, readNumber(parsed.progress?.[pet.id]?.sleepinessAt, Date.now())),
      }])) as Record<PetId, PetProgressState>,
      premiumFood: sanitizePremiumFood(parsed.premiumFood),
      items: { sleepTea: Math.max(0, Math.floor(readNumber(parsed.items?.sleepTea, 0))) },
      skillState: Object.fromEntries(PET_DEFINITIONS.map(pet => [pet.id, parsed.skillState?.[pet.id] !== false])) as Record<PetId, boolean>,
      skillActiveCharacterIds: (() => {
        const legacySingle = (parsed as LegacySaveData & { skillActiveCharacterId?: unknown }).skillActiveCharacterId
        const values = Array.isArray(parsed.skillActiveCharacterIds)
          ? parsed.skillActiveCharacterIds
          : legacySingle != null ? [legacySingle] : []
        return values
          .filter((id, index, list): id is PetId => Boolean(PET_BY_ID[id as PetId]) && list.indexOf(id) === index)
          .slice(0, 3)
      })(),
    }
  } catch {
    return fallback
  }
}

function addExp(stats: PetStats, amount: number, petId: PetId): PetStats {
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

function materializeSaveAt(save: PetSaveData, now: number): PetSaveData {
  const pets = { ...save.pets }
  const progress = { ...save.progress }
  const sleepStartedAt = { ...save.sleepStartedAt }

  PET_DEFINITIONS.forEach(pet => {
    const id = pet.id
    const stats = save.pets[id]
    const currentProgress = save.progress[id]
    const fullnessSteps = Math.max(0, Math.floor((now - currentProgress.fullnessAt) / PET_FULLNESS_DECAY_MS))
    const nextProgress: PetProgressState = {
      fullnessAt: currentProgress.fullnessAt + fullnessSteps * PET_FULLNESS_DECAY_MS,
      sleepinessAt: currentProgress.sleepinessAt,
    }
    let nextStats = { ...stats, fullness: clamp(stats.fullness - fullnessSteps) }

    if (save.sleepStartedAt[id] > 0) {
      const recovery = Math.floor(((now - save.sleepStartedAt[id]) / PET_SLEEP_RECOVERY_MS) * 100)
      if (recovery >= 100) {
        const wokeAt = save.sleepStartedAt[id] + PET_SLEEP_RECOVERY_MS
        const awakeSteps = Math.max(0, Math.floor((now - wokeAt) / PET_SLEEPINESS_GAIN_MS))
        nextStats = { ...nextStats, sleepiness: clamp(awakeSteps) }
        nextProgress.sleepinessAt = wokeAt + awakeSteps * PET_SLEEPINESS_GAIN_MS
        sleepStartedAt[id] = nextStats.sleepiness >= PET_SLEEP_THRESHOLD ? now : 0
      } else {
        nextStats = { ...nextStats, sleepiness: clamp(100 - recovery) }
        nextProgress.sleepinessAt = now
      }
    } else {
      const sleepinessSteps = Math.max(0, Math.floor((now - currentProgress.sleepinessAt) / PET_SLEEPINESS_GAIN_MS))
      nextStats = { ...nextStats, sleepiness: clamp(stats.sleepiness + sleepinessSteps) }
      nextProgress.sleepinessAt = currentProgress.sleepinessAt + sleepinessSteps * PET_SLEEPINESS_GAIN_MS
      if (nextStats.sleepiness >= PET_SLEEP_THRESHOLD) sleepStartedAt[id] = now
    }

    pets[id] = nextStats
    progress[id] = nextProgress
  })

  return {
    ...save,
    pets,
    progress,
    sleepStartedAt,
    premiumFood: sanitizePremiumFood(save.premiumFood, now),
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
  const initialLocalSave = useRef(save)
  const lastSaveTimestamp = useRef(0)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const now = Date.now()
  const effectiveSave = materializeSaveAt(save, now)
  const selectedStats = effectiveSave.pets[save.selectedPetId]
  const isSleeping = effectiveSave.sleepStartedAt[save.selectedPetId] > 0
  const premiumFood = getPremiumFoodState(effectiveSave.premiumFood, now)

  useEffect(() => {
    let cancelled = false
    async function hydrateFromDatabase() {
      try {
        const response = await fetch('/api/pet/state', { credentials: 'include' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error ?? 'INMU PETデータの取得に失敗しました')
        if (cancelled) return
        if (data.hasState && data.state) {
          setSave(loadSave(data.state))
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
    const snapshot = save
    const clientUpdatedAt = Math.max(Date.now(), lastSaveTimestamp.current + 1)
    lastSaveTimestamp.current = clientUpdatedAt
    saveQueue.current = saveQueue.current.catch(() => undefined).then(async () => {
      const response = await fetch('/api/pet/state', {
        method: 'PUT',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: snapshot, clientUpdatedAt }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'INMU PETデータの保存に失敗しました')
      }
      setSyncError(null)
    }).catch(error => {
      setSyncError(error instanceof Error ? error.message : 'INMU PETデータの保存に失敗しました')
    })
  }, [isHydrated, save])

  useEffect(() => {
    const materialize = () => setSave(current => materializeSaveAt(current, Date.now()))
    materialize()
    const interval = window.setInterval(materialize, 60 * 1000)
    return () => window.clearInterval(interval)
  }, [])

  function selectPet(selectedPetId: PetId) {
    setSave(current => ({ ...current, selectedPetId }))
  }

  function setActivePetIds(nextActivePetIds: PetId[] | ((current: PetId[]) => PetId[])) {
    setSave(current => {
      const activePetIds = typeof nextActivePetIds === 'function'
        ? nextActivePetIds(current.activePetIds)
        : nextActivePetIds
      return {
        ...current,
        activePetIds: activePetIds.filter((id, index, list) => Boolean(PET_BY_ID[id]) && list.indexOf(id) === index).slice(0, 3),
      }
    })
  }

  function setSkillActiveCharacterIds(nextIds: PetId[] | ((current: PetId[]) => PetId[])) {
    setSave(current => {
      const ids = typeof nextIds === 'function' ? nextIds(current.skillActiveCharacterIds) : nextIds
      return {
        ...current,
        skillActiveCharacterIds: ids
          .filter((id, index, list) => Boolean(PET_BY_ID[id]) && list.indexOf(id) === index)
          .slice(0, 3),
      }
    })
  }

  function care(action: PetCareAction, actionNow = Date.now()): PetCareResult | null {
    const petId = save.selectedPetId
    const config = PET_CARE_CONFIG[action]
    const currentEffective = materializeSaveAt(save, actionNow)
    const stats = currentEffective.pets[petId]
    const sleeping = currentEffective.sleepStartedAt[petId] > 0
    if (sleeping && action !== 'pet') return null
    if (config.category === 'feed' && stats.fullness >= 100) return null
    if (config.category === 'feed' && getActionCooldownRemaining(action, currentEffective.lastCareAt[petId], actionNow) > 0) return null
    if (config.category !== 'pet' && getCareCooldownRemaining(config.category, save.cooldownUntil[petId], actionNow) > 0) return null
    if (action === 'feed-premium' && getPremiumFoodState(currentEffective.premiumFood, actionNow).totalAvailable <= 0) return null

    const previousPetting = save.petting[petId]
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

    setSave(current => {
      const materialized = materializeSaveAt(current, actionNow)
      const currentPetId = materialized.selectedPetId
      const currentStats = materialized.pets[currentPetId]
      const currentConfig = PET_CARE_CONFIG[action]
      const currentSleeping = materialized.sleepStartedAt[currentPetId] > 0
      if (currentSleeping && action !== 'pet') return current
      if (currentConfig.category === 'feed' && currentStats.fullness >= 100) return current
      if (currentConfig.category === 'feed' && getActionCooldownRemaining(action, materialized.lastCareAt[currentPetId], actionNow) > 0) return current
      if (currentConfig.category !== 'pet' && getCareCooldownRemaining(currentConfig.category, materialized.cooldownUntil[currentPetId], actionNow) > 0) return current
      const premiumState = getPremiumFoodState(materialized.premiumFood, actionNow)
      if (action === 'feed-premium' && premiumState.totalAvailable <= 0) return current

      const previous = materialized.petting[currentPetId]
      const savedExpression = materialized.expressions[currentPetId]
      const stillAngry = action === 'pet' && savedExpression.kind === 'angry' && savedExpression.until > actionNow
      const count = action === 'pet' ? (actionNow - previous.lastAt <= PET_PETTING_RESET_MS ? previous.count + 1 : 1) : previous.count
      const triggeredAnger = action === 'pet' && !stillAngry && (sleepPettingAnger || count >= PET_PETTING_ANGER_COUNT)
      const overpetted = stillAngry || triggeredAnger
      const affectionDelta = overpetted ? -3 : currentConfig.affection
      const nextStats = addExp({
        ...currentStats,
        fullness: clamp(currentStats.fullness + currentConfig.fullness),
        sleepiness: clamp(currentStats.sleepiness + currentConfig.sleepiness),
        affection: clamp(currentStats.affection + affectionDelta),
      }, overpetted ? 0 : currentConfig.exp, currentPetId)
      const startsSleeping = nextStats.sleepiness >= PET_SLEEP_THRESHOLD
      let premiumFood = materialized.premiumFood
      if (action === 'feed-premium') {
        premiumFood = premiumState.dailyRemaining > 0
          ? { ...premiumFood, dailyUsed: premiumFood.dailyUsed + 1 }
          : { ...premiumFood, inventory: Math.max(0, premiumFood.inventory - 1) }
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
        premiumFood,
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

  function grantPremiumFood(amount: number) {
    const grant = Math.max(0, Math.floor(amount))
    if (grant <= 0) return
    setSave(current => ({
      ...current,
      premiumFood: { ...sanitizePremiumFood(current.premiumFood), inventory: current.premiumFood.inventory + grant },
    }))
  }

  function useSleepTea(amount: number) {
    const requested = Math.min(3, Math.max(1, Math.floor(amount)))
    const petId = effectiveSave.selectedPetId
    const available = Math.max(0, Math.floor(effectiveSave.items?.sleepTea ?? 0))
    const used = Math.min(requested, available, Math.max(0, PET_BY_ID[petId].maxLevel - effectiveSave.pets[petId].level))
    if (used <= 0) return 0
    setSave(current => {
      const materialized = materializeSaveAt(current, Date.now())
      const currentPetId = materialized.selectedPetId
      const stats = materialized.pets[currentPetId]
      const currentAvailable = Math.max(0, Math.floor(materialized.items?.sleepTea ?? 0))
      const applied = Math.min(used, currentAvailable, Math.max(0, PET_BY_ID[currentPetId].maxLevel - stats.level))
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
      }
    })
    return used
  }

  return {
    selectedPetId: save.selectedPetId,
    activePetIds: effectiveSave.activePetIds,
    selectedStats,
    petStats: effectiveSave.pets,
    cooldownUntil: effectiveSave.cooldownUntil[save.selectedPetId],
    lastCareAt: effectiveSave.lastCareAt[save.selectedPetId],
    expressionState: effectiveSave.expressions[save.selectedPetId],
    pettingState: effectiveSave.petting[save.selectedPetId],
    premiumFood,
    items: effectiveSave.items,
    isSleeping,
    selectPet,
    setActivePetIds,
    care,
    setExpression,
    grantPremiumFood,
    useSleepTea,
    maxLevel: PET_BY_ID[save.selectedPetId].maxLevel,
    isHydrated,
    syncError,
    skillState: effectiveSave.skillState,
    skillActiveCharacterIds: effectiveSave.skillActiveCharacterIds,
    setSkillActiveCharacterIds,
  }
}

export function initializeAwardedPetAtLevelOne(petId: string) {
  if (!(petId in PET_BY_ID)) return
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PetSaveData>
    const fallback = createDefaultSave()
    const current = parsed.version ? { ...fallback, ...parsed } as PetSaveData : fallback
    const id = petId as PetId
    const now = Date.now()
    const next: PetSaveData = {
      ...current,
      pets: { ...current.pets, [id]: { ...DEFAULT_STATS } },
      lastCareAt: { ...current.lastCareAt, [id]: { ...EMPTY_ACTION_TIMES } },
      cooldownUntil: { ...current.cooldownUntil, [id]: { ...EMPTY_COOLDOWNS } },
      expressions: { ...current.expressions, [id]: { kind: 'default', until: 0 } },
      petting: { ...current.petting, [id]: { count: 0, lastAt: 0 } },
      sleepStartedAt: { ...current.sleepStartedAt, [id]: 0 },
      progress: { ...current.progress, [id]: { fullnessAt: now, sleepinessAt: now } },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A broken local save should not prevent receiving the character.
  }
}
