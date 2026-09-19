import { qaTime } from '../lib/qaConfig'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh as InstancedMeshImpl, Object3D, StaticDrawUsage } from 'three'
import { createGrassClumpGeometry } from '../lib/grassGeometry'
import { createGrassMaterial } from '../lib/grassMaterial'
import { GRASS_COUNT, placeGrass } from '../lib/grassPlacement'
import { useQualityStore } from '../state/qualityStore'
import { reducedMotionState } from '../state/reducedMotion'

/**
 * plan4.md H3/H4: the rebuilt instanced grass — one draw call at every
 * tier, Mobile Low included (bug #17 closed: `low` now renders a real
 * count instead of 0). Instances are pre-sorted nearest-to-hero-first by
 * grassPlacement.ts, so each tier's `count` keeps the clumps that matter
 * most on screen.
 */
const DRY = new Color('#a9a45a')
const GREEN = new Color('#537f3a')
const hsl = { h: 0, s: 0, l: 0 }

export function GrassField() {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const tier = useQualityStore((state) => state.tier)
  const geometry = useMemo(createGrassClumpGeometry, [])
  const { material, windTime } = useMemo(createGrassMaterial, [])
  const placed = useMemo(placeGrass, [])
  const maxCount = Math.min(placed.length, GRASS_COUNT.high)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    const color = new Color()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    for (let index = 0; index < maxCount; index += 1) {
      const clump = placed[index]
      dummy.position.set(clump.x, clump.y - 0.02, clump.z)
      // No random yaw: the wind bend in grassMaterial.ts is applied in
      // local space, and unrotated clumps keep one consistent world wind
      // direction across the field (the clump geometry already fans its
      // blades around the full circle).
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(clump.scale, clump.scale * clump.heightScale, clump.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      color.copy(DRY).lerp(GREEN, Math.sqrt(clump.mask))
      color.getHSL(hsl)
      color.setHSL((hsl.h + (clump.light - 0.5) * 0.03 + 1) % 1, hsl.s, Math.min(0.85, hsl.l * (0.8 + clump.light * 0.45)))
      mesh.setColorAt(index, color)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [placed, maxCount])

  useFrame((_, delta) => {
    if (reducedMotionState.active) return
    windTime.value = qaTime ?? windTime.value + Math.min(delta, 0.1)
  })

  return (
    <instancedMesh
      ref={meshRef}
      name="Airport · Instanced grass clumps"
      args={[geometry, material, Math.max(1, maxCount)]}
      count={Math.min(maxCount, GRASS_COUNT[tier])}
      frustumCulled={false}
      receiveShadow
    />
  )
}
