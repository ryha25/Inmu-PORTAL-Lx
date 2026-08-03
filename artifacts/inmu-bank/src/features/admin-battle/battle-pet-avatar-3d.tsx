import { useAnimations, useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { forwardRef, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import characterModelUrl from './assets/quaternius-platformer-character.gltf?url'
import type { BattlePetId } from './types'

type AvatarAction = 'idle' | 'attack' | 'dodge' | 'ultimate' | 'hurt' | 'switch'

const ACTION_CLIPS: Record<AvatarAction | 'run', string> = {
  idle: 'Idle',
  run: 'Run',
  attack: 'Punch',
  dodge: 'Jump',
  ultimate: 'Punch',
  hurt: 'HitReact',
  switch: 'Jump_Land',
}

export function BattlePetAvatar3D({ petId, moving, action, actionStartedAt, actionUntil }: {
  petId: BattlePetId
  moving: MutableRefObject<boolean>
  action: MutableRefObject<AvatarAction>
  actionStartedAt: MutableRefObject<number>
  actionUntil: MutableRefObject<number>
}) {
  const female = petId === 'yajusenpai-female-evolved'
  const gltf = useGLTF(characterModelUrl)
  const model = useMemo(() => clone(gltf.scene), [gltf.scene, petId])
  const { actions } = useAnimations(gltf.animations, model)
  const root = useRef<THREE.Group>(null)
  const aura = useRef<THREE.Mesh>(null)
  const auraMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const bow = useRef<THREE.Group>(null)
  const arrow = useRef<THREE.Group>(null)
  const tail = useRef<THREE.Group>(null)
  const currentClip = useRef('')

  useEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      const materialWasArray = Array.isArray(object.material)
      const materials = materialWasArray ? object.material : [object.material]
      const recoloredMaterials = materials.map((source: THREE.Material) => {
        const material = source.clone()
        const color = getMaterialColor(material.name, female)
        if ('color' in material && material.color instanceof THREE.Color && color) material.color.set(color)
        material.needsUpdate = true
        return material
      })
      object.material = materialWasArray ? recoloredMaterials : recoloredMaterials[0]
    })
  }, [female, model])

  useEffect(() => () => {
    Object.values(actions).forEach((clip) => clip?.stop())
  }, [actions])

  useFrame(({ clock }, delta) => {
    const now = performance.now() / 1000
    const avatarAction = action.current
    const desiredClip = ACTION_CLIPS[avatarAction === 'idle' && moving.current ? 'run' : avatarAction]
    if (desiredClip !== currentClip.current) {
      const previous = actions[currentClip.current]
      const next = actions[desiredClip] ?? actions.Idle
      previous?.fadeOut(0.12)
      if (next) {
        next.reset().fadeIn(0.12)
        const oneShot = avatarAction !== 'idle'
        next.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity)
        next.clampWhenFinished = oneShot
        next.timeScale = avatarAction === 'ultimate' ? 0.72 : avatarAction === 'dodge' ? 1.35 : 1
        next.play()
      }
      currentClip.current = desiredClip
    }

    const elapsed = clock.getElapsedTime()
    const duration = Math.max(0.001, actionUntil.current - actionStartedAt.current)
    const progress = THREE.MathUtils.clamp((now - actionStartedAt.current) / duration, 0, 1)
    const pulse = Math.sin(progress * Math.PI)
    const running = moving.current && avatarAction === 'idle'

    if (root.current) {
      root.current.position.y = avatarAction === 'dodge'
        ? Math.sin(progress * Math.PI) * 0.12
        : running ? Math.abs(Math.sin(elapsed * 9)) * 0.012 : 0
      root.current.rotation.z = avatarAction === 'hurt' ? Math.sin(progress * Math.PI) * 0.08 : 0
    }
    if (aura.current) aura.current.scale.setScalar(1 + pulse * (avatarAction === 'ultimate' ? 0.48 : 0.08))
    if (auraMaterial.current) auraMaterial.current.opacity = avatarAction === 'ultimate' ? pulse * 0.78 : 0.18
    if (tail.current) tail.current.rotation.y = Math.sin(elapsed * (running ? 7 : 2.2)) * (running ? 0.26 : 0.1)
    if (bow.current) {
      bow.current.rotation.z = -0.22 + (avatarAction === 'attack' ? pulse * 0.55 : 0)
      bow.current.position.z = avatarAction === 'attack' ? pulse * 0.24 : 0.03
    }
    if (arrow.current) {
      arrow.current.visible = female && avatarAction === 'attack' && progress > 0.32
      arrow.current.position.z = 0.35 + Math.max(0, progress - 0.32) * 8
    }
  })

  return (
    <group ref={root}>
      <mesh ref={aura} position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 1.04, 48]} />
        <meshBasicMaterial ref={auraMaterial} color={female ? '#a855f7' : '#fde047'} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <primitive object={model} scale={0.82} position={[0, 0.02, 0]} />
      <LionTail ref={tail} female={female} />
      {female && <BattleBow ref={bow} />}
      {female && (
        <group ref={arrow} visible={false} position={[0, 1.5, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh><cylinderGeometry args={[0.018, 0.018, 0.9, 8]} /><meshStandardMaterial color="#f5d0fe" emissive="#a855f7" emissiveIntensity={0.8} /></mesh>
          <mesh position={[0, 0.54, 0]}><coneGeometry args={[0.075, 0.2, 8]} /><meshStandardMaterial color="#c084fc" emissive="#7e22ce" emissiveIntensity={1.2} /></mesh>
          <pointLight color="#a855f7" intensity={2.2} distance={2.5} />
        </group>
      )}
      {female && action.current === 'ultimate' && (
        <pointLight position={[0, 1.5, 0.5]} color="#a855f7" intensity={4} distance={5} />
      )}
    </group>
  )
}

