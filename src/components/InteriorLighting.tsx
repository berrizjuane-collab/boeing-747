import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DataTexture,
  EquirectangularReflectionMapping,
  Object3D,
  PMREMGenerator,
  RGBAFormat,
  SpotLight,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

const CABIN_LIGHT_INTENSITY = 2.6
const CABIN_LIGHT_DISTANCE = 32

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
      data[i] = Math.round((34 + 46 * ceilingWarmth) * sideVariation)
      data[i + 1] = Math.round((24 + 34 * ceilingWarmth) * sideVariation)
      data[i + 2] = Math.round((18 + 18 * ceilingWarmth) * sideVariation)
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
  light.castShadow = true
  light.shadow.mapSize.set(1024, 1024)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = CABIN_LIGHT_DISTANCE
  light.shadow.bias = -0.0002
  light.shadow.normalBias = 0.02
}

export function InteriorLighting() {
  const { gl, scene } = useThree()
  const warmLightRef = useRef<SpotLight>(null)
  const coolLightRef = useRef<SpotLight>(null)
  const warmTarget = useMemo(() => {
    const target = new Object3D()
    target.position.set(0, 37, -103)
    return target
  }, [])
  const coolTarget = useMemo(() => {
    const target = new Object3D()
    target.position.set(0, 37, -78)
    return target
  }, [])

  useEffect(() => {
    const previousEnvironment = scene.environment
    const fillTexture = createCabinFillTexture()
    const pmrem = new PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    const environmentTarget = pmrem.fromEquirectangular(fillTexture)
    scene.environment = environmentTarget.texture

    if (warmLightRef.current) configureShadow(warmLightRef.current)
    if (coolLightRef.current) configureShadow(coolLightRef.current)

    return () => {
      scene.environment = previousEnvironment
      environmentTarget.dispose()
      fillTexture.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  useFrame(() => {
    const factor = cabinFactor(useScrollStore.getState().progress)
    if (warmLightRef.current) {
      warmLightRef.current.intensity = CABIN_LIGHT_INTENSITY * factor
      warmLightRef.current.castShadow = factor > 0.02
    }
    if (coolLightRef.current) {
      coolLightRef.current.intensity = CABIN_LIGHT_INTENSITY * 0.65 * factor
      coolLightRef.current.castShadow = factor > 0.02
    }
  })

  return (
    <group>
      <primitive object={warmTarget} />
      <primitive object={coolTarget} />
      <spotLight
        ref={warmLightRef}
        target={warmTarget}
        position={[0, 45, -104]}
        color="#ffd39a"
        intensity={0}
        distance={CABIN_LIGHT_DISTANCE}
        angle={0.72}
        penumbra={0.86}
        decay={1.5}
        castShadow
      />
      <spotLight
        ref={coolLightRef}
        target={coolTarget}
        position={[0, 44, -78]}
        color="#b8d8ff"
        intensity={0}
        distance={CABIN_LIGHT_DISTANCE}
        angle={0.68}
        penumbra={0.9}
        decay={1.5}
        castShadow
      />
    </group>
  )
}
