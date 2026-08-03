import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Html, Preload, Sky, useTexture } from '@react-three/drei'
import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BattleHud } from './battle-hud'
import { BattlePetAvatar3D } from './battle-pet-avatar-3d'
import { MobileControls } from './mobile-controls'
import { PET_DEFINITIONS } from './pet-definitions'
import blueSlimeSprite from '../../../../../attached_assets/battle-blue-slime-v1.png'
import { TEST_MONSTER } from './monster-data'
import { rollDamage } from './combat-math'
import type { BattleResult, BattleSceneHandle, BattleSettings, BattleSnapshot, DamagePopup } from './types'

type RuntimeActions = BattleSceneHandle
type AvatarAction = 'idle' | 'attack' | 'dodge' | 'ultimate' | 'hurt' | 'switch'

const INITIAL_SNAPSHOT: BattleSnapshot = {
  phase: 'ready', playerHp: 1, playerMaxHp: 1, playerSp: 0, playerMaxSp: 100,
  enemyHp: 1, enemyMaxHp: 1, remainingSeconds: 0, attackCooldown: 0,
  dodgeCooldown: 0, ultimateCooldown: 0, femaleBuffSeconds: 0, message: '',
  activePetId: 'yajusenpai-male-evolved', party: [], switchCooldown: 0,
}

export const BattleScene = forwardRef<BattleSceneHandle, {
  battleId: string
  settings: BattleSettings
  onFinish: (result: BattleResult) => void
}>(({ battleId, settings, onFinish }, ref) => {
  const actions = useRef<RuntimeActions | null>(null)
  const [snapshot, setSnapshot] = useState<BattleSnapshot>({
    ...INITIAL_SNAPSHOT,
    phase: 'playing',
    playerHp: settings.petHp,
    playerMaxHp: settings.petHp,
    playerSp: settings.petSp,
    playerMaxSp: Math.max(1, settings.petSp),
    enemyHp: settings.enemyHp,
    enemyMaxHp: settings.enemyHp,
    remainingSeconds: settings.timeLimit,
    activePetId: settings.partyPetIds[0] ?? settings.petId,
    party: (settings.partyPetIds.length ? settings.partyPetIds : [settings.petId]).map((petId, index) => {
      const maxHp = index === 0 ? settings.petHp : PET_DEFINITIONS[petId].hp
      return { petId, hp: maxHp, maxHp, defeated: false }
    }),
  })
  const [attackPulse, setAttackPulse] = useState(0)
  const [ultimatePulse, setUltimatePulse] = useState<{ id: number; kind: 'male' | 'female' } | null>(null)
  const [hitPulse, setHitPulse] = useState(0)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const [isPortraitMobile, setIsPortraitMobile] = useState(() => isMobile && window.matchMedia('(orientation: portrait)').matches)

  useEffect(() => {
    if (!isMobile) return
    const query = window.matchMedia('(orientation: portrait)')
    const update = () => setIsPortraitMobile(query.matches)
    query.addEventListener('change', update)
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }
    void orientation.lock?.('landscape').catch(() => undefined)
    return () => query.removeEventListener('change', update)
  }, [isMobile])

  useImperativeHandle(ref, () => ({
    attack: () => actions.current?.attack(),
    ultimate: () => actions.current?.ultimate(),
    dodge: () => actions.current?.dodge(),
    switchPet: () => actions.current?.switchPet(),
    togglePause: () => actions.current?.togglePause(),
    setMobileMove: (x, y) => actions.current?.setMobileMove(x, y),
    addMobileLook: (x, y) => actions.current?.addMobileLook(x, y),
    abort: () => actions.current?.abort(),
  }), [])

  const register = useCallback((runtime: RuntimeActions) => { actions.current = runtime }, [])

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <Canvas
        shadows
        dpr={isMobile ? [1.25, 1.6] : [1.25, 1.85]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 58, near: 0.1, far: 100, position: [0, 3.4, 15.5] }}
        onPointerDown={(event) => {
          if (!isMobile && event.nativeEvent.button === 0) {
            event.currentTarget.requestPointerLock?.()
          }
        }}
      >
        <Suspense fallback={<Html center><div className="whitespace-nowrap bg-black/80 px-4 py-3 text-sm text-white">3Dステージ読み込み中...</div></Html>}>
          <BattleWorld
            battleId={battleId}
            settings={settings}
            register={register}
            onSnapshot={setSnapshot}
            onAttackVisual={() => setAttackPulse((value) => value + 1)}
            onUltimateVisual={(kind) => {
              const id = Date.now()
              setUltimatePulse({ id, kind })
              window.setTimeout(() => setUltimatePulse(current => current?.id === id ? null : current), 900)
            }}
            onPlayerHit={() => setHitPulse((value) => value + 1)}
            onFinish={onFinish}
          />
          <Preload all />
        </Suspense>
      </Canvas>
      <BattleHud snapshot={snapshot} onPause={() => actions.current?.togglePause()} onAbort={() => actions.current?.abort()} onSwitch={() => actions.current?.switchPet()} />
      <div key={attackPulse} className="pointer-events-none absolute bottom-[22%] left-1/2 z-20 size-32 -translate-x-1/2 animate-[battle-swipe_.22s_ease-out] rounded-full border-4 border-amber-200/80 bg-amber-300/15 blur-[1px]" />
      {ultimatePulse && <><div key={ultimatePulse.id} className={`pointer-events-none absolute inset-0 z-[19] animate-[battle-ultimate_.8s_ease-out] ${ultimatePulse.kind === 'male' ? 'bg-amber-300/45' : 'bg-fuchsia-500/35'}`} /><div className="pointer-events-none absolute inset-x-0 top-[28%] z-30 animate-[battle-cutin_.9s_ease-out_forwards] border-y border-white/50 bg-black/80 py-4 text-center text-2xl font-black text-white">{PET_DEFINITIONS[snapshot.activePetId].ultimateName}</div></>}
      {hitPulse > 0 && <div key={hitPulse} className="pointer-events-none absolute inset-0 z-[18] animate-[battle-hit_.35s_ease-out] shadow-[inset_0_0_55px_12px_rgba(220,38,38,.52)]" />}
      {isMobile && !isPortraitMobile && (
        <MobileControls
          onMove={(x, y) => actions.current?.setMobileMove(x, y)}
          onLook={(x, y) => actions.current?.addMobileLook(x, y)}
          onAttack={() => actions.current?.attack()}
          onUltimate={() => actions.current?.ultimate()}
          onDodge={() => actions.current?.dodge()}
          onSwitch={() => actions.current?.switchPet()}
        />
      )}
      {isPortraitMobile && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-[#07101d]/95 px-8 text-center text-white">
          <div>
            <div className="mx-auto mb-5 h-16 w-28 rounded border-2 border-amber-300/70" />
            <p className="text-xl font-bold">端末を横向きにしてください</p>
            <p className="mt-2 text-sm text-white/70">クエストは横画面で操作できます。</p>
          </div>
        </div>
      )}
      <style>{`@keyframes battle-swipe { from { opacity: 0; transform: translateX(-50%) scale(.6); } 45% { opacity: .9; } to { opacity: 0; transform: translateX(-50%) scale(1.25); } } @keyframes battle-ultimate { from { opacity: 0; } 35% { opacity: 1; } to { opacity: 0; } } @keyframes battle-cutin { from { opacity: 0; transform: translateX(-12%); } 25%,70% { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(12%); } } @keyframes battle-hit { from { opacity: 1; } to { opacity: 0; } }`}</style>
    </div>
  )
})
BattleScene.displayName = 'BattleScene'

