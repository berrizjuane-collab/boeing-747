import { interiorToWorld } from '../lib/sceneLayout'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DataTexture,
  EquirectangularReflectionMapping,
  Object3D,
  PMREMGenerator,
  PointLight,
  RGBAFormat,
  SpotLight,
  SRGBColorSpace,
  UnsignedByteType,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three'
import { SECTIONS } from '../lib/sections'
import { TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

interface CabinPointDefinition {
  name: string
  purpose: string
  temperatureKelvin: number
  color: string
  /** three.js punctual-light intensity in candela (scene units are metres). */
  intensity: number
  distance: number
  position: readonly [number, number, number]
}

interface CabinSpotDefinition extends CabinPointDefinition {
  target: readonly [number, number, number]
  angle: number
}

/**
 * Auditable A4 cabin-light inventory. Point practicals overlap down the full
 * 58 m interior instead of asking two short-range spots to cover the entire
 * aircraft. On Desktop High the nearest authored spot casts real-time
 * shadows; keeping that to one shadow map per frame preserves the quality
 * tier's draw-call budget while the practicals provide readable fill.
 */
const CABIN_POINT_LIGHTS: readonly CabinPointDefinition[] = [
  {
    name: 'Interior · Practical · Cockpit',
    purpose: 'Warm instrument and overhead lift at the nose entry.',
    temperatureKelvin: 3300,
    color: '#ffd1a3',
    intensity: 45,
    distance: 18,
    position: interiorToWorld([0, 2.05, 3.5]),
  },
  {
    name: 'Interior · Practical · Economy forward',
    purpose: 'First overlapping pool across seats, aisle and ceiling.',
    temperatureKelvin: 3600,
    color: '#ffe0bd',
    intensity: 55,
    distance: 22,
    position: interiorToWorld([0, 2.1, 13]),
  },
  {
    name: 'Interior · Practical · Economy aft',
    purpose: 'Second overlapping pool preventing the long aisle from falling to black.',
    temperatureKelvin: 3600,
    color: '#ffe0bd',
    intensity: 55,
    distance: 22,
    position: interiorToWorld([0, 2.1, 23]),
  },
  {
    name: 'Interior · Practical · Stair',
    purpose: 'Warm orientation light revealing steps, walls and landing.',
    temperatureKelvin: 3200,
    color: '#ffc78e',
    intensity: 58,
    distance: 20,
    position: interiorToWorld([-1.32, 4.3, 29]),
  },
  {
    name: 'Interior · Practical · Upper deck',
    purpose: 'Balanced pool across the upper-deck aisle and seat shells.',
    temperatureKelvin: 4100,
    color: '#ffe7cf',
    intensity: 50,
    distance: 21,
    position: interiorToWorld([0, 4.45, 37]),
  },
]

const CABIN_SPOT_LIGHTS: readonly CabinSpotDefinition[] = [
  {
    name: 'Interior · Key · Cockpit',
    purpose: 'Directional key defining the instrument panel and cockpit shell.',
    temperatureKelvin: 3000,
    color: '#ffc98f',
    intensity: 90,
    distance: 28,
    position: interiorToWorld([0, 2.1, 3]),
    target: interiorToWorld([0, 1, 1.4]),
    angle: 0.78,
  },
  {
    name: 'Interior · Key · Stair and upper deck',
    purpose: 'Directional key carrying the eye through the vertical transition.',
    temperatureKelvin: 5200,
    color: '#cde1ff',
    intensity: 80,
    distance: 30,
    position: interiorToWorld([-1.32, 4.5, 31]),
    target: interiorToWorld([-1.32, 3.9, 35]),
    angle: 0.72,
  },
]

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function cabinFactor(progress: number) {
  const entry = smoothstep(SECTIONS[3].start, SECTIONS[4].start, progress)
  // Not smoothstep(SECTIONS[4].end, SECTIONS[5].start, ...): S5 ends exactly
  // where S6 begins (sections are contiguous, both are 0.82), so that window
  // has zero width and smoothstep's own degenerate-range fallback collapses
  // it into a hard step — the cabin lights would cut instantly at 82%
  // instead of fading out, unlike the symmetric entry ramp above which spans
  // all of S4. Fading across all of S6 instead mirrors the entry ramp and
  // matches EnvironmentPlaceholder's own THRESHOLD_OUT sun fade-back-in,
  // which already uses the full S6 span for the same reason.
  const exit = 1 - smoothstep(SECTIONS[5].start, SECTIONS[5].end, progress)
  return Math.min(entry, exit)
}

/**
 * Small procedural equirectangular fill environment. It is intentionally not
 * presented as an HDRI: the interior brief calls for an irradiated, low-cost
 * fill map, while external HDRIs remain a separate asset gate.
 */
function createCabinFillTexture() {
  const width = 64
  const height = 32
  const data = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1)
    const ceilingWarmth = 1 - Math.abs(vertical - 0.2) / 0.8
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const sideVariation = 0.92 + 0.08 * Math.sin((x / width) * Math.PI * 2)
      data[i] = Math.round((90 + 110 * ceilingWarmth) * sideVariation)
      data[i + 1] = Math.round((82 + 86 * ceilingWarmth) * sideVariation)
      data[i + 2] = Math.round((74 + 62 * ceilingWarmth) * sideVariation)
      data[i + 3] = 255
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.mapping = EquirectangularReflectionMapping
  texture.needsUpdate = true
  return texture
}

