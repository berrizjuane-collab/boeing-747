import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Vector2, type Mesh } from 'three'
import { updateCanopyMistColor } from '../lib/canopyMist'
import { sampleEnvironmentTheme } from '../lib/environmentTheme'
import { createTerrainDiscGeometry, updateTerrainDiscForCenter } from '../lib/terrainGeometry'
import { applyGroundTint } from '../lib/terrainGroundCurves'
import { aerodromeDetailVisible, undercastOpacity } from '../lib/worldPersistence'
import { getAircraftPose } from '../lib/aircraftPose'
import { createTerrainGroundMaterial } from '../lib/terrainGroundMaterial'
import { createTerrainSurfaceMaps, TERRAIN_SURFACE_MAP_SIZE } from '../lib/terrainSurfaceMaps'
import { useQualityStore } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'
import { terrainGenerationStats } from '../state/terrainGenerationStats'

// plan4.md G2: subtle, matching "geometría de bajo relieve" — stronger than
// the aircraft hull's own normalScale (0.32, dissolveHullMaterial.ts) since
// dirt/grass micro-detail reads better with a bit more punch than aircraft
// panel lines, but still short of an exaggerated bump.
const TERRAIN_NORMAL_SCALE = new Vector2(0.6, 0.6)

// plan4.md G1/bug #15: only rebuild the ~9.4k-vertex disc (relief + world
// UV, terrainGeometry.ts) when the camera has actually drifted this far
// from the last rebuild's centre — not every frame. At 200u, the camera is
// never more than 100u from the "true" centre, leaving the disc's edge
// (TERRAIN_DISC_SIZE / 2 = 1500u away) still comfortably past where
// plan4.md §1.3's fog table already reads near-total (0.988 at 1400u).
const TERRAIN_RECENTER_STEP = 200

/**
 * plan4.md Fase G: replaces EnvironmentPlaceholder.tsx's old
 * planeGeometry(4000,4000) ground plane. Geometry (terrainGeometry.ts) and
 * material (terrainGroundMaterial.ts) are pure factories; this component is
 * the React/useFrame wiring — camera-follow recentring, G3's tint mix and
 * G4's canopy-mist colour, and the pre-existing S2/S3 opacity crossfade
 * carried over unchanged.
 */
export function TerrainGround() {
  const meshRef = useRef<Mesh>(null)
  const geometry = useMemo(createTerrainDiscGeometry, [])
  const { material } = useMemo(createTerrainGroundMaterial, [])
  const lastCenter = useRef({ x: Number.NaN, z: Number.NaN })
  const tier = useQualityStore((state) => state.tier)

  // plan4.md G2/04-04: regenerated only when the tier actually changes
  // (TERRAIN_SURFACE_MAP_SIZE keyed by tier), not every frame — texture
  // generation is the ~1M-texel cost budgeted in progress4.md 04-04, not a
  // per-frame one. Disposed on regeneration/unmount so switching tiers
  // doesn't leak the previous tier's GPU textures (same pattern
  // ExteriorAsset.tsx already uses for aircraftSurfaceMaps' textures).
  const surfaceMaps = useMemo(() => {
    const startedAt = performance.now()
    const maps = createTerrainSurfaceMaps(TERRAIN_SURFACE_MAP_SIZE[tier])
    terrainGenerationStats.lastGenerationMs = performance.now() - startedAt
    return maps
  }, [tier])
  useEffect(() => {
    material.map = surfaceMaps.albedo
    material.normalMap = surfaceMaps.normal
    material.normalScale = TERRAIN_NORMAL_SCALE
    material.roughnessMap = surfaceMaps.roughness
    material.roughness = 1
    material.needsUpdate = true
    return () => {
      surfaceMaps.albedo.dispose()
      surfaceMaps.normal.dispose()
      surfaceMaps.roughness.dispose()
    }
  }, [material, surfaceMaps])

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh) return

    const centerX = Math.round(camera.position.x / TERRAIN_RECENTER_STEP) * TERRAIN_RECENTER_STEP
    const centerZ = Math.round(camera.position.z / TERRAIN_RECENTER_STEP) * TERRAIN_RECENTER_STEP
    if (centerX !== lastCenter.current.x || centerZ !== lastCenter.current.z) {
      updateTerrainDiscForCenter(geometry, centerX, centerZ)
      lastCenter.current.x = centerX
      lastCenter.current.z = centerZ
    }
    mesh.position.set(centerX, 0, centerZ)

    const { progress } = useScrollStore.getState()
    const theme = sampleEnvironmentTheme(progress)

    // G3: mix the base white (fully texture-authored) toward theme.ground * GAIN.
    applyGroundTint(material.color, theme.ground, progress)

    // G4: canopy mist — warmer and measurably brighter than theme.background
    // itself, not a copy of scene.fog.color. Round 5: computed once here
    // into the shared canopyMist.ts uniform that terrain, forest, grass,
    // hills and the sky-dome horizon band all read.
    updateCanopyMistColor(theme.background)

    // plan6 4.1 (A13): the ground no longer crossfades out at the S2/S3
    // boundary. It is opaque for as long as anything could see it and
    // culled on the same signal as the rest of the aerodrome — once the
    // cloud deck above it is closed (worldPersistence.ts). The world now
    // goes away because something covers it, not because scroll passed a
    // number.
    mesh.visible = aerodromeDetailVisible(undercastOpacity(getAircraftPose(progress).altitude))
  })

  return <mesh ref={meshRef} name="Environment · Terrain ground" geometry={geometry} material={material} receiveShadow />
}