function BattleWorld({ battleId, settings, register, onSnapshot, onAttackVisual, onUltimateVisual, onPlayerHit, onFinish }: {
  battleId: string
  settings: BattleSettings
  register: (actions: RuntimeActions) => void
  onSnapshot: (snapshot: BattleSnapshot) => void
  onAttackVisual: () => void
  onUltimateVisual: (kind: 'male' | 'female') => void
  onPlayerHit: () => void
  onFinish: (result: BattleResult) => void
}) {
  const { camera, gl } = useThree()
  const partyIds = useMemo(() => {
    const unique = settings.partyPetIds.filter((petId, index, ids) => ids.indexOf(petId) === index)
    return (unique.length ? unique : [settings.petId]).slice(0, 3)
  }, [settings.partyPetIds, settings.petId])
  const [activePetIndexState, setActivePetIndexState] = useState(0)
  const activePetIndex = useRef(0)
  const activePetId = useRef(partyIds[0])
  const partyMaxHp = useRef(partyIds.map((petId, index) => index === 0 ? settings.petHp : PET_DEFINITIONS[petId].hp))
  const partyHp = useRef([...partyMaxHp.current])
  const partySp = useRef(partyIds.map((petId, index) => index === 0 ? settings.petSp : PET_DEFINITIONS[petId].sp))
  const startedAt = useRef(Date.now())
  const phase = useRef<'playing' | 'paused' | 'won' | 'lost' | 'timeout' | 'aborted'>('playing')
  const playerPosition = useRef(new THREE.Vector3(0, 0, 9))
  const enemyPosition = useRef(new THREE.Vector3(0, 0, 0))
  const enemyGroup = useRef<THREE.Group>(null)
  const playerGroup = useRef<THREE.Group>(null)
  const playerHp = useRef(settings.petHp)
  const playerSp = useRef(settings.petSp)
  const enemyHp = useRef(settings.enemyHp)
  const remaining = useRef(settings.timeLimit)
  const yaw = useRef(0)
  const pitch = useRef(0)
  const keys = useRef(new Set<string>())
  const mobileMove = useRef({ x: 0, y: 0 })
  const mobileLook = useRef({ x: 0, y: 0 })
  const attackReadyAt = useRef(0)
  const dodgeReadyAt = useRef(0)
  const invulnerableUntil = useRef(0)
  const ultimateReadyAt = useRef(0)
  const femaleBuffUntil = useRef(0)
  const avatarMoving = useRef(false)
  const avatarAction = useRef<AvatarAction>('idle')
  const avatarActionStartedAt = useRef(0)
  const avatarActionUntil = useRef(0)
  const dodgeDirection = useRef<THREE.Vector3 | null>(null)
  const moveDirection = useRef(new THREE.Vector3(0, 0, -1))
  const actionDirection = useRef(new THREE.Vector3(0, 0, -1))
  const playerFacingYaw = useRef(Math.PI)
  const attackDriveUntil = useRef(0)
  const switchReadyAt = useRef(0)
  const enemyAction = useRef<'chase' | 'melee-warning' | 'cone-warning' | 'recover'>('chase')
  const enemyActionUntil = useRef(0)
  const enemyFacingYaw = useRef(0)
  const nextEnemyAttackAt = useRef(1.5)
  const snapshotClock = useRef(0)
  const finished = useRef(false)
  const [popup, setPopup] = useState<DamagePopup | null>(null)
  const popupTimer = useRef<number | null>(null)
  const metrics = useRef({ damageDealt: 0, damageTaken: 0, normalAttackCount: 0, ultimateCount: 0, dodgeCount: 0 })

  const getActivePet = useCallback(() => PET_DEFINITIONS[activePetId.current], [])
  const getActiveStats = useCallback(() => {
    const petId = activePetId.current
    const pet = PET_DEFINITIONS[petId]
    if (petId === settings.petId) return { hp: settings.petHp, atk: settings.petAtk, def: settings.petDef, sp: settings.petSp }
    return { hp: pet.hp, atk: pet.atk, def: pet.def, sp: pet.sp }
  }, [settings.petAtk, settings.petDef, settings.petHp, settings.petId, settings.petSp])
  const beginAvatarAction = useCallback((action: AvatarAction, duration: number) => {
    const now = performance.now() / 1000
    avatarAction.current = action
    avatarActionStartedAt.current = now
    avatarActionUntil.current = now + duration
  }, [])

  const finish = useCallback((outcome: 'won' | 'lost' | 'timeout' | 'aborted') => {
    if (finished.current) return
    finished.current = true
    phase.current = outcome
    document.exitPointerLock?.()
    onFinish({
      battleId,
      mode: 'admin_test',
      startedAt: new Date(startedAt.current).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.current,
      ...metrics.current,
      outcome,
      petId: settings.petId,
      petLevel: settings.petLevel,
      enemyId: 'test-monster',
      rewardsEnabled: false,
    })
  }, [battleId, onFinish, settings.petId, settings.petLevel])

  const switchPet = useCallback((forced = false) => {
    if (phase.current !== 'playing') return false
    if (partyIds.length < 2) {
      if (forced) finish('lost')
      return false
    }
    const now = performance.now() / 1000
    if (!forced && now < switchReadyAt.current) return false
    partyHp.current[activePetIndex.current] = playerHp.current
    partySp.current[activePetIndex.current] = playerSp.current
    let nextIndex = -1
    for (let offset = 1; offset <= partyIds.length; offset += 1) {
      const candidate = (activePetIndex.current + offset) % partyIds.length
      if (partyHp.current[candidate] > 0) { nextIndex = candidate; break }
    }
    if (nextIndex < 0) {
      if (forced) finish('lost')
      return false
    }
    activePetIndex.current = nextIndex
    activePetId.current = partyIds[nextIndex]
    setActivePetIndexState(nextIndex)
    playerHp.current = partyHp.current[nextIndex]
    playerSp.current = partySp.current[nextIndex]
    femaleBuffUntil.current = 0
    switchReadyAt.current = now + 4
    beginAvatarAction('switch', 0.35)
    return true
  }, [beginAvatarAction, finish, partyIds])

  const showPopup = useCallback((amount: number, kind: DamagePopup['kind']) => {
    if (!settings.showDamage) return
    setPopup({ id: Date.now(), amount, kind })
    if (popupTimer.current !== null) window.clearTimeout(popupTimer.current)
    popupTimer.current = window.setTimeout(() => { setPopup(null); popupTimer.current = null }, 650)
  }, [settings.showDamage])

  const enemyInDirection = useCallback((range: number, direction: THREE.Vector3) => {
    const target = enemyPosition.current.clone().add(new THREE.Vector3(0, 1.35, 0))
    const origin = playerPosition.current.clone().add(new THREE.Vector3(0, 1.2, 0))
    const toEnemy = target.sub(origin)
    const distance = toEnemy.length()
    return distance <= range && direction.clone().normalize().dot(toEnemy.normalize()) > 0.72
  }, [])

  const readMoveDirection = useCallback((fallbackToAim = true) => {
    const inputX = mobileMove.current.x + (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0)
    const inputY = mobileMove.current.y + (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0)
    if (Math.abs(inputX) + Math.abs(inputY) > 0.08) {
      return new THREE.Vector3(inputX, 0, -inputY).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
    }
    if (!fallbackToAim && moveDirection.current.lengthSq() > 0.1) return moveDirection.current.clone()
    return new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
  }, [])

  const attack = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    const pet = getActivePet()
    const activeStats = getActiveStats()
    if (!settings.noAttackCooldown && now < attackReadyAt.current) return
    const buffed = activePetId.current === 'yajusenpai-female-evolved' && now < femaleBuffUntil.current
    const cooldown = settings.noAttackCooldown ? 0.08 : pet.attackCooldown * (buffed ? 0.5 : 1)
    attackReadyAt.current = now + cooldown
    const direction = readMoveDirection(true)
    actionDirection.current.copy(direction)
    playerFacingYaw.current = Math.atan2(direction.x, direction.z)
    attackDriveUntil.current = now + 0.2
    metrics.current.normalAttackCount += 1
    beginAvatarAction('attack', 0.42)
    onAttackVisual()
    if (!enemyInDirection(pet.attackRange, direction)) return
    const damage = rollDamage(activeStats.atk * (buffed ? 2 : 1), settings.enemyDef)
    enemyHp.current = Math.max(0, enemyHp.current - damage)
    playerSp.current = Math.min(activeStats.sp, playerSp.current + 5)
    metrics.current.damageDealt += damage
    playHitTone(260)
    showPopup(damage, 'enemy')
    if (enemyHp.current <= 0) finish('won')
  }, [beginAvatarAction, enemyInDirection, finish, getActivePet, getActiveStats, onAttackVisual, readMoveDirection, settings.enemyDef, settings.noAttackCooldown, showPopup])

  const ultimate = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    const pet = getActivePet()
    if (now < ultimateReadyAt.current || (!settings.freeUltimate && playerSp.current < pet.ultimateCost)) return
    if (!settings.freeUltimate) playerSp.current -= pet.ultimateCost
    ultimateReadyAt.current = now + 1.2
    metrics.current.ultimateCount += 1
    const direction = readMoveDirection(true)
    actionDirection.current.copy(direction)
    playerFacingYaw.current = Math.atan2(direction.x, direction.z)
    beginAvatarAction('ultimate', 0.9)
    onUltimateVisual(activePetId.current === 'yajusenpai-male-evolved' ? 'male' : 'female')
    if (activePetId.current === 'yajusenpai-male-evolved') {
      if (!enemyInDirection(pet.attackRange + 0.5, direction)) return
      const damage = 810
      enemyHp.current = Math.max(0, enemyHp.current - damage)
      metrics.current.damageDealt += damage
      playHitTone(110)
      showPopup(damage, 'fixed')
      if (enemyHp.current <= 0) finish('won')
    } else {
      femaleBuffUntil.current = now + 10
    }
  }, [beginAvatarAction, enemyInDirection, finish, getActivePet, onUltimateVisual, readMoveDirection, settings.freeUltimate, showPopup])

  const dodge = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    if (now < dodgeReadyAt.current) return
    dodgeReadyAt.current = now + 2.2
    invulnerableUntil.current = now + 0.45
    metrics.current.dodgeCount += 1
    beginAvatarAction('dodge', 0.45)
    const direction = readMoveDirection(false)
    actionDirection.current.copy(direction)
    playerFacingYaw.current = Math.atan2(direction.x, direction.z)
    dodgeDirection.current = direction
  }, [beginAvatarAction, readMoveDirection])

  const togglePause = useCallback(() => {
    if (finished.current) return
    phase.current = phase.current === 'paused' ? 'playing' : 'paused'
    if (phase.current === 'paused') document.exitPointerLock?.()
  }, [])

  useEffect(() => {
    register({
      attack, ultimate, dodge, switchPet: () => { switchPet(false) }, togglePause,
      setMobileMove: (x, y) => { mobileMove.current = { x, y } },
      addMobileLook: (x, y) => { mobileLook.current.x += x; mobileLook.current.y += y },
      abort: () => finish('aborted'),
    })
  }, [attack, dodge, finish, register, switchPet, togglePause, ultimate])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current.add(event.code)
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') dodge()
      if (event.code === 'KeyQ') ultimate()
      if (event.code === 'KeyE') switchPet(false)
      if (event.code === 'Escape') togglePause()
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.code)
    const mouse = (event: MouseEvent) => {
      if (document.pointerLockElement === gl.domElement) {
        yaw.current -= event.movementX * 0.0022
        pitch.current = THREE.MathUtils.clamp(pitch.current - event.movementY * 0.0022, -1.25, 1.25)
      }
    }
    const click = (event: MouseEvent) => { if (event.button === 0 && document.pointerLockElement === gl.domElement) attack() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('mousemove', mouse)
    window.addEventListener('mousedown', click)
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up)
      window.removeEventListener('mousemove', mouse); window.removeEventListener('mousedown', click)
      keys.current.clear(); document.exitPointerLock?.()
    }
  }, [attack, dodge, gl.domElement, switchPet, togglePause, ultimate])

  useEffect(() => () => {
    if (popupTimer.current !== null) window.clearTimeout(popupTimer.current)
    void battleAudioContext?.close()
    battleAudioContext = null
  }, [])

  useFrame((_, delta) => {
    if (phase.current !== 'playing' || finished.current) {
      if (snapshotClock.current > 0.1) { snapshotClock.current = 0; emitSnapshot() }
      snapshotClock.current += delta
      return
    }
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    if (avatarAction.current !== 'idle' && now >= avatarActionUntil.current) avatarAction.current = 'idle'
    remaining.current = Math.max(0, remaining.current - dt)
    if (remaining.current <= 0) { finish('timeout'); return }

    yaw.current -= mobileLook.current.x * 0.0032
    pitch.current = THREE.MathUtils.clamp(pitch.current - mobileLook.current.y * 0.0032, -1.25, 1.25)
    mobileLook.current = { x: 0, y: 0 }
    const x = mobileMove.current.x + (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0)
    const z = mobileMove.current.y + (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0)
    const dodging = dodgeDirection.current && now < invulnerableUntil.current
    avatarMoving.current = Boolean(x || z) || Boolean(dodging)
    if (dodging && dodgeDirection.current) {
      movePlayer(dodgeDirection.current.clone().multiplyScalar(7.6 * dt), playerPosition.current)
    } else {
      dodgeDirection.current = null
    }
    if (!dodging && (x || z)) {
      const direction = new THREE.Vector3(x, 0, -z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
      moveDirection.current.copy(direction)
      if (avatarAction.current === 'idle') {
        const targetYaw = Math.atan2(direction.x, direction.z)
        playerFacingYaw.current = dampAngle(playerFacingYaw.current, targetYaw, 14, dt)
      }
      movePlayer(direction.multiplyScalar(5.2 * dt), playerPosition.current)
    }
    if (now < attackDriveUntil.current) movePlayer(actionDirection.current.clone().multiplyScalar(2.8 * dt), playerPosition.current)
    if (playerGroup.current) {
      playerGroup.current.position.copy(playerPosition.current)
      playerGroup.current.rotation.y = playerFacingYaw.current
    }
    const cameraOffset = new THREE.Vector3(0, 3.6 + pitch.current * 1.2, 6.6)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
    const desiredCamera = playerPosition.current.clone().add(cameraOffset)
    camera.position.lerp(desiredCamera, 1 - Math.exp(-9 * dt))
    const lookTarget = playerPosition.current.clone().add(new THREE.Vector3(0, 1.5 + pitch.current * 0.8, 0))
    lookTarget.add(new THREE.Vector3(0, 0, -3).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current))
    camera.lookAt(lookTarget)

    updateEnemy(dt, now)
    if (enemyGroup.current) enemyGroup.current.position.copy(enemyPosition.current)

    snapshotClock.current += dt
    if (snapshotClock.current >= 0.1) { snapshotClock.current = 0; emitSnapshot() }
  })

  function emitSnapshot() {
    const now = performance.now() / 1000
    partyHp.current[activePetIndex.current] = playerHp.current
    partySp.current[activePetIndex.current] = playerSp.current
    const activeStats = getActiveStats()
    onSnapshot({
      phase: phase.current,
      playerHp: Math.round(playerHp.current), playerMaxHp: activeStats.hp,
      playerSp: Math.round(playerSp.current), playerMaxSp: Math.max(1, activeStats.sp),
      enemyHp: Math.round(enemyHp.current), enemyMaxHp: settings.enemyHp,
      remainingSeconds: remaining.current,
      attackCooldown: Math.max(0, attackReadyAt.current - now),
      dodgeCooldown: Math.max(0, dodgeReadyAt.current - now),
      ultimateCooldown: Math.max(0, ultimateReadyAt.current - now),
      femaleBuffSeconds: Math.max(0, femaleBuffUntil.current - now),
      activePetId: activePetId.current,
      party: partyIds.map((petId, index) => ({ petId, hp: Math.round(partyHp.current[index]), maxHp: partyMaxHp.current[index], defeated: partyHp.current[index] <= 0 })),
      switchCooldown: Math.max(0, switchReadyAt.current - now),
      message: phase.current === 'paused' ? 'ポーズ中' : now < femaleBuffUntil.current ? `連撃強化 ${Math.ceil(femaleBuffUntil.current - now)}秒` : enemyAction.current.includes('warning') ? '敵の攻撃予告' : '',
    })
  }

  function updateEnemy(dt: number, now: number) {
    if (!settings.enemyAi) return
    const toPlayer = playerPosition.current.clone().setY(0).sub(enemyPosition.current)
    const distance = toPlayer.length()
    const targetYaw = Math.atan2(toPlayer.x, toPlayer.z)
    if (enemyAction.current === 'chase') enemyFacingYaw.current = targetYaw
    if (enemyGroup.current) enemyGroup.current.rotation.y = enemyFacingYaw.current

    if (enemyAction.current === 'recover') {
      if (now >= enemyActionUntil.current) enemyAction.current = 'chase'
      return
    }
    if (enemyAction.current === 'melee-warning' || enemyAction.current === 'cone-warning') {
      if (now < enemyActionUntil.current) return
      const isCone = enemyAction.current === 'cone-warning'
      const enemyForward = new THREE.Vector3(Math.sin(enemyFacingYaw.current), 0, Math.cos(enemyFacingYaw.current))
      const insideCone = distance <= TEST_MONSTER.coneRange && enemyForward.dot(toPlayer.clone().normalize()) >= Math.cos(TEST_MONSTER.coneAngle / 2)
      if (!settings.stopEnemyAttacks && now >= invulnerableUntil.current && (isCone ? insideCone : distance <= TEST_MONSTER.meleeRange + 0.5)) {
        const damage = rollDamage(settings.enemyAtk, getActiveStats().def)
        if (!settings.invincible) {
          playerHp.current = Math.max(0, playerHp.current - damage)
          partyHp.current[activePetIndex.current] = playerHp.current
          metrics.current.damageTaken += damage
          beginAvatarAction('hurt', 0.32)
          onPlayerHit()
          playHitTone(70)
          showPopup(damage, 'player')
          if (playerHp.current <= 0) switchPet(true)
        }
      }
      enemyAction.current = 'recover'
      enemyActionUntil.current = now + (isCone ? TEST_MONSTER.specialRecoverySeconds : 0.75)
      nextEnemyAttackAt.current = now + settings.enemyAttackInterval
      return
    }
    if (distance > TEST_MONSTER.meleeRange - 0.25) {
      const step = toPlayer.normalize().multiplyScalar(settings.enemyMoveSpeed * dt)
      moveEntity(step, enemyPosition.current, 1.2)
    }
    if (!settings.stopEnemyAttacks && now >= nextEnemyAttackAt.current && distance <= TEST_MONSTER.coneRange) {
      const cone = Math.random() < 0.35
      enemyFacingYaw.current = targetYaw
      enemyAction.current = cone ? 'cone-warning' : 'melee-warning'
      enemyActionUntil.current = now + (cone ? TEST_MONSTER.coneWarningSeconds : 0.65)
    }
  }

  const coneVisible = enemyAction.current === 'cone-warning'
  return (
    <>
      <color attach="background" args={['#51616b']} />
      <fog attach="fog" args={['#65747a', 30, 68]} />
      <hemisphereLight args={['#b8d6e8', '#443827', 1.05]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[8, 15, 4]} intensity={2.1} color="#ffe3a3" castShadow shadow-mapSize={[1024, 1024]} />
      <Sky distance={90} sunPosition={[8, 8, 4]} inclination={0.5} azimuth={0.24} turbidity={10} rayleigh={2.6} mieCoefficient={0.008} />
      <Arena showHitboxes={settings.showHitboxes} />
      <group ref={playerGroup} position={[0, 0, 9]}>
        <BattlePetAvatar3D
          key={partyIds[activePetIndexState]}
          petId={partyIds[activePetIndexState]}
          moving={avatarMoving}
          action={avatarAction}
          actionStartedAt={avatarActionStartedAt}
          actionUntil={avatarActionUntil}
        />
      </group>
      <ContactShadows position={[0, 0.07, 0]} scale={28} opacity={0.32} blur={2.4} far={13} frames={1} />
      <group ref={enemyGroup} position={[0, 0, 0]}>
        <TestMonster warning={enemyAction.current.includes('warning')} showHitboxes={settings.showHitboxes} />
        {popup && popup.kind !== 'player' && <Html position={[0, 3.4, 0]} center><span key={popup.id} className={`font-black drop-shadow ${popup.kind === 'fixed' ? 'text-3xl text-amber-300' : 'text-2xl text-white'}`}>-{popup.amount}</span></Html>}
      </group>
      {popup?.kind === 'player' && <Html position={[playerPosition.current.x, 3.4, playerPosition.current.z]} center><span className="text-2xl font-black text-red-400">-{popup.amount}</span></Html>}
      {popup && popup.kind !== 'player' && <HitBurst key={popup.id} position={enemyPosition.current} color={popup.kind === 'fixed' ? '#fde047' : '#f8fafc'} />}
      {coneVisible && <mesh position={[enemyPosition.current.x, 0.035, enemyPosition.current.z]} rotation={[-Math.PI / 2, 0, enemyGroup.current?.rotation.y ?? 0]}>
        <circleGeometry args={[TEST_MONSTER.coneRange, 32, -TEST_MONSTER.coneAngle / 2, TEST_MONSTER.coneAngle]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>}
    </>
  )
}

