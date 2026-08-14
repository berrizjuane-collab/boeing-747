import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  AmbientLight,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three'
import { createCabinFillTexture } from '../lib/cabinEnvironment'
import { EXTERIOR_LIGHTS, sampleEnvironmentTheme } from '../lib/environmentTheme'
import { exponentialFogMix, FOG_EVIDENCE_DISTANCES } from '../lib/fogMetrics'
import { activeHdriSectionSlot, goldenHourWeight, highAltitudeWeight, sunsetWeight } from '../lib/hdriTheme'
import { getActiveSectionIndex, SECTIONS } from '../lib/sections'
import { sampleSolarRig } from '../lib/solarLighting'
import { exposureMultiplier, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { createSkyDomeMaterial } from '../lib/skyDomeMaterial'
import {
  estimatedHdriGpuBytes,
  HDRI_GPU_WIDTH,
  HDRI_LOADER_BY_TIER,
  HDRI_SOURCE_RESOLUTION,
} from '../lib/tieredHdri'
import { exposureState } from '../state/exposureState'
import { imagePipelineDiagnostics } from '../state/imagePipelineDiagnostics'
import { loadingState } from '../state/loadingState'
import { useQualityStore } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

// PLAN.md §10.4: the scene reveals like a photo, exposure ramping 0 -> target
// over ~1.2s once loading finishes, instead of popping in the instant each
// asset's own Suspense boundary happens to resolve (exterior.glb and the
// HDRIs are *separate* Suspense boundaries — see SceneCanvas.tsx — so
// without this they could visibly pop in at different moments).
const LOAD_REVEAL_DURATION = 1.2
const clamp01Reveal = (x: number) => Math.min(1, Math.max(0, x))
const GROUND_FADE_START = SECTIONS[1].end
const GROUND_FADE_END = SECTIONS[2].start + 0.025

// Comfortably inside the camera's far=3000 (SceneCanvas.tsx) and comfortably
// outside every keyframe/anchor in the scene (aircraft span ~80m, camera
// never strays far past S1's ~80m stand-off) — just a big sky, not a prop
// anything is meant to get close to.
const SKY_RADIUS = 1200
const SKY_WIDTH_SEGMENTS = 96
const SKY_HEIGHT_SEGMENTS = 48
const HDRI_URLS = [
  `${import.meta.env.BASE_URL}hdri/golden-hour.hdr`,
  `${import.meta.env.BASE_URL}hdri/high-altitude.hdr`,
  `${import.meta.env.BASE_URL}hdri/sunset.hdr`,
]

/**
 * Ground, per-section fog/background color (environmentTheme.ts), the real
 * S1/S3 HDRI sky dome (skyDomeMaterial.ts, hdriTheme.ts — Fase 3 closure
 * condition, see PROGRESS.md), and the exterior side of the Fase 4 threshold
 * crossfade: the "sun" directional light fades out across S4 so the light
 * source reads as changing at the crossing — not just the fog tint. Renderer
 * exposure ramps down in the same window (thresholdLighting.ts) for the
 * "contained cabin" feel described in PLAN.md §3 S4. The interior side of
 * that same crossfade (the warm cabin light growing to replace it) lives in
 * InteriorLighting.tsx, mounted only for S4-S6 — this component used to also
 * carry a simple placeholder cabin point light for that, from before
 * InteriorLighting existed; removed once InteriorLighting's own
 * shadow-casting spotlights (timed to the identical S4 window) made it
 * redundant, so the cabin isn't double-lit during S4-S5.
 *
 * S6 gets its own HDRI too (PLAN.md §5's third: "atardecer") — a *second*,
 * separate sky dome mesh rather than a third slot in the golden/high-altitude
 * dome's shader: that shader's whole reason to exist is blending exactly two
 * textures cheaply in one pass (skyDomeMaterial.ts), and golden/high-altitude
 * never overlap in time with sunset (they're fully faded out by S4, sunset
 * doesn't start fading in until S6), so there's nothing to blend between the
 * two domes at runtime — just one fading out long before the other fades in.
 * A single-texture MeshBasicMaterial is the simplest thing that's correct.
 */
export function EnvironmentPlaceholder() {
  const { scene } = useThree()
  const tier = useQualityStore((state) => state.tier)
  const colorRef = useRef(new Color('#9f6246'))
  const fogColorRef = useRef(new Color('#ad765e'))
  const keyRef = useRef<DirectionalLight>(null)
  const fillRef = useRef<DirectionalLight>(null)
  const rimRef = useRef<DirectionalLight>(null)
  const hemisphereRef = useRef<HemisphereLight>(null)
  const ambientRef = useRef<AmbientLight>(null)
  const groundRef = useRef<Mesh>(null)
  const groundMaterialRef = useRef<MeshStandardMaterial>(null)
  const skyDomeRef = useRef<Mesh>(null)
  const sunsetDomeRef = useRef<Mesh>(null)

  // §6.4: the golden-hour HDRI is a *blocking* S0 asset, same tier as
  // exterior.glb — loading it through useLoader (Suspense) registers it with
  // the same THREE.DefaultLoadingManager useProgress reads, so it correctly
  // counts toward the S0 load gate once that's built (Fase 6), not just a
  // convenient way to fetch it. Sunset joins the same blocking call for
  // simplicity. The three 4K sources total 6.54MB on the wire and keep S0 at
  // 8.76MB including exterior.glb, below §6.4's 15MB ceiling. The loader
  // retains that source fidelity on High and box-filters to 2K/1K before GPU
  // upload on Mid/Low so mobile does not inherit High's residency cost.
  // import.meta.env.BASE_URL, not bare '/hdri/...': see vite.config.ts's `base` comment.
  const HdriLoader = HDRI_LOADER_BY_TIER[tier]
  const [goldenHourMap, highAltitudeMap, sunsetMap] = useLoader(HdriLoader, HDRI_URLS)
  const cabinFillMap = useMemo(createCabinFillTexture, [])
  const skyMaterial = useMemo(() => createSkyDomeMaterial(goldenHourMap, highAltitudeMap), [goldenHourMap, highAltitudeMap])
  const sunsetMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        map: sunsetMap,
        side: BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
        toneMapped: true,
      }),
    [sunsetMap],
  )

  useEffect(() => {
    const maps = [goldenHourMap, highAltitudeMap, sunsetMap]
    for (const map of maps) map.mapping = EquirectangularReflectionMapping
    return () => {
      for (const map of maps) map.dispose()
      useLoader.clear(HdriLoader, HDRI_URLS)
    }
  }, [HdriLoader, goldenHourMap, highAltitudeMap, sunsetMap])

  useEffect(() => () => skyMaterial.dispose(), [skyMaterial])
  useEffect(() => () => sunsetMaterial.dispose(), [sunsetMaterial])

  useEffect(() => () => cabinFillMap.dispose(), [cabinFillMap])

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(fogColorRef.current.getHex(), 0.0015)
  }, [scene])

  const bindEnvironment = useCallback(
    (activeIndex: number) => {
      const exteriorSlot = activeHdriSectionSlot(activeIndex)
      const environmentSource: 'golden' | 'high-altitude' | 'cabin' | 'sunset' =
        activeIndex === 4 ? 'cabin' : exteriorSlot
      scene.environment =
        environmentSource === 'golden'
          ? goldenHourMap
          : environmentSource === 'high-altitude'
            ? highAltitudeMap
            : environmentSource === 'sunset'
              ? sunsetMap
              : cabinFillMap
      imagePipelineDiagnostics.environmentSource = environmentSource
      imagePipelineDiagnostics.environmentBound = scene.environment !== null
      return { environmentSource, environmentBound: scene.environment !== null }
    },
    [cabinFillMap, goldenHourMap, highAltitudeMap, scene, sunsetMap],
  )

  const sampleEnvironmentQa = useCallback(
    (progress: number) => {
      const theme = sampleEnvironmentTheme(progress)
      const solar = sampleSolarRig(progress)
      const gpuWidth = HDRI_GPU_WIDTH[tier]
      return {
        ...bindEnvironment(getActiveSectionIndex(progress)),
        effectiveExposure: exposureMultiplier(progress) * theme.exposureCompensation,
        fogColor: theme.fogColor.getHex(),
        fogDensity: theme.fogDensity,
        fogSamples: FOG_EVIDENCE_DISTANCES.map((distance) => ({
          distance,
          mix: exponentialFogMix(theme.fogDensity, distance),
        })),
        hemisphereIntensity: theme.hemisphereIntensity,
        ambientIntensity: theme.ambientIntensity,
        solar: {
          source: solar.source,
          sunAzimuthDeg: solar.sunAzimuthDeg,
          sunElevationDeg: solar.sunElevationDeg,
          keyAzimuthDeg: solar.keyAzimuthDeg,
          keyElevationDeg: solar.keyElevationDeg,
          keyAngularErrorDeg: solar.keyAngularErrorDeg,
        },
        hdri: {
          sourceResolution: [...HDRI_SOURCE_RESOLUTION] as [number, number],
          gpuResolution: [gpuWidth, gpuWidth / 2] as [number, number],
          mipmaps: true,
          estimatedResidentBytes: estimatedHdriGpuBytes(tier),
        },
        skyDomeSegments: [SKY_WIDTH_SEGMENTS, SKY_HEIGHT_SEGMENTS] as [number, number],
      }
    },
    [bindEnvironment, tier],
  )

  useEffect(() => {
    window.__MERIDIAN_ENVIRONMENT_QA__ = {
      sample: sampleEnvironmentQa,
    }
    return () => {
      delete window.__MERIDIAN_ENVIRONMENT_QA__
    }
  }, [sampleEnvironmentQa])

  useFrame(() => {
    const { progress, activeIndex } = useScrollStore.getState()
    const theme = sampleEnvironmentTheme(progress)
    const solar = sampleSolarRig(progress)
    colorRef.current.copy(theme.background)
    fogColorRef.current.copy(theme.fogColor)
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(fogColorRef.current)
      scene.fog.density = theme.fogDensity
    }
    scene.environmentIntensity = theme.environmentIntensity
    bindEnvironment(activeIndex)
    if (groundMaterialRef.current) groundMaterialRef.current.color.copy(theme.ground)
    const groundFade = clamp01Reveal((GROUND_FADE_END - progress) / (GROUND_FADE_END - GROUND_FADE_START))
    if (groundRef.current) groundRef.current.visible = groundFade > 0.01
    if (groundMaterialRef.current) {
      groundMaterialRef.current.opacity = groundFade
      groundMaterialRef.current.depthWrite = groundFade > 0.98
    }

    const revealStart = loadingState.revealStartSeconds
    const loadReveal = revealStart === null ? 0 : clamp01Reveal((performance.now() / 1000 - revealStart) / LOAD_REVEAL_DURATION)
    // Not gl.toneMappingExposure: PostFX.tsx's <EffectComposer> forces
    // gl.toneMapping to NoToneMapping for as long as it's mounted (which is
    // always, as of Fase 7), and three.js's tonemapping_fragment shader
    // chunk is a no-op under NoToneMapping — the renderer-level exposure
    // uniform silently stopped doing anything. ExposurePass.tsx (mounted
    // first in PostFX's effect chain) picks it back up as a real
    // post-process multiply instead.
    const effectiveExposure = exposureMultiplier(progress) * theme.exposureCompensation * loadReveal
    exposureState.value = effectiveExposure

    const hemisphere = hemisphereRef.current
    if (hemisphere) {
      hemisphere.color.copy(theme.hemisphereSky)
      hemisphere.groundColor.copy(theme.hemisphereGround)
      hemisphere.intensity = theme.hemisphereIntensity
      hemisphere.visible = theme.hemisphereIntensity > 0.01
    }
    const ambient = ambientRef.current
    if (ambient) {
      ambient.color.copy(theme.hemisphereSky)
      ambient.intensity = theme.ambientIntensity
      ambient.visible = theme.ambientIntensity > 0.001
    }

    const lightRefs = { key: keyRef.current, fill: fillRef.current, rim: rimRef.current }
    const lightPositions = { key: solar.keyPosition, fill: solar.fillPosition, rim: solar.rimPosition }
    for (const role of ['key', 'fill', 'rim'] as const) {
      const light = lightRefs[role]
      if (!light) continue
      const sample = theme.lights[role]
      light.color.copy(sample.color)
      const intensity = role === 'key' ? sample.intensity * sunIntensityMultiplier(progress) : sample.intensity
      light.intensity = intensity
      light.visible = intensity > 0.01
      light.position.copy(lightPositions[role])
      // Runtime metadata mirrors the declared inventory and makes the light
      // rig inspectable in Three devtools / QA without parsing source text.
      light.userData.temperatureKelvin = sample.temperatureKelvin
      light.userData.intensity = intensity
    }

    imagePipelineDiagnostics.effectiveExposure = effectiveExposure
    imagePipelineDiagnostics.fogColor = theme.fogColor.getHex()
    imagePipelineDiagnostics.fogDensity = theme.fogDensity
    imagePipelineDiagnostics.hemisphereIntensity = theme.hemisphereIntensity
    imagePipelineDiagnostics.ambientIntensity = theme.ambientIntensity
    for (let index = 0; index < FOG_EVIDENCE_DISTANCES.length; index += 1) {
      const distance = FOG_EVIDENCE_DISTANCES[index]
      imagePipelineDiagnostics.fogSamples[index].mix = exponentialFogMix(theme.fogDensity, distance)
    }
    imagePipelineDiagnostics.solar.source = solar.source
    imagePipelineDiagnostics.solar.sunAzimuthDeg = solar.sunAzimuthDeg
    imagePipelineDiagnostics.solar.sunElevationDeg = solar.sunElevationDeg
    imagePipelineDiagnostics.solar.keyAzimuthDeg = solar.keyAzimuthDeg
    imagePipelineDiagnostics.solar.keyElevationDeg = solar.keyElevationDeg
    imagePipelineDiagnostics.solar.keyAngularErrorDeg = solar.keyAngularErrorDeg
    const gpuWidth = HDRI_GPU_WIDTH[tier]
    imagePipelineDiagnostics.hdri.sourceResolution[0] = HDRI_SOURCE_RESOLUTION[0]
    imagePipelineDiagnostics.hdri.sourceResolution[1] = HDRI_SOURCE_RESOLUTION[1]
    imagePipelineDiagnostics.hdri.gpuResolution[0] = gpuWidth
    imagePipelineDiagnostics.hdri.gpuResolution[1] = gpuWidth / 2
    imagePipelineDiagnostics.hdri.mipmaps = true
    imagePipelineDiagnostics.hdri.estimatedResidentBytes = estimatedHdriGpuBytes(tier)
    imagePipelineDiagnostics.skyDomeSegments[0] = SKY_WIDTH_SEGMENTS
    imagePipelineDiagnostics.skyDomeSegments[1] = SKY_HEIGHT_SEGMENTS

    const golden = goldenHourWeight(progress)
    const highAlt = highAltitudeWeight(progress)
    const skyOpacity = Math.min(1, golden + highAlt)
    skyMaterial.uniforms.opacity.value = skyOpacity
    skyMaterial.uniforms.mixFactor.value = skyOpacity > 1e-4 ? highAlt / (golden + highAlt) : 0
    if (skyDomeRef.current) skyDomeRef.current.visible = skyOpacity > 1e-4

    const sunsetOpacity = sunsetWeight(progress)
    sunsetMaterial.opacity = sunsetOpacity
    if (sunsetDomeRef.current) sunsetDomeRef.current.visible = sunsetOpacity > 1e-4
  })

  return (
    <>
      {/* The exterior key deliberately has no realtime shadow map. The A380
          is split into 100+ meshes, so that pass alone broke the high-tier
          draw budget. RunwayEnvironment renders the moving contact cue as a
          one-draw analytical projection; tiered interior shadows are unchanged. */}
      <directionalLight
        ref={keyRef}
        name={EXTERIOR_LIGHTS.key.name}
        position={EXTERIOR_LIGHTS.key.position}
        color="#ffd0a0"
        intensity={1.55}
        userData={{
          role: EXTERIOR_LIGHTS.key.role,
          purpose: EXTERIOR_LIGHTS.key.purpose,
          temperatureKelvin: 4300,
          intensity: 1.55,
          castsShadow: EXTERIOR_LIGHTS.key.castsShadow,
        }}
        castShadow={EXTERIOR_LIGHTS.key.castsShadow}
      />
      <directionalLight
        ref={fillRef}
        name={EXTERIOR_LIGHTS.fill.name}
        position={EXTERIOR_LIGHTS.fill.position}
        color="#c8dcff"
        intensity={0.3}
        userData={{
          role: EXTERIOR_LIGHTS.fill.role,
          purpose: EXTERIOR_LIGHTS.fill.purpose,
          temperatureKelvin: 7200,
          intensity: 0.3,
          castsShadow: EXTERIOR_LIGHTS.fill.castsShadow,
        }}
        castShadow={EXTERIOR_LIGHTS.fill.castsShadow}
      />
      <directionalLight
        ref={rimRef}
        name={EXTERIOR_LIGHTS.rim.name}
        position={EXTERIOR_LIGHTS.rim.position}
        color="#ffe4bd"
        intensity={0.68}
        userData={{
          role: EXTERIOR_LIGHTS.rim.role,
          purpose: EXTERIOR_LIGHTS.rim.purpose,
          temperatureKelvin: 5000,
          intensity: 0.68,
          castsShadow: EXTERIOR_LIGHTS.rim.castsShadow,
        }}
        castShadow={EXTERIOR_LIGHTS.rim.castsShadow}
      />
      <hemisphereLight
        ref={hemisphereRef}
        name="Exterior · Hemisphere · Atmosphere"
        args={['#c9dcf1', '#6b7055', 0.34]}
        userData={{
          role: 'ambient hemisphere',
          purpose: 'Lifts exterior sky/ground irradiance without flattening the authored key-to-fill ratio.',
        }}
      />
      <ambientLight
        ref={ambientRef}
        name="Exterior · Ambient · Shadow lift"
        color="#c9dcf1"
        intensity={0.18}
        userData={{
          role: 'ambient shadow lift',
          purpose: 'Keeps exterior shadow-facing surfaces above black while the directional rig preserves form.',
        }}
      />
      <mesh
        ref={groundRef}
        name="Environment · Ground"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial ref={groundMaterialRef} color="#59664d" roughness={1} transparent />
      </mesh>
      <mesh ref={skyDomeRef} renderOrder={-10} material={skyMaterial}>
        <sphereGeometry args={[SKY_RADIUS, SKY_WIDTH_SEGMENTS, SKY_HEIGHT_SEGMENTS]} />
      </mesh>
      <mesh ref={sunsetDomeRef} renderOrder={-10} material={sunsetMaterial}>
        <sphereGeometry args={[SKY_RADIUS, SKY_WIDTH_SEGMENTS, SKY_HEIGHT_SEGMENTS]} />
      </mesh>
      {/* Reflection ownership is centralized in useFrame above. This prevents
          independent mount cleanups from restoring a stale/null environment
          at the S6/S7 boundary while the visible background stays separate. */}
    </>
  )
}