const LionTail = forwardRef<THREE.Group, { female: boolean }>(function LionTail({ female }, ref) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.28, 0.18, 0.2),
    new THREE.Vector3(0.45, 0.46, 0.12),
    new THREE.Vector3(0.34, 0.72, 0),
  ]), [])
  return (
    <group ref={ref} position={[0, 0.82, -0.18]} rotation={[0, 0.2, 0]} scale={0.82}>
      <mesh geometry={new THREE.TubeGeometry(curve, 18, 0.055, 8, false)} castShadow>
        <meshStandardMaterial color={female ? '#c08a63' : '#8f5b32'} roughness={0.8} />
      </mesh>
      <mesh position={[0.34, 0.72, 0]} scale={[0.13, 0.22, 0.13]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color={female ? '#d6a477' : '#3b2418'} roughness={0.9} />
      </mesh>
    </group>
  )
})

const BattleBow = forwardRef<THREE.Group>(function BattleBow(_props, ref) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.62, 0),
    new THREE.Vector3(-0.22, -0.31, 0),
    new THREE.Vector3(-0.28, 0, 0),
    new THREE.Vector3(-0.22, 0.31, 0),
    new THREE.Vector3(0, 0.62, 0),
  ]), [])
  const stringGeometry = useMemo(() => new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.62, 0),
    new THREE.Vector3(0.12, 0, 0),
    new THREE.Vector3(0, 0.62, 0),
  ]), [])
  const bowString = useMemo(() => new THREE.Line(
    stringGeometry,
    new THREE.LineBasicMaterial({ color: '#f5d0fe' }),
  ), [stringGeometry])
  return (
    <group ref={ref} position={[-0.48, 1.38, 0.03]} rotation={[0.12, 0.25, -0.22]} scale={0.82}>
      <mesh geometry={new THREE.TubeGeometry(curve, 24, 0.035, 8, false)} castShadow>
        <meshStandardMaterial color="#6d28d9" metalness={0.72} roughness={0.25} emissive="#581c87" emissiveIntensity={0.38} />
      </mesh>
      <primitive object={bowString} />
      <pointLight color="#a855f7" intensity={1.4} distance={2.5} />
    </group>
  )
})

function getMaterialColor(name: string, female: boolean) {
  const normalized = name.toLowerCase()
  if (normalized.includes('eye')) return female ? '#d8b4fe' : '#fbbf24'
  if (normalized.includes('light')) return female ? '#d7a075' : '#a86f43'
  if (normalized.includes('main2')) return female ? '#7e22ce' : '#d4af37'
  if (normalized === 'main') return female ? '#26113d' : '#111827'
  return undefined
}

useGLTF.preload(characterModelUrl)
