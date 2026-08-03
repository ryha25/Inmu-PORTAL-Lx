import { useFrame } from '@react-three/fiber'
import { forwardRef, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import type { BattlePetId } from './types'

type AvatarAction = 'idle' | 'attack' | 'dodge' | 'ultimate' | 'hurt' | 'switch'

export function BattlePetAvatar3D({ petId, moving, action, actionStartedAt, actionUntil }: {
  petId: BattlePetId
  moving: MutableRefObject<boolean>
  action: MutableRefObject<AvatarAction>
  actionStartedAt: MutableRefObject<number>
  actionUntil: MutableRefObject<number>
}) {
  const female = petId === 'yajusenpai-female-evolved'
  const root = useRef<THREE.Group>(null)
  const torso = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const bow = useRef<THREE.Group>(null)
  const arrow = useRef<THREE.Group>(null)
  const aura = useRef<THREE.Mesh>(null)
  const auraMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const strike = useRef<THREE.Mesh>(null)
  const strikeMaterial = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }, delta) => {
    if (!root.current || !torso.current || !leftArm.current || !rightArm.current || !leftLeg.current || !rightLeg.current) return
    const elapsed = clock.getElapsedTime()
    const now = performance.now() / 1000
    const duration = Math.max(0.001, actionUntil.current - actionStartedAt.current)
    const progress = THREE.MathUtils.clamp((now - actionStartedAt.current) / duration, 0, 1)
    const run = moving.current && action.current === 'idle'
    const gait = Math.sin(elapsed * 10.5)
    const settle = 1 - Math.exp(-16 * Math.min(delta, 0.05))

    let rootY = run ? Math.abs(Math.sin(elapsed * 10.5)) * 0.08 : Math.sin(elapsed * 2.4) * 0.018
    let rootTilt = 0
    let torsoX = run ? -0.12 : Math.sin(elapsed * 2.4) * 0.018
    let torsoY = 0
    let leftArmX = run ? -gait * 0.58 : 0.08
    let rightArmX = run ? gait * 0.58 : 0.08
    let leftArmZ = 0.08
    let rightArmZ = -0.08
    let leftLegX = run ? gait * 0.68 : 0
    let rightLegX = run ? -gait * 0.68 : 0
    let arrowZ = 0
    let strikeScale = 0
    let auraOpacity = 0

    if (action.current === 'attack') {
      const windup = THREE.MathUtils.clamp(progress / 0.42, 0, 1)
      const impact = THREE.MathUtils.clamp((progress - 0.42) / 0.58, 0, 1)
      torsoY = female ? -0.45 * windup + 0.8 * impact : -0.55 * windup + 1.05 * impact
      torsoX = female ? -0.05 : -0.28 * Math.sin(progress * Math.PI)
      if (female) {
        leftArmX = -1.2
        leftArmZ = 0.45
        rightArmX = -1.45 + impact * 0.9
        rightArmZ = -0.72
        arrowZ = impact * 4.8
        strikeScale = Math.sin(impact * Math.PI) * 0.85
      } else {
        rightArmX = -1.85 + impact * 2.3
        rightArmZ = -0.38
        leftArmX = -0.65
        leftLegX = -0.28
        rightLegX = 0.42
        strikeScale = Math.sin(impact * Math.PI) * 1.25
      }
    } else if (action.current === 'dodge') {
      rootY = Math.sin(progress * Math.PI) * 0.2
      rootTilt = -Math.sin(progress * Math.PI) * 0.42
      torsoX = -0.48
      leftArmX = 0.9
      rightArmX = 0.9
      leftLegX = -0.75
      rightLegX = 0.72
      auraOpacity = Math.sin(progress * Math.PI) * 0.35
    } else if (action.current === 'ultimate') {
      const charge = Math.sin(progress * Math.PI)
      rootY = charge * 0.16
      torsoX = -0.18
      leftArmX = -2.3 + charge * 0.35
      rightArmX = -2.3 + charge * 0.35
      leftArmZ = 0.36
      rightArmZ = -0.36
      auraOpacity = charge * 0.72
      strikeScale = progress > 0.55 ? Math.sin((progress - 0.55) / 0.45 * Math.PI) * 2.2 : 0
    } else if (action.current === 'hurt') {
      rootTilt = Math.sin(progress * Math.PI) * 0.24
      torsoX = 0.34
      leftArmX = 0.8
      rightArmX = 0.8
    } else if (action.current === 'switch') {
      rootY = Math.sin(progress * Math.PI) * 0.55
      auraOpacity = Math.sin(progress * Math.PI) * 0.8
    }

    root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, rootY, settle)
    root.current.rotation.z = THREE.MathUtils.lerp(root.current.rotation.z, rootTilt, settle)
    torso.current.rotation.x = THREE.MathUtils.lerp(torso.current.rotation.x, torsoX, settle)
    torso.current.rotation.y = THREE.MathUtils.lerp(torso.current.rotation.y, torsoY, settle)
    leftArm.current.rotation.x = THREE.MathUtils.lerp(leftArm.current.rotation.x, leftArmX, settle)
    leftArm.current.rotation.z = THREE.MathUtils.lerp(leftArm.current.rotation.z, leftArmZ, settle)
    rightArm.current.rotation.x = THREE.MathUtils.lerp(rightArm.current.rotation.x, rightArmX, settle)
    rightArm.current.rotation.z = THREE.MathUtils.lerp(rightArm.current.rotation.z, rightArmZ, settle)
    leftLeg.current.rotation.x = THREE.MathUtils.lerp(leftLeg.current.rotation.x, leftLegX, settle)
    rightLeg.current.rotation.x = THREE.MathUtils.lerp(rightLeg.current.rotation.x, rightLegX, settle)
    if (bow.current) bow.current.rotation.x = THREE.MathUtils.lerp(bow.current.rotation.x, female && action.current === 'attack' ? -0.32 : 0, settle)
    if (arrow.current) arrow.current.position.z = arrowZ
    if (strike.current) strike.current.scale.setScalar(Math.max(0.001, strikeScale))
    if (strikeMaterial.current) strikeMaterial.current.opacity = strikeScale > 0 ? 0.72 : 0
    if (aura.current) aura.current.scale.setScalar(1 + auraOpacity * 0.7)
    if (auraMaterial.current) auraMaterial.current.opacity = auraOpacity
  })

  const primary = female ? '#5b21b6' : '#172554'
  const accent = female ? '#c084fc' : '#facc15'
  const skin = female ? '#b77958' : '#9a5f3f'
  const hair = female ? '#d6a75d' : '#24170f'

  return (
    <group ref={root} scale={female ? 1.02 : 1.08}>
      <mesh ref={aura} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.72, 1.1, 40]} />
        <meshBasicMaterial ref={auraMaterial} color={female ? '#a855f7' : '#fde047'} transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={torso} position={[0, 1.48, 0]}>
        <mesh castShadow scale={[0.72, 0.9, 0.42]}><capsuleGeometry args={[0.47, 0.7, 5, 12]} /><meshStandardMaterial color={primary} roughness={0.62} metalness={0.12} /></mesh>
        <mesh position={[0, 0.24, 0.4]} castShadow><boxGeometry args={[0.78, 0.08, 0.06]} /><meshStandardMaterial color={accent} metalness={0.65} roughness={0.3} /></mesh>
        <mesh position={[0, 0.06, -0.38]} rotation={[0.08, 0, 0]} castShadow><coneGeometry args={[0.88, 1.85, 5, 1, true]} /><meshStandardMaterial color={female ? '#2e1065' : '#111827'} side={THREE.DoubleSide} roughness={0.78} /></mesh>

        <group ref={leftArm} position={[-0.58, 0.28, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow><capsuleGeometry args={[0.15, 0.55, 4, 10]} /><meshStandardMaterial color={primary} roughness={0.62} /></mesh>
          <mesh position={[0, -0.78, 0]} castShadow><sphereGeometry args={[0.18, 12, 10]} /><meshStandardMaterial color={skin} roughness={0.7} /></mesh>
          {female && <Bow ref={bow} accent={accent} />}
        </group>
        <group ref={rightArm} position={[0.58, 0.28, 0]}>
          <mesh position={[0, -0.38, 0]} castShadow><capsuleGeometry args={[0.15, 0.55, 4, 10]} /><meshStandardMaterial color={primary} roughness={0.62} /></mesh>
          <mesh position={[0, -0.78, 0]} castShadow><sphereGeometry args={[0.2, 12, 10]} /><meshStandardMaterial color={female ? skin : accent} roughness={0.55} metalness={female ? 0 : 0.5} /></mesh>
          {female && <group ref={arrow} position={[0, -0.78, 0.38]} rotation={[Math.PI / 2, 0, 0]}><mesh><cylinderGeometry args={[0.03, 0.03, 1.35, 8]} /><meshStandardMaterial color="#f5d0fe" emissive="#a855f7" emissiveIntensity={1.6} /></mesh><mesh position={[0, 0.76, 0]}><coneGeometry args={[0.11, 0.25, 8]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.7} /></mesh></group>}
        </group>

        <mesh position={[0, 0.95, 0]} castShadow><sphereGeometry args={[0.48, 20, 16]} /><meshStandardMaterial color={skin} roughness={0.72} /></mesh>
        <mesh position={[0, 1.09, -0.05]} scale={[1.04, 0.7, 1.02]} castShadow><sphereGeometry args={[0.48, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62]} /><meshStandardMaterial color={hair} roughness={0.82} /></mesh>
        <Ear position={[-0.32, 1.39, 0]} color={hair} />
        <Ear position={[0.32, 1.39, 0]} color={hair} />
        <mesh position={[-0.17, 0.98, 0.43]}><sphereGeometry args={[0.055, 10, 8]} /><meshBasicMaterial color={female ? '#fef3c7' : '#fbbf24'} /></mesh>
        <mesh position={[0.17, 0.98, 0.43]}><sphereGeometry args={[0.055, 10, 8]} /><meshBasicMaterial color={female ? '#fef3c7' : '#fbbf24'} /></mesh>
      </group>

      <group ref={leftLeg} position={[-0.25, 1.08, 0]}>
        <mesh position={[0, -0.48, 0]} castShadow><capsuleGeometry args={[0.18, 0.62, 4, 10]} /><meshStandardMaterial color="#111827" roughness={0.7} /></mesh>
        <mesh position={[0, -0.91, 0.11]} castShadow><boxGeometry args={[0.34, 0.23, 0.55]} /><meshStandardMaterial color="#0a0a0a" metalness={0.25} roughness={0.48} /></mesh>
      </group>
      <group ref={rightLeg} position={[0.25, 1.08, 0]}>
        <mesh position={[0, -0.48, 0]} castShadow><capsuleGeometry args={[0.18, 0.62, 4, 10]} /><meshStandardMaterial color="#111827" roughness={0.7} /></mesh>
        <mesh position={[0, -0.91, 0.11]} castShadow><boxGeometry args={[0.34, 0.23, 0.55]} /><meshStandardMaterial color="#0a0a0a" metalness={0.25} roughness={0.48} /></mesh>
      </group>

      <mesh ref={strike} position={[0, 1.35, 1.15]} rotation={[0, 0, Math.PI / 2]} scale={0.001}>
        <torusGeometry args={[0.58, 0.08, 8, 30, Math.PI * 1.45]} />
        <meshBasicMaterial ref={strikeMaterial} color={female ? '#c084fc' : '#fde047'} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Ear({ position, color }: { position: [number, number, number]; color: string }) {
  return <mesh position={position} rotation={[0, 0, position[0] < 0 ? 0.22 : -0.22]} castShadow><coneGeometry args={[0.19, 0.42, 4]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
}

const Bow = forwardRef<THREE.Group, { accent: string }>(function Bow({ accent }, ref) {
  return <group ref={ref} position={[-0.14, -0.82, 0.34]} rotation={[0, 0, -0.12]} scale={1.2}>
    <mesh rotation={[0, 0, Math.PI / 2]}><torusGeometry args={[0.44, 0.055, 8, 24, Math.PI * 1.65]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.8} metalness={0.72} roughness={0.24} /></mesh>
    <mesh position={[0.03, 0, 0.01]}><boxGeometry args={[0.028, 0.86, 0.025]} /><meshBasicMaterial color="#fdf4ff" /></mesh>
    <mesh position={[-0.02, 0, 0.04]}><cylinderGeometry args={[0.07, 0.07, 0.24, 10]} /><meshStandardMaterial color="#3b1b0d" metalness={0.25} roughness={0.55} /></mesh>
  </group>
})
