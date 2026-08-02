import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Preload, useTexture } from '@react-three/drei'
import { forwardRef, Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BattleHud } from './battle-hud'
import { MobileControls } from './mobile-controls'
import { PET_DEFINITIONS } from './pet-definitions'
import { TEST_MONSTER } from './monster-data'
import { rollDamage } from './combat-math'
import type { BattleResult, BattleSceneHandle, BattleSettings, BattleSnapshot, DamagePopup } from './types'

type RuntimeActions = BattleSceneHandle

const INITIAL_SNAPSHOT: BattleSnapshot = {
  phase: 'ready', playerHp: 1, playerMaxHp: 1, playerSp: 0, playerMaxSp: 100,
  enemyHp: 1, enemyMaxHp: 1, remainingSeconds: 0, attackCooldown: 0,
  dodgeCooldown: 0, ultimateCooldown: 0, femaleBuffSeconds: 0, message: '',
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
  })
  const [attackPulse, setAttackPulse] = useState(0)
  const [ultimatePulse, setUltimatePulse] = useState<{ id: number; kind: 'male' | 'female' } | null>(null)
  const [hitPulse, setHitPulse] = useState(0)
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

  useImperativeHandle(ref, () => ({
    attack: () => actions.current?.attack(),
    ultimate: () => actions.current?.ultimate(),
    dodge: () => actions.current?.dodge(),
    togglePause: () => actions.current?.togglePause(),
    setMobileMove: (x, y) => actions.current?.setMobileMove(x, y),
    addMobileLook: (x, y) => actions.current?.addMobileLook(x, y),
    abort: () => actions.current?.abort(),
  }), [])

  const register = useCallback((runtime: RuntimeActions) => { actions.current = runtime }, [])

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
      <Canvas
        dpr={isMobile ? [1, 1.35] : [1, 1.75]}
        gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
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
      <BattleHud snapshot={snapshot} onPause={() => actions.current?.togglePause()} onAbort={() => actions.current?.abort()} />
      <div key={attackPulse} className="pointer-events-none absolute bottom-[22%] left-1/2 z-20 size-32 -translate-x-1/2 animate-[battle-swipe_.22s_ease-out] rounded-full border-4 border-amber-200/80 bg-amber-300/15 blur-[1px]" />
      {ultimatePulse && <><div key={ultimatePulse.id} className={`pointer-events-none absolute inset-0 z-[19] animate-[battle-ultimate_.8s_ease-out] ${ultimatePulse.kind === 'male' ? 'bg-amber-300/45' : 'bg-fuchsia-500/35'}`} /><div className="pointer-events-none absolute inset-x-0 top-[28%] z-30 animate-[battle-cutin_.9s_ease-out_forwards] border-y border-white/50 bg-black/80 py-4 text-center text-2xl font-black text-white">{PET_DEFINITIONS[settings.petId].ultimateName}</div></>}
      {hitPulse > 0 && <div key={hitPulse} className="pointer-events-none absolute inset-0 z-[18] animate-[battle-hit_.35s_ease-out] border-[14px] border-red-600/70" />}
      {isMobile && (
        <MobileControls
          onMove={(x, y) => actions.current?.setMobileMove(x, y)}
          onLook={(x, y) => actions.current?.addMobileLook(x, y)}
          onAttack={() => actions.current?.attack()}
          onUltimate={() => actions.current?.ultimate()}
          onDodge={() => actions.current?.dodge()}
        />
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
  const pet = PET_DEFINITIONS[settings.petId]
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
  const enemyAction = useRef<'chase' | 'melee-warning' | 'cone-warning' | 'recover'>('chase')
  const enemyActionUntil = useRef(0)
  const enemyFacingYaw = useRef(0)
  const nextEnemyAttackAt = useRef(1.5)
  const snapshotClock = useRef(0)
  const finished = useRef(false)
  const [popup, setPopup] = useState<DamagePopup | null>(null)
  const popupTimer = useRef<number | null>(null)
  const metrics = useRef({ damageDealt: 0, damageTaken: 0, normalAttackCount: 0, ultimateCount: 0, dodgeCount: 0 })

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

  const showPopup = useCallback((amount: number, kind: DamagePopup['kind']) => {
    if (!settings.showDamage) return
    setPopup({ id: Date.now(), amount, kind })
    if (popupTimer.current !== null) window.clearTimeout(popupTimer.current)
    popupTimer.current = window.setTimeout(() => { setPopup(null); popupTimer.current = null }, 650)
  }, [settings.showDamage])

  const enemyInAim = useCallback((range: number) => {
    const target = enemyPosition.current.clone().add(new THREE.Vector3(0, 1.35, 0))
    const origin = playerPosition.current.clone().add(new THREE.Vector3(0, 1.2, 0))
    const toEnemy = target.sub(origin)
    const distance = toEnemy.length()
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
    return distance <= range && forward.dot(toEnemy.normalize()) > 0.72
  }, [])

  const attack = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    if (!settings.noAttackCooldown && now < attackReadyAt.current) return
    const buffed = settings.petId === 'yajusenpai-female-evolved' && now < femaleBuffUntil.current
    const cooldown = settings.noAttackCooldown ? 0.08 : pet.attackCooldown * (buffed ? 0.5 : 1)
    attackReadyAt.current = now + cooldown
    metrics.current.normalAttackCount += 1
    onAttackVisual()
    if (!enemyInAim(pet.attackRange)) return
    const damage = rollDamage(settings.petAtk * (buffed ? 2 : 1), settings.enemyDef)
    enemyHp.current = Math.max(0, enemyHp.current - damage)
    playerSp.current = Math.min(settings.petSp, playerSp.current + 5)
    metrics.current.damageDealt += damage
    playHitTone(260)
    showPopup(damage, 'enemy')
    if (enemyHp.current <= 0) finish('won')
  }, [enemyInAim, finish, onAttackVisual, pet.attackCooldown, pet.attackRange, settings, showPopup])

  const ultimate = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    if (now < ultimateReadyAt.current || (!settings.freeUltimate && playerSp.current < pet.ultimateCost)) return
    if (!settings.freeUltimate) playerSp.current -= pet.ultimateCost
    ultimateReadyAt.current = now + 1.2
    metrics.current.ultimateCount += 1
    onUltimateVisual(settings.petId === 'yajusenpai-male-evolved' ? 'male' : 'female')
    if (settings.petId === 'yajusenpai-male-evolved') {
      if (!enemyInAim(pet.attackRange + 0.5)) return
      const damage = 810
      enemyHp.current = Math.max(0, enemyHp.current - damage)
      metrics.current.damageDealt += damage
      playHitTone(110)
      showPopup(damage, 'fixed')
      if (enemyHp.current <= 0) finish('won')
    } else {
      femaleBuffUntil.current = now + 10
    }
  }, [enemyInAim, finish, onUltimateVisual, pet.attackRange, pet.ultimateCost, settings, showPopup])

  const dodge = useCallback(() => {
    if (phase.current !== 'playing') return
    const now = performance.now() / 1000
    if (now < dodgeReadyAt.current) return
    dodgeReadyAt.current = now + 2.2
    invulnerableUntil.current = now + 0.45
    metrics.current.dodgeCount += 1
    const inputX = mobileMove.current.x + (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0)
    const inputY = mobileMove.current.y + (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0)
    const local = new THREE.Vector3(inputX, 0, inputY ? -inputY : 1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
    movePlayer(local.multiplyScalar(3.4), playerPosition.current)
  }, [])

  const togglePause = useCallback(() => {
    if (finished.current) return
    phase.current = phase.current === 'paused' ? 'playing' : 'paused'
    if (phase.current === 'paused') document.exitPointerLock?.()
  }, [])

  useEffect(() => {
    register({
      attack, ultimate, dodge, togglePause,
      setMobileMove: (x, y) => { mobileMove.current = { x, y } },
      addMobileLook: (x, y) => { mobileLook.current.x += x; mobileLook.current.y += y },
      abort: () => finish('aborted'),
    })
  }, [attack, dodge, finish, register, togglePause, ultimate])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current.add(event.code)
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') dodge()
      if (event.code === 'KeyQ') ultimate()
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
  }, [attack, dodge, gl.domElement, togglePause, ultimate])

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
    remaining.current = Math.max(0, remaining.current - dt)
    if (remaining.current <= 0) { finish('timeout'); return }

    yaw.current -= mobileLook.current.x * 0.0032
    pitch.current = THREE.MathUtils.clamp(pitch.current - mobileLook.current.y * 0.0032, -1.25, 1.25)
    mobileLook.current = { x: 0, y: 0 }
    const x = mobileMove.current.x + (keys.current.has('KeyD') ? 1 : 0) - (keys.current.has('KeyA') ? 1 : 0)
    const z = mobileMove.current.y + (keys.current.has('KeyW') ? 1 : 0) - (keys.current.has('KeyS') ? 1 : 0)
    if (x || z) {
      const direction = new THREE.Vector3(x, 0, -z).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.current)
      movePlayer(direction.multiplyScalar(5.2 * dt), playerPosition.current)
    }
    if (playerGroup.current) {
      playerGroup.current.position.copy(playerPosition.current)
      playerGroup.current.rotation.y = yaw.current
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
    onSnapshot({
      phase: phase.current,
      playerHp: Math.round(playerHp.current), playerMaxHp: settings.petHp,
      playerSp: Math.round(playerSp.current), playerMaxSp: Math.max(1, settings.petSp),
      enemyHp: Math.round(enemyHp.current), enemyMaxHp: settings.enemyHp,
      remainingSeconds: remaining.current,
      attackCooldown: Math.max(0, attackReadyAt.current - now),
      dodgeCooldown: Math.max(0, dodgeReadyAt.current - now),
      ultimateCooldown: Math.max(0, ultimateReadyAt.current - now),
      femaleBuffSeconds: Math.max(0, femaleBuffUntil.current - now),
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
        const damage = rollDamage(settings.enemyAtk, settings.petDef)
        if (!settings.invincible) {
          playerHp.current = Math.max(0, playerHp.current - damage)
          metrics.current.damageTaken += damage
          onPlayerHit()
          playHitTone(70)
          showPopup(damage, 'player')
          if (playerHp.current <= 0) finish('lost')
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
      <color attach="background" args={['#172033']} />
      <fog attach="fog" args={['#172033', 22, 48]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[8, 15, 4]} intensity={2.2} color="#fff2c4" />
      <Arena showHitboxes={settings.showHitboxes} />
      <group ref={playerGroup} position={[0, 0, 9]}>
        {settings.partyPetIds.map((petId, index) => <PlayerPetAvatar key={petId} petId={petId} index={index} />)}
      </group>
      <group ref={enemyGroup} position={[0, 0, 0]}>
        <TestMonster warning={enemyAction.current.includes('warning')} showHitboxes={settings.showHitboxes} />
        {popup && popup.kind !== 'player' && <Html position={[0, 3.4, 0]} center><span key={popup.id} className={`font-black drop-shadow ${popup.kind === 'fixed' ? 'text-3xl text-amber-300' : 'text-2xl text-white'}`}>-{popup.amount}</span></Html>}
      </group>
      {popup?.kind === 'player' && <Html position={[playerPosition.current.x, 3.4, playerPosition.current.z]} center><span className="text-2xl font-black text-red-400">-{popup.amount}</span></Html>}
      {coneVisible && <mesh position={[enemyPosition.current.x, 0.035, enemyPosition.current.z]} rotation={[-Math.PI / 2, 0, enemyGroup.current?.rotation.y ?? 0]}>
        <circleGeometry args={[TEST_MONSTER.coneRange, 32, -TEST_MONSTER.coneAngle / 2, TEST_MONSTER.coneAngle]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>}
    </>
  )
}

function PlayerPetAvatar({ petId, index }: { petId: keyof typeof PET_DEFINITIONS; index: number }) {
  const pet = PET_DEFINITIONS[petId]
  const texture = useTexture(pet.image)
  const positions: [number, number, number][] = [[0, 1.65, 0], [-1.45, 1.35, 1.25], [1.45, 1.35, 1.25]]
  const scales: [number, number, number][] = [[2.8, 3.7, 1], [2.15, 2.9, 1], [2.15, 2.9, 1]]
  return <sprite position={positions[index] ?? positions[0]} scale={scales[index] ?? scales[0]}>
    <spriteMaterial map={texture} transparent alphaTest={0.04} depthWrite={false} />
  </sprite>
}

function movePlayer(delta: THREE.Vector3, position: THREE.Vector3) {
  moveEntity(delta, position, 0.55)
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
  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[15, 48]} /><meshStandardMaterial color="#8f7960" roughness={0.82} /></mesh>
    <mesh position={[0, 1.4, -14.5]}><boxGeometry args={[29, 2.8, 0.6]} /><meshStandardMaterial color="#c9b899" /></mesh>
    <mesh position={[-14.5, 1.4, 0]}><boxGeometry args={[0.6, 2.8, 29]} /><meshStandardMaterial color="#b9aa90" /></mesh>
    <mesh position={[14.5, 1.4, 0]}><boxGeometry args={[0.6, 2.8, 29]} /><meshStandardMaterial color="#b9aa90" /></mesh>
    {columns.map(([x, z]) => <mesh key={`${x}-${z}`} position={[x, 1.35, z]}><cylinderGeometry args={[1.2, 1.45, 2.7, 16]} /><meshStandardMaterial color={showHitboxes ? '#22d3ee' : '#6f665b'} wireframe={showHitboxes} /></mesh>)}
    {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => <pointLight key={index} position={[Math.cos(index * Math.PI / 4) * 11, 3.5, Math.sin(index * Math.PI / 4) * 11]} color="#ffd27a" intensity={4} distance={8} />)}
  </>
}

function TestMonster({ warning, showHitboxes }: { warning: boolean; showHitboxes: boolean }) {
  return <group>
    <mesh position={[0, 1.2, 0]}><dodecahedronGeometry args={[1.35, 0]} /><meshStandardMaterial color={warning ? '#ef4444' : '#334155'} emissive={warning ? '#7f1d1d' : '#000000'} wireframe={showHitboxes} /></mesh>
    <mesh position={[-0.65, 2.25, 0.2]} rotation={[0, 0, -0.35]}><coneGeometry args={[0.32, 1.25, 8]} /><meshStandardMaterial color="#d4af37" /></mesh>
    <mesh position={[0.65, 2.25, 0.2]} rotation={[0, 0, 0.35]}><coneGeometry args={[0.32, 1.25, 8]} /><meshStandardMaterial color="#d4af37" /></mesh>
    <mesh position={[-0.43, 1.45, 1.15]}><sphereGeometry args={[0.16, 12, 12]} /><meshBasicMaterial color="#ff3b30" /></mesh>
    <mesh position={[0.43, 1.45, 1.15]}><sphereGeometry args={[0.16, 12, 12]} /><meshBasicMaterial color="#ff3b30" /></mesh>
    <mesh position={[0, 0.45, 0]}><cylinderGeometry args={[0.85, 1.05, 0.9, 8]} /><meshStandardMaterial color="#1e293b" wireframe={showHitboxes} /></mesh>
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
