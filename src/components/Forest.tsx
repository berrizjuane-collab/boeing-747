import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh as InstancedMeshImpl, Object3D, StaticDrawUsage } from 'three'
import { computeCanopyMistColor } from '../lib/canopyMist'
import { createCanopyMistMaterial } from '../lib/canopyMistMaterial'
import { createFarConiferGeometry, createMidConiferGeometry, createNearConiferGeometry } from '../lib/coniferGeometry'
import { sampleEnvironmentTheme } from '../lib/environmentTheme'
import { sampleForestBand } from '../lib/forestPlacement'
import { terrainHeightAt, type FieldInstance, type TreeBand } from '../lib/terrainField'
import { useQualityStore, type QualityTier } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

/**
 * plan4.md Fase H1/H2: one InstancedMesh per distance band (near/mid/far),
 * each sourced from terrainField.ts's shared forestDensityAt field
 * (bug #16 — the same field the terrain texture and grass read, so the
 * forest clusters where the ground actually looks forested, never floats
 * over bare-dirt patches the texture disagrees with). 3 draw calls total,
 * regardless of instance count — an InstancedMesh is always one draw call.
 */

// plan4.md §3.2/H1's own starting point (~1000/800/600) is instance-count
// derived from the field's own coverage/clustering, not a fixed constant
// this component picks — see progress4.md H1/H2 for the real measured
// counts. Second-order jitter derived from the field's own `rotationY`
// (an independent hash draw from `jitter`, terrainField.ts) rather than a
// third RNG call: reused here purely as a decorrelated [0,1) scalar for
// colour, unrelated to its rotational meaning at the placement site.
function colorJitterOf(instance: FieldInstance): number {
  return instance.rotationY / (Math.PI * 2)
}

interface ForestBandMeshProps {
  band: TreeBand
  geometry: ReturnType<typeof createNearConiferGeometry>['geometry']
  material: ReturnType<typeof createCanopyMistMaterial>['material']
  tierFraction: number
}

function ForestBandMesh({ band, geometry, material, tierFraction }: ForestBandMeshProps) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const instances = useMemo(() => sampleForestBand(band), [band])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || instances.length === 0) return
    const dummy = new Object3D()
    const instanceColor = new Color()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)

    instances.forEach((instance, index) => {
      const scale = 0.82 + instance.jitter * 0.42
      dummy.position.set(instance.x, terrainHeightAt(instance.x, instance.z), instance.z)
      dummy.rotation.set(0, instance.rotationY, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.setScalar(0.85 + colorJitterOf(instance) * 0.3))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [instances])

  const visibleCount = Math.floor(instances.length * tierFraction)

  return (
    <instancedMesh
      ref={meshRef}
      name={`Environment · Forest · ${band}`}
      args={[geometry, material, Math.max(1, instances.length)]}
      count={visibleCount}
      visible={visibleCount > 0}
      // plan4.md §3.10: the exterior rig doesn't cast shadows (closed
      // budget decision) — forest only needs to *receive* the analytical
      // ground-shadow / hemisphere light, matching Runway/DistantAirport.
      receiveShadow
    />
  )
}

const TIER_FOREST_FRACTION: Record<QualityTier, number> = { high: 1, mid: 0.6, low: 0.3 }

export function Forest() {
  const tier = useQualityStore((state) => state.tier)
  const tierFraction = TIER_FOREST_FRACTION[tier]
  const near = useMemo(createNearConiferGeometry, [])
  const mid = useMemo(createMidConiferGeometry, [])
  const far = useMemo(createFarConiferGeometry, [])
  const { material, canopyMistColor } = useMemo(() => createCanopyMistMaterial('forest', { vertexColors: true, roughness: 1 }), [])

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    const theme = sampleEnvironmentTheme(progress)
    computeCanopyMistColor(theme.background, canopyMistColor.value)
  })

  return (
    <group name="Airport · Forest">
      <ForestBandMesh band="near" geometry={near.geometry} material={material} tierFraction={tierFraction} />
      <ForestBandMesh band="mid" geometry={mid.geometry} material={material} tierFraction={tierFraction} />
      <ForestBandMesh band="far" geometry={far.geometry} material={material} tierFraction={tierFraction} />
    </group>
  )
}
