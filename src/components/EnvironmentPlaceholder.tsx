import { Environment } from '@react-three/drei'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXTERIOR_LIGHTS, sampleEnvironmentTheme } from '../lib/environmentTheme'
import { activeHdriSectionSlot, goldenHourWeight, highAltitudeWeight, sunsetWeight } from '../lib/hdriTheme'
import { createTerrainSurfaceMaps } from '../lib/terrainSurfaceMaps'
import { duskColorMix, exposureMultiplier } from '../lib/thresholdLighting'
import { createSkyDomeMaterial } from '../lib/skyDomeMaterial'
import { exposureState } from '../state/exposureState'
import { loadingState } from '../state/loadingState'
import { useScrollStore } from '../state/scrollStore'

// PLAN.md §10.4: the scene reveals like a photo, exposure ramping 0 -> target
// over ~1.2s once loading finishes, instead of popping in the instant each
// asset's own Suspense boundary happens to resolve (exterior.glb and the
// HDRIs are *separate* Suspense boundaries — see SceneCanvas.tsx — so
// without this they could visibly pop in at different moments).
const LOAD_REVEAL_DURATION = 1.2
const clamp01Reveal = (x: number) => Math.min(1, Math.max(0, x))

// Fase E piece 1 (plan3.md §4): half-extent of the camera-following terrain
// disc, generous enough that its true geometric edge sits well past
// TERRAIN_FADE_END below at every fog density in SECTION_ENVIRONMENT
// (lowest is S5's 0.00015, irrelevant here since S5 never shows exterior
// ground — the binding case is S3's 0.00055, still >90% transmittance-faded
// by TERRAIN_FADE_END). Cost is one plane at 1 segment either way (2
// triangles), so generous has no budget cost.
const TERRAIN_DISC_SIZE = 8000
const TERRAIN_FADE_START = 1400
const TERRAIN_FADE_END = 3200
// World units per repeat of the 256px procedural tile (terrainSurfaceMaps.ts)
// — big enough to read as ground-scale patches next to the 32-unit runway
// and 73-unit aircraft, not a visibly repeating grid.
const TERRAIN_TILE_SIZE = 130

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
// plan3.md B6/§1.5 (cause 3): fog used to lerp straight from S6's own cool
// background (`#27344e`) toward S7's near-black (`#080a0e`) — distant
// geometry went dark, not warm, in the one section PLAN.md §10.1 stages as
// a sunset. `#E89B6C` is that section's own declared grading accent, not an
// invented color (sectionGrading.ts's SECTION_GRADES[5].key). Mixed in by
// duskColorMix — the same "ramps across S6, holds through S7" curve
// EnvironmentPlaceholder already uses to fade the key light's color toward
// this identical accent as it brightens back up, so fog and key warm on the
// same schedule instead of two independent, potentially-mismatched ramps.
const WARM_FOG_COLOR = new Color('#E89B6C')

