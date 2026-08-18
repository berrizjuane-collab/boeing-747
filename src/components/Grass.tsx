import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh as InstancedMeshImpl, Object3D, StaticDrawUsage } from 'three'
import { computeCanopyMistColor } from '../lib/canopyMist'
import { sampleEnvironmentTheme } from '../lib/environmentTheme'
import { createGrassClumpGeometry } from '../lib/grassGeometry'
import { sampleGrassInstances } from '../lib/grassPlacement'
import { createGrassMaterial } from '../lib/grassMaterial'
import { reducedMotionState } from '../state/reducedMotion'
import { terrainHeightAt } from '../lib/terrainField'
import { useQualityStore, type QualityTier } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

// plan4.md H3: same two greens the pre-H3 clump used (RunwayEnvironment.tsx)
// — H3 changes normals/placement/cutoff/wind/emissive, not the palette.
const COOL_GREEN = '#52664c'
const SUNLIT_GREEN = '#96a269'

function frac(value: number): number {
  return value - Math.floor(value)
}

const GRASS_TIER_FRACTION: Record<QualityTier, number> = { high: 1, mid: 0.5, low: 0.22 }

/** One instanced grass field, field-placed instead of a hand-rolled rectangle — replaces RunwayEnvironment.tsx's old VegetationBands (plan4.md H3/H4). */
export function Grass() {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const tier = useQualityStore((state) => state.tier)
  const geometry = useMemo(createGrassClumpGeometry, [])
  const { material, canopyMistColor, windTime } = useMemo(createGrassMaterial, [])
  const instances = useMemo(sampleGrassInstances, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || instances.length === 0) return
    const dummy = new Object3D()
    const coolGreen = new Color(COOL_GREEN)
    const sunlitGreen = new Color(SUNLIT_GREEN)
    const instanceColor = new Color()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)

    instances.forEach((instance, index) => {
      // terrainField.ts's FieldInstance carries two independent hash draws
      // (jitter, rotationY); a blade needs height + lateral scale + a
      // colour-lerp position too, so two more decorrelated [0,1) values are
      // derived here the same way Forest.tsx does — no third RNG call, no
      // dependency the module doesn't already expose.
      const secondary = frac((instance.rotationY / (Math.PI * 2)) * 37.719 + 11.13)
      const tertiary = frac(instance.jitter + secondary * 1.618)
      const height = 0.55 + instance.jitter * 1.05
      const lateralScale = 0.65 + secondary * 1.1
      dummy.position.set(instance.x, terrainHeightAt(instance.x, instance.z), instance.z)
      dummy.rotation.set(0, instance.rotationY, 0)
      dummy.scale.set(lateralScale, height, lateralScale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.copy(coolGreen).lerp(sunlitGreen, tertiary))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])

  useFrame(({ clock }) => {
    const { progress } = useScrollStore.getState()
    const theme = sampleEnvironmentTheme(progress)
    computeCanopyMistColor(theme.background, canopyMistColor.value)
    // Bypass matches DustParticles/RunwayEnvironment.tsx's own
    // prefers-reduced-motion handling: freeze the uniform instead of
    // branching the shader, so blades hold their current bend rather than
    // animating toward a "wind off" pose.
    if (!reducedMotionState.active) windTime.value = clock.elapsedTime
  })

  const visibleCount = Math.floor(instances.length * GRASS_TIER_FRACTION[tier])

  return (
    <instancedMesh
      ref={meshRef}
      name="Airport · Instanced grass field"
      args={[geometry, material, Math.max(1, instances.length)]}
      count={visibleCount}
      visible={visibleCount > 0}
      receiveShadow
    />
  )
}
