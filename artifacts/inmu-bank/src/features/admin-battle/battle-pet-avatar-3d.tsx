import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import * as THREE from 'three'
import maleBackImage from '@assets/battle-yajusenpai-male-evolved-back-v1.png'
import femaleBackImage from '@assets/battle-yajusenpai-female-evolved-back-v1.png'
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
  const texture = useTexture(female ? femaleBackImage : maleBackImage)
  const sprite = useRef<THREE.Sprite>(null)
  const aura = useRef<THREE.Mesh>(null)
  const auraMaterial = useRef<THREE.MeshBasicMaterial>(null)
  const trail = useRef<THREE.Sprite>(null)
  const trailMaterial = useRef<THREE.SpriteMaterial>(null)
  const projectile = useRef<THREE.Group>(null)
  const { camera } = useThree()

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  useFrame(({ clock }, delta) => {
    if (!sprite.current || !trail.current || !trailMaterial.current) return
    const now = performance.now() / 1000
    const elapsed = clock.getElapsedTime()
    const duration = Math.max(0.001, actionUntil.current - actionStartedAt.current)
    const progress = THREE.MathUtils.clamp((now - actionStartedAt.current) / duration, 0, 1)
    const settle = 1 - Math.exp(-14 * Math.min(delta, 0.05))
    const running = moving.current && action.current === 'idle'
    const baseScale = female ? 3.72 : 3.55

    let x = 0
    let y = running ? 2.68 + Math.abs(Math.sin(elapsed * 8.5)) * 0.07 : 2.67 + Math.sin(elapsed * 2.3) * 0.018
    let rotation = running ? Math.sin(elapsed * 8.5) * 0.025 : 0
    let scaleX = baseScale
    let scaleY = baseScale
    let auraOpacity = 0
    let trailOpacity = 0
    let projectileZ = 0

    if (action.current === 'attack') {
      const windup = THREE.MathUtils.clamp(progress / 0.38, 0, 1)
      const impact = THREE.MathUtils.clamp((progress - 0.38) / 0.62, 0, 1)
      x = -0.16 * windup + 0.25 * Math.sin(impact * Math.PI)
      y -= 0.1 * Math.sin(progress * Math.PI)
      rotation = female ? -0.05 * windup : -0.1 * windup + 0.16 * impact
      scaleX *= 1 + impact * 0.035
      projectileZ = female ? impact * 8 : 0
      auraOpacity = Math.sin(progress * Math.PI) * 0.28
    } else if (action.current === 'dodge') {
      x = Math.sin(progress * Math.PI) * 0.72
      y -= Math.sin(progress * Math.PI) * 0.18
      rotation = -Math.sin(progress * Math.PI) * 0.16
      scaleY *= 0.94
      trailOpacity = Math.sin(progress * Math.PI) * 0.42
    } else if (action.current === 'ultimate') {
      const pulse = Math.sin(progress * Math.PI)
      y += pulse * 0.16
      scaleX *= 1 + pulse * 0.06
      scaleY *= 1 + pulse * 0.06
      auraOpacity = pulse * 0.7
    } else if (action.current === 'hurt') {
      x = -Math.sin(progress * Math.PI) * 0.24
      rotation = Math.sin(progress * Math.PI) * 0.12
    } else if (action.current === 'switch') {
      y += Math.sin(progress * Math.PI) * 0.42
      auraOpacity = Math.sin(progress * Math.PI) * 0.78
    }

    sprite.current.position.x = THREE.MathUtils.lerp(sprite.current.position.x, x, settle)
    sprite.current.position.y = THREE.MathUtils.lerp(sprite.current.position.y, y, settle)
    sprite.current.material.rotation = THREE.MathUtils.lerp(sprite.current.material.rotation, rotation, settle)
    sprite.current.scale.set(
      THREE.MathUtils.lerp(sprite.current.scale.x, scaleX, settle),
      THREE.MathUtils.lerp(sprite.current.scale.y, scaleY, settle),
      1,
    )
    trail.current.position.set(sprite.current.position.x - 0.38, sprite.current.position.y, sprite.current.position.z - 0.12)
    trail.current.scale.copy(sprite.current.scale)
    trail.current.material.rotation = sprite.current.material.rotation
    trailMaterial.current.opacity = trailOpacity
    if (aura.current) aura.current.scale.setScalar(1 + auraOpacity * 0.55)
    if (auraMaterial.current) auraMaterial.current.opacity = auraOpacity
    if (projectile.current) {
      projectile.current.visible = female && action.current === 'attack' && progress > 0.36
      projectile.current.position.z = projectileZ
      projectile.current.lookAt(camera.position)
    }
  })

  return (
    <group>
      <mesh ref={aura} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.74, 1.18, 48]} />
        <meshBasicMaterial ref={auraMaterial} color={female ? '#a855f7' : '#fde047'} transparent opacity={0} depthWrite={false} />
      </mesh>
      <sprite ref={trail} position={[0, 2.67, -0.12]} scale={[female ? 3.72 : 3.55, female ? 3.72 : 3.55, 1]} renderOrder={5}>
        <spriteMaterial ref={trailMaterial} map={texture} transparent opacity={0} depthWrite={false} color={female ? '#c084fc' : '#fde68a'} />
      </sprite>
      <sprite ref={sprite} position={[0, 2.67, 0]} scale={[female ? 3.72 : 3.55, female ? 3.72 : 3.55, 1]} renderOrder={6}>
        <spriteMaterial map={texture} transparent alphaTest={0.04} depthWrite={false} toneMapped={false} />
      </sprite>
      {female && <group ref={projectile} visible={false} position={[0.44, 2.55, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh><cylinderGeometry args={[0.025, 0.025, 1.4, 8]} /><meshBasicMaterial color="#f5d0fe" /></mesh>
        <mesh position={[0, 0.82, 0]}><coneGeometry args={[0.11, 0.28, 8]} /><meshBasicMaterial color="#c084fc" /></mesh>
        <pointLight color="#a855f7" intensity={3} distance={3} />
      </group>}
    </group>
  )
}