export function EnvironmentPlaceholder() {
  const { scene } = useThree()
  const colorRef = useRef(new Color('#9f6246'))
  const fogColorRef = useRef(new Color('#9f6246'))
  const keyRef = useRef<DirectionalLight>(null)
  const fillRef = useRef<DirectionalLight>(null)
  const rimRef = useRef<DirectionalLight>(null)
  const hemisphereRef = useRef<HemisphereLight>(null)
  const groundRef = useRef<Mesh>(null)
  const skyDomeRef = useRef<Mesh>(null)
  const sunsetDomeRef = useRef<Mesh>(null)

  // Fase E piece 1 / C3: procedural color+roughness detail for the terrain
  // disc below, and the ShaderMaterial that samples it in world-space UV
  // (so the texture doesn't slide as the disc re-centers on the camera —
  // see the disc's own comment) while dissolving to fog color by radius (so
  // its true geometric edge, however large, is never the thing that's
  // actually visible). Built once via useMemo, same pattern as
  // skyMaterial/sunsetMaterial just above.
  const terrainMaps = useMemo(() => createTerrainSurfaceMaps(), [])
  const groundMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#59664d', roughness: 0.92, fog: true })
    material.onBeforeCompile = (shader) => {
      shader.uniforms.terrainAlbedoMap = { value: terrainMaps.albedo }
      shader.uniforms.terrainRoughnessMap = { value: terrainMaps.roughness }
      shader.uniforms.terrainTileSize = { value: TERRAIN_TILE_SIZE }
      shader.uniforms.terrainFadeStart = { value: TERRAIN_FADE_START }
      shader.uniforms.terrainFadeEnd = { value: TERRAIN_FADE_END }

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vTerrainWorldXZ;\nvarying float vTerrainRadius;',
        )
        .replace(
          '#include <begin_vertex>',
          // Local-space position IS the offset from the camera in world XZ,
          // because the disc's own position is re-set to the camera's XZ
          // every frame (see the useFrame below) — so a plain local radius
          // is a free, always-correct distance-from-camera, no extra
          // uniform needed. World-space UV instead needs the actual
          // modelMatrix transform, since it has to stay fixed on the
          // ground while the mesh itself keeps re-centering under it.
          '#include <begin_vertex>\n{\n  vec4 terrainWorldPos = modelMatrix * vec4(position, 1.0);\n  vTerrainWorldXZ = terrainWorldPos.xz;\n  vTerrainRadius = length(position.xy);\n}',
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec2 vTerrainWorldXZ;\nvarying float vTerrainRadius;\nuniform sampler2D terrainAlbedoMap;\nuniform sampler2D terrainRoughnessMap;\nuniform float terrainTileSize;\nuniform float terrainFadeStart;\nuniform float terrainFadeEnd;',
        )
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\n  diffuseColor.rgb *= texture2D(terrainAlbedoMap, vTerrainWorldXZ / terrainTileSize).rgb;',
        )
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\n  roughnessFactor *= texture2D(terrainRoughnessMap, vTerrainWorldXZ / terrainTileSize).r;',
        )
        .replace(
          '#include <fog_fragment>',
          // Fase E §1.8/piece 1: the disc's own edge dissolves into
          // scene.fog's color by radius, same uniform the stock fog chunk
          // right below already uses — both fades push toward the same
          // target color, so they reinforce instead of fighting each other
          // even in the low-fog-density sections (S3/S4) where distance fog
          // alone left a visible straight edge (§1.8's measured 37%
          // transmittance at the old plane's boundary).
          '#ifdef USE_FOG\n  float terrainEdgeFactor = smoothstep(terrainFadeStart, terrainFadeEnd, vTerrainRadius);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, terrainEdgeFactor);\n#endif\n#include <fog_fragment>',
        )
    }
    return material
  }, [terrainMaps])

  useEffect(() => () => {
    terrainMaps.albedo.dispose()
    terrainMaps.roughness.dispose()
    groundMaterial.dispose()
  }, [terrainMaps, groundMaterial])

  // §6.4: the golden-hour HDRI is a *blocking* S0 asset, same tier as
  // exterior.glb — loading it through useLoader (Suspense) registers it with
  // the same THREE.DefaultLoadingManager useProgress reads, so it correctly
  // counts toward the S0 load gate once that's built (Fase 6), not just a
  // convenient way to fetch it. Sunset joins the same blocking call for
  // simplicity — it's a similarly small file (~1.2MB, see public/hdri/) and
  // splitting it into its own lazily-loaded Suspense boundary would be new
  // architecture for a budget that's nowhere close to being a problem: all
  // three HDRIs together are still well under §6.4's 15MB S0 ceiling.
  // import.meta.env.BASE_URL, not bare '/hdri/...': see vite.config.ts's `base` comment.
  const [goldenHourMap, highAltitudeMap, sunsetMap] = useLoader(RGBELoader, [
    `${import.meta.env.BASE_URL}hdri/golden-hour.hdr`,
    `${import.meta.env.BASE_URL}hdri/high-altitude.hdr`,
    `${import.meta.env.BASE_URL}hdri/sunset.hdr`,
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
    // plan3.md B5/§1.5: RGBELoader's default minFilter (LinearFilter, no
    // mipmaps) shimmers on the sky dome as the camera moves — each frame
    // samples the full-resolution texture with no pre-filtering for how
    // much screen area a texel actually covers. Mipmaps fix that the same
    // way they do for any minified texture; generateMipmaps needs a p-o-t
    // size, which both HDRI resolutions in this project (2048x1024,
    // 4096x2048 after B4) already are.
    for (const map of [goldenHourMap, highAltitudeMap, sunsetMap]) {
      map.mapping = EquirectangularReflectionMapping
      map.generateMipmaps = true
      map.minFilter = LinearMipmapLinearFilter
      map.needsUpdate = true
    }
  }, [goldenHourMap, highAltitudeMap, sunsetMap])

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(colorRef.current.getHex(), 0.0015)
  }, [scene])

  useFrame(({ camera }) => {
    const { progress } = useScrollStore.getState()
    const theme = sampleEnvironmentTheme(progress)
    colorRef.current.copy(theme.background)
    if (scene.fog instanceof FogExp2) {
      fogColorRef.current.copy(colorRef.current).lerp(WARM_FOG_COLOR, duskColorMix(progress))
      scene.fog.color.copy(fogColorRef.current)
      scene.fog.density = theme.fogDensity
    }
    scene.environmentIntensity = theme.environmentIntensity
    // E1/E6: the section ground tint still drives the base color the
    // procedural detail multiplies against, so S5/S7's near-black `ground`
    // still reads as near-black (E6) even once the disc below has visible
    // patch variation. No more fade/hide here — E1 removed the 30.5% cutoff
    // this used to implement; the disc instead dissolves into fog by its
    // own radius (see groundMaterial's onBeforeCompile above).
    groundMaterial.color.copy(theme.ground)
    if (groundRef.current) {
      // Fase E piece 1: re-centers on the camera every frame so a disc of
      // fixed, generous size never needs to be as large as the world the
      // camera can reach — see TERRAIN_DISC_SIZE's comment.
      groundRef.current.position.x = camera.position.x
      groundRef.current.position.z = camera.position.z
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
    exposureState.value = exposureMultiplier(progress) * theme.exposureCompensation * loadReveal

    const lightRefs = { key: keyRef.current, fill: fillRef.current, rim: rimRef.current }
    for (const role of ['key', 'fill', 'rim'] as const) {
      const light = lightRefs[role]
      if (!light) continue
      const sample = theme.lights[role]
      light.color.copy(sample.color)
      light.intensity = sample.intensity
      light.visible = sample.intensity > 0.01
      // B2: position, not just color/intensity, now tracks this section's
      // real HDRI sun (environmentTheme.ts's computeLightPositions) instead
      // of sitting at one fixed spot for the whole page.
      light.position.fromArray(theme.lightPositions[role])
      // Runtime metadata mirrors the declared inventory and makes the light
      // rig inspectable in Three devtools / QA without parsing source text.
      light.userData.temperatureKelvin = sample.temperatureKelvin
      light.userData.intensity = sample.intensity
    }

    // B1 (plan3.md §1.1/§1.4): every exterior surface facing away from the
    // key used to read as pure black — three directional lights and nothing
    // else. A hemisphere light gives every surface a non-zero floor without
    // casting its own shadow; sky/ground reuse this section's own
    // background/ground tint rather than a separate invented palette.
    if (hemisphereRef.current) {
      hemisphereRef.current.color.copy(theme.hemisphere.skyColor)
      hemisphereRef.current.groundColor.copy(theme.hemisphere.groundColor)
      hemisphereRef.current.intensity = theme.hemisphere.intensity
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
      <hemisphereLight ref={hemisphereRef} name="Exterior · Hemisphere · Sky/ground fill" intensity={0.4} />
      {/* Fase E piece 1 (plan3.md §4/§1.8): camera-following terrain disc,
          replacing the world-fixed 4000x4000 plane whose straight edge used
          to be exposed by S3's own thin fog (§1.8's 37%-transmittance
          measurement). One draw call, 2 triangles either way — re-centering
          on the camera every frame (see the useFrame above) means a modest
          fixed size can stand in for an arbitrarily large world instead of
          needing to actually be one. */}
      <mesh
        ref={groundRef}
        name="Environment · Terrain disc"
        rotation={[-Math.PI / 2, 0, 0]}
        material={groundMaterial}
        receiveShadow
      >
        <planeGeometry args={[TERRAIN_DISC_SIZE, TERRAIN_DISC_SIZE]} />
      </mesh>
      {/* B5: 32x32 facets a 2048x1024-texel equirect UV over huge triangles,
          visible as gradient banding and a faceted sun disc; >=96x48 is the
          plan's own floor. 128x64 costs 16,384 triangles per dome (2 domes,
          neither ever both visible at once per hdriTheme.ts's crossfade
          weights) against a triangle budget with headroom in the hundreds
          of thousands (PLAN.md §7.1) — reads as smooth without spending
          more than that gets back in banding removed. */}
      <mesh ref={skyDomeRef} renderOrder={-10} material={skyMaterial}>
        <sphereGeometry args={[SKY_RADIUS, 128, 64]} />
      </mesh>
      <mesh ref={sunsetDomeRef} renderOrder={-10} material={sunsetMaterial}>
        <sphereGeometry args={[SKY_RADIUS, 128, 64]} />
      </mesh>
      {/* Reflection-only: background stays the sky dome above, this just feeds
          scene.environment for PBR IBL on standard materials (the ground/runway). */}
      {reflectionMap && <Environment map={reflectionMap} background={false} />}
    </>
  )
}
