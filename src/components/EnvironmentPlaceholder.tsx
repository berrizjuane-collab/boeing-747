import { Environment } from '@react-three/drei'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, DirectionalLight, EquirectangularReflectionMapping, FogExp2, Mesh, PointLight } from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { sampleEnvironmentColor } from '../lib/environmentTheme'
import { activeHdriSectionSlot, goldenHourWeight, highAltitudeWeight } from '../lib/hdriTheme'
import { exposureMultiplier, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { INTERIOR_ANCHORS_WORLD } from '../lib/sceneLayout'
import { SECTIONS } from '../lib/sections'
import { createSkyDomeMaterial } from '../lib/skyDomeMaterial'
import { useScrollStore } from '../state/scrollStore'

const SUN_INTENSITY = 2
const CABIN_LIGHT_INTENSITY = 3.5
const SHADOW_SECTION_END = SECTIONS[1].end + 0.04

// Comfortably inside the camera's far=3000 (SceneCanvas.tsx) and comfortably
// outside every keyframe/anchor in the scene (aircraft span ~80m, camera
// never strays far past S1's ~80m stand-off) — just a big sky, not a prop
// anything is meant to get close to.
const SKY_RADIUS = 1200

/**
 * Ground, per-section fog/background color (environmentTheme.ts), the real
 * S1/S3 HDRI sky dome (skyDomeMaterial.ts, hdriTheme.ts — Fase 3 closure
 * condition, see PROGRESS.md), and the Fase 4 threshold crossfade: the "sun"
 * directional light fades out and a warm cabin point light fades in across
 * S4, so the light source itself changes at the crossing — not just the fog
 * tint. Renderer exposure ramps down in the same window (thresholdLighting.ts)
 * for the "contained cabin" feel described in PLAN.md §3 S4.
 */
export function EnvironmentPlaceholder() {
  const { scene, gl } = useThree()
  const colorRef = useRef(new Color('#c9895b'))
  const sunRef = useRef<DirectionalLight>(null)
  const cabinLightRef = useRef<PointLight>(null)
  const skyDomeRef = useRef<Mesh>(null)

  // §6.4: the golden-hour HDRI is a *blocking* S0 asset, same tier as
  // exterior.glb — loading it through useLoader (Suspense) registers it with
  // the same THREE.DefaultLoadingManager useProgress reads, so it correctly
  // counts toward the S0 load gate once that's built (Fase 6), not just a
  // convenient way to fetch it.
  const [goldenHourMap, highAltitudeMap] = useLoader(RGBELoader, [
    '/hdri/golden-hour.hdr',
    '/hdri/high-altitude.hdr',
  ])
  const skyMaterial = useMemo(() => createSkyDomeMaterial(goldenHourMap, highAltitudeMap), [goldenHourMap, highAltitudeMap])

  useEffect(() => {
    goldenHourMap.mapping = EquirectangularReflectionMapping
    highAltitudeMap.mapping = EquirectangularReflectionMapping
  }, [goldenHourMap, highAltitudeMap])

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(colorRef.current.getHex(), 0.0035)

    const sun = sunRef.current
    if (sun) {
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 500
      sun.shadow.camera.left = -220
      sun.shadow.camera.right = 220
      sun.shadow.camera.top = 220
      sun.shadow.camera.bottom = -220
      sun.shadow.bias = -0.0005
      sun.shadow.normalBias = 0.02
    }
  }, [scene])

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    colorRef.current.copy(sampleEnvironmentColor(progress))
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(colorRef.current)
    }

    gl.toneMappingExposure = exposureMultiplier(progress)
    const sunFactor = sunIntensityMultiplier(progress)
    if (sunRef.current) {
      sunRef.current.intensity = SUN_INTENSITY * sunFactor
      // Shadow maps are useful for S1-S2's runway cue and needlessly expensive
      // once the aircraft has left the runway.
      sunRef.current.castShadow = progress < SHADOW_SECTION_END
    }
    if (cabinLightRef.current) cabinLightRef.current.intensity = CABIN_LIGHT_INTENSITY * (1 - sunFactor)

    const golden = goldenHourWeight(progress)
    const highAlt = highAltitudeWeight(progress)
    const skyOpacity = Math.min(1, golden + highAlt)
    skyMaterial.uniforms.opacity.value = skyOpacity
    skyMaterial.uniforms.mixFactor.value = skyOpacity > 1e-4 ? highAlt / (golden + highAlt) : 0
    if (skyDomeRef.current) skyDomeRef.current.visible = skyOpacity > 1e-4
  })

  const cabinMid: [number, number, number] = [0, 40, (INTERIOR_ANCHORS_WORLD.cockpit[2] + INTERIOR_ANCHORS_WORLD.upperDeck[2]) / 2]

  const activeIndex = useScrollStore((s) => s.activeIndex)
  const hdriSlot = activeHdriSectionSlot(activeIndex)
  const reflectionMap = hdriSlot === 'golden' ? goldenHourMap : hdriSlot === 'high-altitude' ? highAltitudeMap : null

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3a3a', 1.2]} />
      <directionalLight ref={sunRef} position={[80, 100, 40]} color="#ffd6ad" intensity={SUN_INTENSITY} />
      <pointLight ref={cabinLightRef} position={cabinMid} intensity={0} distance={90} decay={1.4} color="#ffcf8f" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#3c4a3a" roughness={1} />
      </mesh>
      <mesh ref={skyDomeRef} renderOrder={-10} material={skyMaterial}>
        <sphereGeometry args={[SKY_RADIUS, 32, 32]} />
      </mesh>
      {/* Reflection-only: background stays the sky dome above, this just feeds
          scene.environment for PBR IBL on standard materials (the ground/runway). */}
      {reflectionMap && <Environment map={reflectionMap} background={false} />}
    </>
  )
}