function movePlayer(delta: THREE.Vector3, position: THREE.Vector3) {
  moveEntity(delta, position, 0.55)
}

function dampAngle(current: number, target: number, speed: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + difference * (1 - Math.exp(-speed * delta))
}

function moveEntity(delta: THREE.Vector3, position: THREE.Vector3, radius: number) {
  const next = position.clone().add(delta)
  next.x = THREE.MathUtils.clamp(next.x, -13.4, 13.4)
  next.z = THREE.MathUtils.clamp(next.z, -13.4, 13.4)
  const obstacles = [{ x: -5, z: 3, r: 1.4 }, { x: 6, z: -4, r: 1.6 }]
  for (const obstacle of obstacles) {
    const dx = next.x - obstacle.x; const dz = next.z - obstacle.z
    const distance = Math.hypot(dx, dz); const min = obstacle.r + radius
    if (distance < min) { next.x = obstacle.x + (dx / Math.max(distance, 0.01)) * min; next.z = obstacle.z + (dz / Math.max(distance, 0.01)) * min }
  }
  position.copy(next)
}

function Arena({ showHitboxes }: { showHitboxes: boolean }) {
  const columns = useMemo(() => [[-5, 3], [6, -4]] as const, [])
  const rubble = useMemo(() => [
    [-11.8, -8.6, 0.8, 0.42], [-9.7, -10.8, 0.55, 0.34], [10.8, -9.5, 0.75, 0.38],
    [12.2, 7.6, 0.62, 0.32], [-12.4, 8.8, 0.7, 0.4], [9.8, 11.4, 0.48, 0.3],
    [-7.8, 12.1, 0.58, 0.28], [4.4, -12.6, 0.52, 0.3],
  ] as const, [])
  const paving = useMemo(() => Array.from({ length: 10 }, (_, index) => ({
    z: -11.25 + index * 2.5,
    x: index % 2 === 0 ? -0.18 : 0.2,
    rotation: (index % 3 - 1) * 0.035,
  })), [])
  const floorBlocks = useMemo(() => Array.from({ length: 48 }, (_, index) => {
    const ring = index < 16 ? 5.2 : index < 32 ? 8.2 : 11
    const slot = index % 16
    const angle = slot / 16 * Math.PI * 2 + (ring === 8.2 ? Math.PI / 16 : 0)
    return {
      x: Math.sin(angle) * ring,
      z: Math.cos(angle) * ring,
      angle: -angle,
      width: ring === 5.2 ? 2.1 : ring === 8.2 ? 2.85 : 3.2,
      depth: ring === 5.2 ? 2.3 : 2.55,
      shade: index % 4,
    }
  }), [])
  const wallBlocks = useMemo(() => {
    const blocks: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; shade: number }> = []
    for (const side of [-1, 1]) {
      for (let row = 0; row < 4; row += 1) {
        const count = row === 3 ? 4 : 6
        for (let index = 0; index < count; index += 1) {
          blocks.push({
            x: side * (8.1 + index * 1.18), y: 0.42 + row * 0.76, z: -13.25,
            sx: 1.1, sy: 0.68, sz: 0.85, shade: (row + index) % 3,
          })
        }
      }
    }
    return blocks
  }, [])
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[15, 64]} /><meshStandardMaterial color="#5c513d" roughness={0.96} /></mesh>
    <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[11.8, 48]} /><meshStandardMaterial color="#746a58" roughness={0.92} /></mesh>
    <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[11.45, 11.8, 48]} /><meshStandardMaterial color="#b89c62" roughness={0.72} /></mesh>

    {floorBlocks.map((block, index) => <mesh key={`floor-block-${index}`} position={[block.x, 0.055 + (index % 3) * 0.006, block.z]} rotation={[0, block.angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[block.width, 0.1, block.depth]} />
      <meshStandardMaterial color={['#817765', '#756b5b', '#8b806b', '#6c6558'][block.shade]} roughness={0.96} metalness={0.02} />
    </mesh>)}

    {paving.map((slab, index) => <mesh key={`slab-${index}`} position={[slab.x, 0.055, slab.z]} rotation={[-Math.PI / 2, 0, slab.rotation]} receiveShadow><boxGeometry args={[2.25, 1.7, 0.08]} /><meshStandardMaterial color={index % 2 === 0 ? '#91836b' : '#837762'} roughness={0.9} /></mesh>)}

    <group position={[0, 0, -14.15]}>
      <mesh position={[-9.8, 1.25, 0]}><boxGeometry args={[7.8, 2.5, 0.85]} /><meshStandardMaterial color="#655b4b" roughness={0.9} /></mesh>
      <mesh position={[9.8, 1.25, 0]}><boxGeometry args={[7.8, 2.5, 0.85]} /><meshStandardMaterial color="#655b4b" roughness={0.9} /></mesh>
      <mesh position={[-4.7, 2.25, 0]}><boxGeometry args={[2.4, 4.5, 1.1]} /><meshStandardMaterial color="#766a56" roughness={0.88} /></mesh>
      <mesh position={[4.7, 2.25, 0]}><boxGeometry args={[2.4, 4.5, 1.1]} /><meshStandardMaterial color="#766a56" roughness={0.88} /></mesh>
      <mesh position={[0, 4.05, 0]}><boxGeometry args={[7.2, 1.15, 1.05]} /><meshStandardMaterial color="#80735d" roughness={0.86} /></mesh>
    </group>
    {wallBlocks.map((block, index) => <mesh key={`wall-block-${index}`} position={[block.x, block.y, block.z]} rotation={[0, (index % 2 ? 0.025 : -0.025), 0]} castShadow receiveShadow>
      <boxGeometry args={[block.sx, block.sy, block.sz]} />
      <meshStandardMaterial color={['#756b59', '#655e51', '#827764'][block.shade]} roughness={0.98} />
    </mesh>)}

    <group position={[0, 0, -11.8]}>
      {[0, 1, 2, 3].map(step => <mesh key={`gate-step-${step}`} position={[0, 0.12 + step * 0.18, -step * 0.52]} castShadow receiveShadow><boxGeometry args={[7.4 - step * 0.65, 0.22, 1.25]} /><meshStandardMaterial color={step % 2 ? '#766c59' : '#857966'} roughness={0.94} /></mesh>)}
      <mesh position={[0, 3.05, -1.85]} castShadow><torusGeometry args={[3.1, 0.62, 10, 28, Math.PI]} /><meshStandardMaterial color="#706654" roughness={0.92} /></mesh>
      <mesh position={[0, 1.35, -1.85]} castShadow><boxGeometry args={[4.85, 2.7, 0.32]} /><meshStandardMaterial color="#201d19" metalness={0.45} roughness={0.75} /></mesh>
      {Array.from({ length: 8 }, (_, index) => <mesh key={`gate-bar-${index}`} position={[-2.1 + index * 0.6, 1.4, -1.65]} castShadow><boxGeometry args={[0.08, 3.15, 0.08]} /><meshStandardMaterial color="#332b22" metalness={0.75} roughness={0.48} /></mesh>)}
    </group>

    {columns.map(([x, z], index) => <group key={`${x}-${z}`} position={[x, 0, z]}>
      <mesh position={[0, 1.35, 0]} castShadow><cylinderGeometry args={[1.2, 1.45, 2.7, 16]} /><meshStandardMaterial color={showHitboxes ? '#22d3ee' : '#6f665b'} wireframe={showHitboxes} roughness={0.88} /></mesh>
      <mesh position={[0.25, 2.92, -0.1]} rotation={[0.12, 0, index === 0 ? 0.2 : -0.18]}><cylinderGeometry args={[0.78, 0.9, 0.7, 12]} /><meshStandardMaterial color="#81745e" roughness={0.9} /></mesh>
    </group>)}

    {rubble.map(([x, z, size, height], index) => <mesh key={`rubble-${index}`} position={[x, height * 0.55, z]} rotation={[0.15 * (index % 2), index * 0.7, 0.1]} castShadow><dodecahedronGeometry args={[size, 0]} /><meshStandardMaterial color={index % 2 ? '#625948' : '#776b56'} roughness={1} /></mesh>)}

    {[-1, 1].map(side => <group key={`banner-${side}`} position={[side * 10.8, 0, -10.9]}>
      <mesh position={[0, 2.7, 0]}><cylinderGeometry args={[0.08, 0.1, 5.4, 8]} /><meshStandardMaterial color="#34291d" metalness={0.45} roughness={0.65} /></mesh>
      <mesh position={[side * 0.64, 3.75, 0]}><planeGeometry args={[1.2, 2.05]} /><meshStandardMaterial color={side < 0 ? '#7f1d1d' : '#78350f'} side={THREE.DoubleSide} roughness={0.85} /></mesh>
    </group>)}

    {[-1, 1].map(side => <group key={`brazier-${side}`} position={[side * 8.7, 0, 8.9]}>
      <mesh position={[0, 0.65, 0]}><cylinderGeometry args={[0.65, 0.45, 0.55, 12]} /><meshStandardMaterial color="#2e261d" metalness={0.65} roughness={0.55} /></mesh>
      <mesh position={[0, 1.05, 0]}><octahedronGeometry args={[0.38, 0]} /><meshStandardMaterial color="#ffb347" emissive="#ff6a00" emissiveIntensity={2.2} /></mesh>
      <pointLight position={[0, 1.6, 0]} color="#ffad55" intensity={6} distance={7} />
    </group>)}

    {[-26, -19, 20, 27].map((x, index) => <mesh key={`ridge-${x}`} position={[x, 5.5, -30 - (index % 2) * 5]} rotation={[0, index * 0.45, 0]}><coneGeometry args={[8 + (index % 2) * 2, 13, 7]} /><meshStandardMaterial color="#66706d" roughness={1} /></mesh>)}
  </>
}

