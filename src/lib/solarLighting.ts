import { Vector3 } from 'three'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const LIGHT_DISTANCE = 200

export type HdriSolarSource = 'golden' | 'golden→high-altitude' | 'high-altitude' | 'high-altitude→sunset' | 'sunset'

export const HDRI_SUN_PRESETS = {
  golden: { azimuthDeg: 70, elevationDeg: 6 },
  'high-altitude': { azimuthDeg: 200, elevationDeg: 68 },
  sunset: { azimuthDeg: 250, elevationDeg: 2.5 },
} as const

export interface SampledSolarRig {
  source: HdriSolarSource
  sunDirection: Vector3
  keyPosition: Vector3
  fillPosition: Vector3
  rimPosition: Vector3
  sunAzimuthDeg: number
  sunElevationDeg: number
  keyAzimuthDeg: number
  keyElevationDeg: number
  keyAngularErrorDeg: number
}

function vectorFromAngles(azimuthDeg: number, elevationDeg: number, target: Vector3, radius = 1) {
  const azimuth = azimuthDeg * DEG_TO_RAD
  const elevation = elevationDeg * DEG_TO_RAD
  const horizontal = Math.cos(elevation) * radius
  return target.set(horizontal * Math.cos(azimuth), Math.sin(elevation) * radius, -horizontal * Math.sin(azimuth))
}

interface SolarAngles {
  azimuthDeg: number
  elevationDeg: number
}

function anglesFromVector(vector: Vector3, target: SolarAngles) {
  const inverseLength = vector.lengthSq() > 0 ? 1 / vector.length() : 0
  const x = inverseLength > 0 ? vector.x * inverseLength : 1
  const y = inverseLength > 0 ? vector.y * inverseLength : 0
  const z = inverseLength > 0 ? vector.z * inverseLength : 0
  target.azimuthDeg = (Math.atan2(-z, x) * RAD_TO_DEG + 360) % 360
  target.elevationDeg = Math.asin(Math.min(1, Math.max(-1, y))) * RAD_TO_DEG
  return target
}

export function angularDistanceDeg(a: Vector3, b: Vector3) {
  const denominator = Math.sqrt(a.lengthSq() * b.lengthSq())
  if (denominator === 0) return 180
  return Math.acos(Math.min(1, Math.max(-1, a.dot(b) / denominator))) * RAD_TO_DEG
}

const goldenDirection = vectorFromAngles(
  HDRI_SUN_PRESETS.golden.azimuthDeg,
  HDRI_SUN_PRESETS.golden.elevationDeg,
  new Vector3(),
)
const highDirection = vectorFromAngles(
  HDRI_SUN_PRESETS['high-altitude'].azimuthDeg,
  HDRI_SUN_PRESETS['high-altitude'].elevationDeg,
  new Vector3(),
)
const sunsetDirection = vectorFromAngles(
  HDRI_SUN_PRESETS.sunset.azimuthDeg,
  HDRI_SUN_PRESETS.sunset.elevationDeg,
  new Vector3(),
)

const sampledRig: SampledSolarRig = {
  source: 'golden',
  sunDirection: new Vector3(),
  keyPosition: new Vector3(),
  fillPosition: new Vector3(),
  rimPosition: new Vector3(),
  sunAzimuthDeg: 0,
  sunElevationDeg: 0,
  keyAzimuthDeg: 0,
  keyElevationDeg: 0,
  keyAngularErrorDeg: 0,
}
const keyDirectionScratch = new Vector3()
const sunAnglesScratch: SolarAngles = { azimuthDeg: 0, elevationDeg: 0 }
const keyAnglesScratch: SolarAngles = { azimuthDeg: 0, elevationDeg: 0 }

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function sampleSunDirection(progress: number, target: Vector3) {
  if (progress < 0.26) {
    sampledRig.source = 'golden'
    return target.copy(goldenDirection)
  }
  if (progress < 0.3) {
    sampledRig.source = 'golden→high-altitude'
    return target.copy(goldenDirection).lerp(highDirection, smoothstep(0.26, 0.3, progress)).normalize()
  }
  if (progress < 0.8) {
    sampledRig.source = 'high-altitude'
    return target.copy(highDirection)
  }
  if (progress < 0.84) {
    sampledRig.source = 'high-altitude→sunset'
    return target.copy(highDirection).lerp(sunsetDirection, smoothstep(0.8, 0.84, progress)).normalize()
  }
  sampledRig.source = 'sunset'
  return target.copy(sunsetDirection)
}

/** Samples a light rig whose key is exactly co-located with the authored HDRI sun. */
export function sampleSolarRig(progress: number): SampledSolarRig {
  sampleSunDirection(progress, sampledRig.sunDirection)
  sampledRig.keyPosition.copy(sampledRig.sunDirection).multiplyScalar(LIGHT_DISTANCE)
  const sunAngles = anglesFromVector(sampledRig.sunDirection, sunAnglesScratch)
  sampledRig.sunAzimuthDeg = sunAngles.azimuthDeg
  sampledRig.sunElevationDeg = sunAngles.elevationDeg

  // Fill and rim are derived offsets, never independent hand-authored worlds.
  vectorFromAngles(
    sunAngles.azimuthDeg + 140,
    Math.max(18, sunAngles.elevationDeg * 0.35),
    sampledRig.fillPosition,
    LIGHT_DISTANCE,
  )
  vectorFromAngles(
    sunAngles.azimuthDeg - 115,
    Math.max(12, sunAngles.elevationDeg * 0.7),
    sampledRig.rimPosition,
    LIGHT_DISTANCE,
  )

  keyDirectionScratch.copy(sampledRig.keyPosition).normalize()
  const keyAngles = anglesFromVector(keyDirectionScratch, keyAnglesScratch)
  sampledRig.keyAzimuthDeg = keyAngles.azimuthDeg
  sampledRig.keyElevationDeg = keyAngles.elevationDeg
  sampledRig.keyAngularErrorDeg = angularDistanceDeg(sampledRig.sunDirection, keyDirectionScratch)
  return sampledRig
}