function configureShadow(light: SpotLight) {
  light.castShadow = false
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = light.distance
  light.shadow.bias = -0.0002
  light.shadow.normalBias = 0.02
}

const fillCache = new WeakMap<WebGLRenderer, WebGLRenderTarget>()
export function InteriorLighting({ active }: { active: boolean }) {
  const { camera, gl, scene } = useThree()
  const pointLightRefs = useRef<Array<PointLight | null>>([])
  const spotLightRefs = useRef<Array<SpotLight | null>>([])
  const spotTargets = useMemo(
    () =>
      CABIN_SPOT_LIGHTS.map((definition) => {
        const target = new Object3D()
        target.name = `${definition.name} · Target`
        target.position.set(...definition.target)
        return target
      }),
    [],
  )

  useEffect(() => {
    if (!active) return
    const previousEnvironment = scene.environment
    let environmentTarget = fillCache.get(gl)
    if (!environmentTarget) {
    const fillTexture = createCabinFillTexture()
    const pmrem = new PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    environmentTarget = pmrem.fromEquirectangular(fillTexture)
    fillCache.set(gl, environmentTarget)
    fillTexture.dispose()
    pmrem.dispose()
    }
    scene.environment = environmentTarget.texture

    for (const light of spotLightRefs.current) {
      if (light) configureShadow(light)
    }

    return () => {
      // plan3.md bug #2: this component stays mounted across S4-S6
      // (INTERIOR_ACTIVE_INDICES in SceneCanvas.tsx), but
      // EnvironmentPlaceholder's <Environment> mounts *inside* that same
      // window — its reflectionMap is null through S4/S5, then becomes the
      // sunset HDRI at the S5/S6 boundary (hdriTheme.ts) — and legitimately
      // takes ownership of scene.environment back from this fill texture
      // without either component knowing about the other. Restoring
      // `previousEnvironment` unconditionally here (captured back at S4,
      // when it really was null) would stomp that handoff and null out a
      // live HDRI the instant S6 hands off to S7. Only restore it if nothing
      // else has taken scene.environment over since we set it.
      if (scene.environment === environmentTarget.texture) scene.environment = previousEnvironment
      // Cached with the renderer, reused on every return to the cabin.
    }
  }, [gl, scene, active])

  useFrame(() => {
    const factor = cabinFactor(useScrollStore.getState().progress)
    // §7.1's "Sombras" row: real-time interior shadows are the Desktop High
    // exclusive ("Interior en tiempo real" vs "Sólo horneadas" on the other
    // two tiers). The lights themselves still fade in/out with `factor`
    // either way — only the expensive shadow-map casting is tier-gated.
    const shadowsAllowed = TIER_SETTINGS[useQualityStore.getState().tier].interiorRealtimeShadows
    let activeShadowIndex = -1
    if (shadowsAllowed && factor > 0.02) {
      let nearestDistanceSquared = Number.POSITIVE_INFINITY
      for (let index = 0; index < spotLightRefs.current.length; index += 1) {
        const light = spotLightRefs.current[index]
        if (!light) continue
        const distanceSquared = camera.position.distanceToSquared(light.position)
        if (distanceSquared < nearestDistanceSquared) {
          nearestDistanceSquared = distanceSquared
          activeShadowIndex = index
        }
      }
    }
    for (let index = 0; index < CABIN_POINT_LIGHTS.length; index += 1) {
      const light = pointLightRefs.current[index]
      if (!light) continue
      light.intensity = CABIN_POINT_LIGHTS[index].intensity * factor
    }

    for (let index = 0; index < CABIN_SPOT_LIGHTS.length; index += 1) {
      const light = spotLightRefs.current[index]
      if (!light) continue
      light.intensity = CABIN_SPOT_LIGHTS[index].intensity * factor
      light.castShadow = index === activeShadowIndex
    }
  })

  return (
    <group>
      {spotTargets.map((target) => (
        <primitive key={target.name} object={target} />
      ))}
      {CABIN_POINT_LIGHTS.map((definition, index) => (
        <pointLight
          key={definition.name}
          ref={(light) => {
            pointLightRefs.current[index] = light
          }}
          name={definition.name}
          position={definition.position}
          color={definition.color}
          intensity={0}
          distance={definition.distance}
          decay={1.55}
          userData={{
            purpose: definition.purpose,
            temperatureKelvin: definition.temperatureKelvin,
            authoredIntensity: definition.intensity,
          }}
        />
      ))}
      {CABIN_SPOT_LIGHTS.map((definition, index) => (
        <spotLight
          key={definition.name}
          ref={(light) => {
            spotLightRefs.current[index] = light
          }}
          name={definition.name}
          target={spotTargets[index]}
          position={definition.position}
          color={definition.color}
          intensity={0}
          distance={definition.distance}
          angle={definition.angle}
          penumbra={0.86}
          decay={1.5}
          userData={{
            purpose: definition.purpose,
            temperatureKelvin: definition.temperatureKelvin,
            authoredIntensity: definition.intensity,
          }}
        />
      ))}
    </group>
  )
}