function TestMonster({ warning, showHitboxes }: { warning: boolean; showHitboxes: boolean }) {
  const texture = useTexture(blueSlimeSprite)
  const body = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    texture.needsUpdate = true
  }, [texture])

  useFrame(({ clock }) => {
    if (!body.current || !material.current) return
    const elapsed = clock.getElapsedTime()
    const breath = Math.sin(elapsed * 2.8)
    const hop = Math.max(0, Math.sin(elapsed * 4.2))
    const warningPulse = warning ? (Math.sin(elapsed * 12) + 1) / 2 : 0
    body.current.position.y = 1.42 + hop * 0.1
    body.current.scale.set(
      3.45 * (1 + breath * 0.018 + warningPulse * 0.08),
      3.45 * (1 - breath * 0.015 - warningPulse * 0.1),
      1,
    )
    body.current.rotation.z = Math.sin(elapsed * 3.4) * 0.018
    material.current.color.set(warning ? '#ffb4b4' : '#ffffff')
  })

  return <group>
    <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[1.35, 32]} />
      <meshBasicMaterial color="#0f172a" transparent opacity={0.34} depthWrite={false} />
    </mesh>
    <group ref={body} position={[0, 1.42, 0]} scale={[3.45, 3.45, 1]}>
      <mesh renderOrder={8}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={material} map={texture} transparent alphaTest={0.08} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
    {showHitboxes && <mesh position={[0, 1.25, 0]}><sphereGeometry args={[1.35, 16, 12]} /><meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.6} /></mesh>}
  </group>
}

