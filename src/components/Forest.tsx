import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh as InstancedMeshImpl, Object3D, StaticDrawUsage, type BufferGeometry, type Material } from 'three'
import { createForestMaterial } from '../lib/forestMaterial'
import { placeForestBand, placeShrubs, type PlacedPlant } from '../lib/forestPlacement'
import { createHillRingGeometry } from '../lib/hillsField'
import { createBroadleafGeometry, createConiferGeometry, createShrubGeometry } from '../lib/treeGeometry'
import { type QualityTier, useQualityStore } from '../state/qualityStore'
import { reducedMotionState } from '../state/reducedMotion'

/**
 * plan4.md Fase H1/H2 (round 5): the hero forest. Five draw calls total —
 * near conifers, near broadleaf, shrubs, mid conifers, far conifers — plus
 * one for the hill ring, all sharing forestMaterial.ts. Placement is pure
 * (forestPlacement.ts) so it is testable without a renderer; this file is
 * only the InstancedMesh wiring, the per-instance colour palettes and the
 * tier-dependent instance counts (draw calls never change with tier, only
 * `count` does — plan4.md §1.7).
 */
const TIER_FRACTION: Record<QualityTier, number> = { high: 1, mid: 0.62, low: 0.36 }

interface Palette {
  deep: Color
  mid: Color
  warm: Color
  /** Share of instances pulled toward `warm` (autumn/dry crowns). */
  warmShare: number
}

const CONIFER_PALETTE: Palette = { deep: new Color('#1f3a21'), mid: new Color('#3e5a2c'), warm: new Color('#5c6a33'), warmShare: 0.22 }
const BROADLEAF_PALETTE: Palette = { deep: new Color('#36552a'), mid: new Color('#65803a'), warm: new Color('#a1782f'), warmShare: 0.14 }
const SHRUB_PALETTE: Palette = { deep: new Color('#465f2f'), mid: new Color('#748440'), warm: new Color('#8c8037'), warmShare: 0.3 }

const hsl = { h: 0, s: 0, l: 0 }

function plantColor(target: Color, plant: PlacedPlant, palette: Palette): Color {
  target.copy(palette.deep).lerp(palette.mid, plant.hue)
  if (plant.light < palette.warmShare) target.lerp(palette.warm, 0.55 + plant.light)
  target.getHSL(hsl)
  target.setHSL(hsl.h, hsl.s, Math.min(0.9, hsl.l * (0.78 + plant.light * 0.44)))
  return target
}

interface PlantBandProps {
  name: string
  geometry: BufferGeometry
  material: Material
  plants: PlacedPlant[]
  palette: Palette
  tier: QualityTier
}

function PlantBand({ name, geometry, material, plants, palette, tier }: PlantBandProps) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const count = Math.max(1, Math.round(plants.length * TIER_FRACTION[tier]))

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    const color = new Color()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    for (let index = 0; index < plants.length; index += 1) {
      const plant = plants[index]
      dummy.position.set(plant.x, plant.y - 0.15, plant.z)
      dummy.rotation.set(0, plant.rotationY, 0)
      dummy.scale.set(plant.scale, plant.scale * plant.heightScale, plant.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, plantColor(color, plant, palette))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [plants, palette])

  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[geometry, material, Math.max(1, plants.length)]}
      count={count}
      frustumCulled={false}
      receiveShadow
    />
  )
}

export function Forest() {
  const tier = useQualityStore((state) => state.tier)
  const geometries = useMemo(
    () => ({
      near: createConiferGeometry('near'),
      mid: createConiferGeometry('mid'),
      far: createConiferGeometry('far'),
      broadleaf: createBroadleafGeometry(),
      shrub: createShrubGeometry(),
      hills: createHillRingGeometry(),
    }),
    [],
  )
  const placements = useMemo(() => {
    const near = placeForestBand('near')
    return {
      nearConifer: near.filter((plant) => plant.species === 'conifer'),
      nearBroadleaf: near.filter((plant) => plant.species === 'broadleaf'),
      mid: placeForestBand('mid'),
      far: placeForestBand('far'),
      shrubs: placeShrubs(),
    }
  }, [])
  const trees = useMemo(() => createForestMaterial('#4a3424', 0.06), [])
  const hills = useMemo(() => {
    const handles = createForestMaterial('#4a3424', 0)
    handles.material.color.set('#2f4a2e')
    handles.material.vertexColors = true
    return handles
  }, [])

  useFrame((_, delta) => {
    if (reducedMotionState.active) return
    trees.windTime.value += Math.min(delta, 0.1)
  })

  return (
    <group name="Environment · Forest">
      <PlantBand name="Forest · Near conifers" geometry={geometries.near} material={trees.material} plants={placements.nearConifer} palette={CONIFER_PALETTE} tier={tier} />
      <PlantBand name="Forest · Near broadleaf" geometry={geometries.broadleaf} material={trees.material} plants={placements.nearBroadleaf} palette={BROADLEAF_PALETTE} tier={tier} />
      <PlantBand name="Forest · Shrubs" geometry={geometries.shrub} material={trees.material} plants={placements.shrubs} palette={SHRUB_PALETTE} tier={tier} />
      <PlantBand name="Forest · Mid conifers" geometry={geometries.mid} material={trees.material} plants={placements.mid} palette={CONIFER_PALETTE} tier={tier} />
      <PlantBand name="Forest · Far conifers" geometry={geometries.far} material={trees.material} plants={placements.far} palette={CONIFER_PALETTE} tier={tier} />
      <mesh name="Environment · Hill ring" geometry={geometries.hills} material={hills.material} position={[0, -0.05, 0]} frustumCulled={false} />
    </group>
  )
}
