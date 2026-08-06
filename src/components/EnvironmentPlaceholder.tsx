import { Environment } from '@react-three/drei'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color, DirectionalLight, EquirectangularReflectionMapping, FogExp2, Mesh, MeshBasicMaterial } from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { sampleEnvironmentColor } from '../lib/environmentTheme'
import { activeHdriSectionSlot, goldenHourWeight, highAltitudeWeight, sunsetWeight } from '../lib/hdriTheme'
import { duskColorMix, exposureMultiplier, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { SECTIONS } from '../lib/sections'
import { createSkyDomeMaterial } from '../lib/skyDomeMaterial'
import { loadingState } from '../state/loadingState'
import { useScrollStore } from '../state/scrollStore'

// PLAN.md §10.4: the scene reveals like a photo, exposure ramping 0 -> target
// over ~1.2s once loading finishes, instead of popping in the instant each
// asset's own Suspense boundary happens to resolve (exterior.glb and the
// HDRIs are *separate* Suspense boundaries — see SceneCanvas.tsx — so
// without this they could visibly pop in at different moments).
const LOAD_REVEAL_DURATION = 1.2
const clamp01Reveal = (x: number) => Math.min(1, Math.max(0, x))

const SUN_INTENSITY = 2
const SHADOW_SECTION_END = SECTIONS[1].end + 0.04
const SUN_COLOR_DAY = new Color('#ffd6ad')
// PLAN.md §10.1 S6 key/acento, used verbatim — the point is the returning
// sun reads as a *different*, cooler-accented light, not a re-tinted S1 sun.
const SUN_COLOR_DUSK = new Color('#e89b6c')
const sunColorScratch = new Color()

// Comfortably inside the camera's far=3000 (SceneCanvas.tsx) and comfortably
// outside every keyframe/anchor in the scene (aircraft span ~80m, camera
// never strays far past S1's ~80m stand-off) — just a big sky, not a prop
// anything is meant to get close to.
const SKY_RADIUS = 1200

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
  const { scene, gl } = useThree()
  const colorRef = useRef(new Color('#c9895b'))
  const sunRef = useRef<DirectionalLight>(null)
  const skyDomeRef = useRef<Mesh>(null)
  const sunsetDomeRef = useRef<Mesh>(null)

  // §6.4: the golden-hour HDRI is a *blocking* S0 asset, same tier as
  // exterior.glb — loading it through useLoader (Suspense) registers it with
  // the same THREE.DefaultLoadingManager useProgress reads, so it correctly
  // counts toward the S0 load gate once that's built (Fase 6), not just a
  // convenient way to fetch it. Sunset joins the same blocking call for
  // simplicity — it's a similarly small file (~1.2MB, see public/hdri/) and
  // splitting it into its own lazily-loaded Suspense boundary would be new
  // architecture for a budget that's nowhere close to being a problem: all
  // three HDRIs together are still well under §6.4's 15MB S0 ceiling.
  const [goldenHourMap, highAltitudeMap, sunsetMap] = useLoader(RGBELoader, [
    '/hdri/golden-hour.hdr',
    '/hdri/high-altitude.hdr',
    '/hdri/sunset.hdr',
  ])
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
    goldenHourMap.mapping = EquirectangularReflectionMapping
    highAltitudeMap.mapping = EquirectangularReflectionMapping
    sunsetMap.mapping = EquirectangularReflectionMapping
  }, [goldenHourMap, highAltitudeMap, sunsetMap])

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(colorRef.current.getHex(), 0.0035)
  }, [scene])

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    colorRef.current.copy(sampleEnvironmentColor(progress))
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(colorRef.current)
    }

    const revealStart = loadingState.revealStartSeconds
    const loadReveal = revealStart === null ? 0 : clamp01Reveal((performance.now() / 1000 - revealStart) / LOAD_REVEAL_DURATION)
    gl.toneMappingExposure = exposureMultiplier(progress) * loadReveal
    const sunFactor = sunIntensityMultiplier(progress)
    if (sunRef.current) {
      sunRef.current.intensity = SUN_INTENSITY * sunFactor
      // Shadow maps are useful for S1-S2's runway cue and needlessly expensive
      // once the aircraft has left the runway.
      sunRef.current.castShadow = progress < SHADOW_SECTION_END
      // See duskColorMix's doc comment: the returning S6 sun is a cooler,
      // dimmer-reading accent color, not literally the S1 golden-hour hue.
      sunColorScratch.copy(SUN_COLOR_DAY).lerp(SUN_COLOR_DUSK, duskColorMix(progress))
      sunRef.current.color.copy(sunColorScratch)
    }

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

  const activeIndex = useScrollStore((s) => s.activeIndex)
  const hdriSlot = activeHdriSectionSlot(activeIndex)
  const reflectionMap =
    hdriSlot === 'golden' ? goldenHourMap : hdriSlot === 'high-altitude' ? highAltitudeMap : hdriSlot === 'sunset' ? sunsetMap : null

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3a3a', 1.2]} />
      {/*
        Shadow config as JSX props, not imperative sunRef.current.shadow.* in
        a useEffect (how a previous session had it): THREE.WebGLShadowMap
        lazily creates the light's shadow map render target at whatever
        shadow.mapSize is the *first* time this light actually needs to cast
        a frame, which can happen before a useEffect on the ref runs.
        Confirmed empirically (readRenderTargetPixels against a clean
        production build, not just the dev server) — setting mapSize to
        2048x2048 imperatively left the real render target stuck at the
        default 512x512 forever after, with every shadow map texel reading
        pure white (no caster ever recorded), while `sun.shadow.mapSize`
        itself correctly reported 2048x2048 — every property *looked*
        configured right, and nothing rendered. Static JSX props are applied
        during React's commit phase, strictly before R3F's first gl.render()
        call, so the render target is created at the right size from frame
        one. Same reasoning extends to the camera-* bounds: as imperative
        mutation they'd need an explicit updateProjectionMatrix() call too
        (OrthographicCamera doesn't recompute it on property assignment) —
        moot here since R3F's own prop-setter calls that for camera-typed
        targets, but noted because it's the same class of bug either way.
      */}
      <directionalLight
        ref={sunRef}
        position={[80, 100, 40]}
        color="#ffd6ad"
        intensity={SUN_INTENSITY}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1}
        shadow-camera-far={500}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#3c4a3a" roughness={1} />
      </mesh>
      <mesh ref={skyDomeRef} renderOrder={-10} material={skyMaterial}>
        <sphereGeometry args={[SKY_RADIUS, 32, 32]} />
      </mesh>
      <mesh ref={sunsetDomeRef} renderOrder={-10} material={sunsetMaterial}>
        <sphereGeometry args={[SKY_RADIUS, 32, 32]} />
      </mesh>
      {/* Reflection-only: background stays the sky dome above, this just feeds
          scene.environment for PBR IBL on standard materials (the ground/runway). */}
      {reflectionMap && <Environment map={reflectionMap} background={false} />}
    </>
  )
}