function HitBurst({ position, color }: { position: THREE.Vector3; color: string }) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const startedAt = useRef(performance.now() / 1000)
  useFrame(() => {
    if (!group.current || !material.current) return
    const progress = THREE.MathUtils.clamp((performance.now() / 1000 - startedAt.current) / 0.42, 0, 1)
    group.current.scale.setScalar(0.25 + progress * 2.5)
    group.current.rotation.z = progress * 1.8
    material.current.opacity = (1 - progress) * 0.9
  })
  return <group ref={group} position={[position.x, 1.45, position.z + 0.25]}>
    <mesh><ringGeometry args={[0.28, 0.42, 8]} /><meshBasicMaterial ref={material} color={color} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} /></mesh>
  </group>
}

let battleAudioContext: AudioContext | null = null

function playHitTone(frequency: number) {
  try {
    battleAudioContext ??= new AudioContext()
    const oscillator = battleAudioContext.createOscillator()
    const gain = battleAudioContext.createGain()
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.035, battleAudioContext.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, battleAudioContext.currentTime + 0.08)
    oscillator.connect(gain).connect(battleAudioContext.destination)
    oscillator.start()
    oscillator.stop(battleAudioContext.currentTime + 0.08)
  } catch {
    // Audio is optional when a browser blocks Web Audio before a user gesture.
  }
}
