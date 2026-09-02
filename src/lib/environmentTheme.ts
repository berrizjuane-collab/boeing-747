import { Color } from 'three'
import { SECTIONS, getActiveSectionIndex, localProgress } from './sections'

export type ExteriorLightRole = 'key' | 'fill' | 'rim'

interface LightAnchor {
  /** Correlated colour temperature used as the art-direction reference. */
  temperatureKelvin: number
  /** Explicit working colour; kept alongside CCT because dusk uses an artistic tint. */
  color: string
  /** three.js directional-light intensity at the start of this section. */
  intensity: number
}

interface HemisphereAnchor {
  skyColor: string
  groundColor: string
  intensity: number
}

interface SectionEnvironmentAnchor {
  background: string
  ground: string
  fogDensity: number
  /** Multiplies the threshold exposure curve; S5 therefore keeps its existing 0.62 value. */
  exposureCompensation: number
  /** PBR image-based-light strength; lower exterior values preserve form on white paint. */
  environmentIntensity: number
  lights: Record<ExteriorLightRole, LightAnchor>
  /** plan3.md bug #1/#4 (§1.1, §1.4): the exterior rig was three directional
   * lights and nothing else, so any surface not facing the key read as pure
   * black (the vegetation/hangar-wall bug). A hemisphere light gives every
   * exterior surface a non-zero floor without a shadow-casting light of its
   * own — sky/ground colors reuse this same section's `background`/`ground`
   * (already the section's atmosphere and terrain tint) rather than
   * inventing a second palette. */
  hemisphere: HemisphereAnchor
  /** plan3.md B2: real Nishita sun position of this section's active HDRI
   * (golden-hour/high-altitude/sunset — see SUN_ANGLES below), so
   * key/fill/rim can track it instead of sitting at one fixed position for
   * the whole page. S4/S5 have no active HDRI (hdriTheme.ts's
   * activeHdriSectionSlot returns null there) — S4 holds S3's angle (same
   * "copy the previous row" pattern sectionGrading.ts uses) and S5 holds
   * S6's, so the rig rotates smoothly across S4's span from the old sun to
   * the new one instead of holding a direction with no matching sky. */
  sunAzimuthDeg: number
  sunElevationDeg: number
}

const DEG2RAD = Math.PI / 180

function sphericalToDirection(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const azimuth = azimuthDeg * DEG2RAD
  const elevation = elevationDeg * DEG2RAD
  const horizontalRadius = Math.cos(elevation)
  return [horizontalRadius * Math.cos(azimuth), Math.sin(elevation), horizontalRadius * Math.sin(azimuth)]
}

function directionToSpherical(x: number, y: number, z: number): { azimuthDeg: number; elevationDeg: number } {
  const magnitude = Math.sqrt(x * x + y * y + z * z)
  return {
    azimuthDeg: (Math.atan2(z, x) * 180) / Math.PI,
    elevationDeg: (Math.asin(Math.max(-1, Math.min(1, y / magnitude))) * 180) / Math.PI,
  }
}

/**
 * Real Nishita sun azimuth/elevation per HDRI, in three.js's own equirect
 * convention (atan2(z,x) for azimuth, asin(y) for elevation on the unit
 * direction — see equirectUv in three's shader chunks). Measured, not
 * copied from blender/generate_hdri.py's PRESETS: found the brightest pixel
 * in each shipped `public/hdri/*.hdr`, converted its UV to a direction, and
 * confirmed the result matches that script's sun_elevation/sun_rotation
 * inputs almost exactly (max 0.06° off) — golden-hour 6.06°/70.05° vs
 * 6°/70°, high-altitude 67.94°/199.95° vs 68°/200°, sunset 2.55°/250.05° vs
 * 2.5°/250°. That match is what pins down HDRLoader's v-flip convention
 * empirically instead of assuming it.
 */
const SUN_ANGLES = {
  golden: { azimuthDeg: 70.05, elevationDeg: 6.06 },
  highAltitude: { azimuthDeg: 199.95, elevationDeg: 67.94 },
  sunset: { azimuthDeg: 250.05, elevationDeg: 2.55 },
}

/**
 * Fill/rim's artistic relationship to the key light, derived once from the
 * exact static positions this rig used before B2 ([80,100,40] /
 * [-105,48,72] / [44,76,-170]) — not re-invented. Expressed as an offset
 * from key's own angle so the whole rig can rotate with the real sun per
 * section while fill and rim keep the same relative roles (cool frontal
 * lift, rear three-quarter separation) they always had.
 */
const ORIGINAL_KEY_SPHERICAL = directionToSpherical(80, 100, 40)
const ORIGINAL_FILL_SPHERICAL = directionToSpherical(-105, 48, 72)
const ORIGINAL_RIM_SPHERICAL = directionToSpherical(44, 76, -170)
const ORIGINAL_KEY_DISTANCE = Math.hypot(80, 100, 40)
const ORIGINAL_FILL_DISTANCE = Math.hypot(-105, 48, 72)
const ORIGINAL_RIM_DISTANCE = Math.hypot(44, 76, -170)
const FILL_OFFSET = {
  azimuthDeg: ORIGINAL_FILL_SPHERICAL.azimuthDeg - ORIGINAL_KEY_SPHERICAL.azimuthDeg,
  elevationDeg: ORIGINAL_FILL_SPHERICAL.elevationDeg - ORIGINAL_KEY_SPHERICAL.elevationDeg,
}
const RIM_OFFSET = {
  azimuthDeg: ORIGINAL_RIM_SPHERICAL.azimuthDeg - ORIGINAL_KEY_SPHERICAL.azimuthDeg,
  elevationDeg: ORIGINAL_RIM_SPHERICAL.elevationDeg - ORIGINAL_KEY_SPHERICAL.elevationDeg,
}

export interface LightPositions {
  key: [number, number, number]
  fill: [number, number, number]
  rim: [number, number, number]
}

/** B2: key points straight at (sunAzimuthDeg, sunElevationDeg); fill/rim keep
 * their original offset from key, so the whole rig rotates together. */
export function computeLightPositions(sunAzimuthDeg: number, sunElevationDeg: number): LightPositions {
  const key = sphericalToDirection(sunAzimuthDeg, sunElevationDeg)
  const fill = sphericalToDirection(sunAzimuthDeg + FILL_OFFSET.azimuthDeg, sunElevationDeg + FILL_OFFSET.elevationDeg)
  const rim = sphericalToDirection(sunAzimuthDeg + RIM_OFFSET.azimuthDeg, sunElevationDeg + RIM_OFFSET.elevationDeg)
  return {
    key: [key[0] * ORIGINAL_KEY_DISTANCE, key[1] * ORIGINAL_KEY_DISTANCE, key[2] * ORIGINAL_KEY_DISTANCE],
    fill: [fill[0] * ORIGINAL_FILL_DISTANCE, fill[1] * ORIGINAL_FILL_DISTANCE, fill[2] * ORIGINAL_FILL_DISTANCE],
    rim: [rim[0] * ORIGINAL_RIM_DISTANCE, rim[1] * ORIGINAL_RIM_DISTANCE, rim[2] * ORIGINAL_RIM_DISTANCE],
  }
}

export interface ExteriorLightDefinition {
  name: string
  role: ExteriorLightRole
  purpose: string
  position: readonly [number, number, number]
  castsShadow: boolean
}

/**
 * Complete exterior-light inventory for A2. There are exactly three exterior
 * lights: a shadow-casting sun key, a cool broad fill and a rear separation
 * rim. Every light has a stable scene name and a documented role; colour
 * temperature, working colour and intensity are declared per section below.
 */
export const EXTERIOR_LIGHTS: Record<ExteriorLightRole, ExteriorLightDefinition> = {
  key: {
    name: 'Exterior · Key · Sun',
    role: 'key',
    purpose: 'Primary form; the moving runway contact shadow is an analytical one-draw projection.',
    position: [80, 100, 40],
    castsShadow: false,
  },
  fill: {
    name: 'Exterior · Fill · Sky',
    role: 'fill',
    purpose: 'Cool frontal lift that preserves detail on the aircraft shadow side.',
    position: [-105, 48, 72],
    castsShadow: false,
  },
  rim: {
    name: 'Exterior · Rim · Separation',
    role: 'rim',
    purpose: 'Rear three-quarter edge light separating the white fuselage from sky.',
    position: [44, 76, -170],
    castsShadow: false,
  },
}

/**
 * A2/A3 lighting and atmosphere anchors, ordered S1..S7. Values interpolate
 * smoothly through each section. Explicit CCT + colour + intensity entries
 * make the rendered rig auditable without reverse-engineering JSX defaults.
 */
export const SECTION_ENVIRONMENT: readonly SectionEnvironmentAnchor[] = [
  {
    background: '#9f6246',
    ground: '#59664d',
    fogDensity: 0.0015,
    exposureCompensation: 0.78,
    environmentIntensity: 0.72,
    lights: {
      key: { temperatureKelvin: 4300, color: '#ffd0a0', intensity: 1.55 },
      fill: { temperatureKelvin: 7200, color: '#c8dcff', intensity: 0.3 },
      rim: { temperatureKelvin: 5000, color: '#ffe4bd', intensity: 0.68 },
    },
    hemisphere: { skyColor: '#dcbba3', groundColor: '#7c7860', intensity: 0.72 },
    sunAzimuthDeg: SUN_ANGLES.golden.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.golden.elevationDeg,
  },
  {
    background: '#b77752',
    ground: '#526154',
    fogDensity: 0.0013,
    exposureCompensation: 0.78,
    environmentIntensity: 0.68,
    lights: {
      key: { temperatureKelvin: 4700, color: '#ffdbb3', intensity: 1.7 },
      fill: { temperatureKelvin: 7000, color: '#cfdeff', intensity: 0.29 },
      rim: { temperatureKelvin: 5200, color: '#ffe9c9', intensity: 0.78 },
    },
    hemisphere: { skyColor: '#e0c0a6', groundColor: '#77775c', intensity: 0.7 },
    sunAzimuthDeg: SUN_ANGLES.golden.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.golden.elevationDeg,
  },
  {
    background: '#719fbe',
    ground: '#46545d',
    fogDensity: 0.00055,
    exposureCompensation: 0.68,
    environmentIntensity: 0.58,
    lights: {
      key: { temperatureKelvin: 5600, color: '#fff0dc', intensity: 1.2 },
      fill: { temperatureKelvin: 7800, color: '#b9d6ff', intensity: 0.35 },
      rim: { temperatureKelvin: 6500, color: '#dbe9ff', intensity: 1 },
    },
    hemisphere: { skyColor: '#719fbe', groundColor: '#46545d', intensity: 0.45 },
    sunAzimuthDeg: SUN_ANGLES.highAltitude.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.highAltitude.elevationDeg,
  },
  {
    background: '#354b5d',
    ground: '#28343b',
    fogDensity: 0.0003,
    exposureCompensation: 1,
    environmentIntensity: 0.75,
    lights: {
      key: { temperatureKelvin: 4100, color: '#ffc38f', intensity: 0.18 },
      fill: { temperatureKelvin: 6200, color: '#dce8ff', intensity: 0.16 },
      rim: { temperatureKelvin: 5000, color: '#ffe1bc', intensity: 0.3 },
    },
    hemisphere: { skyColor: '#354b5d', groundColor: '#28343b', intensity: 0.35 },
    // No active HDRI in S4 (hdriTheme.ts's activeHdriSectionSlot returns
    // null for sectionIndex 3/4) — holds S3's angle, same "copy the
    // previous row" pattern sectionGrading.ts uses for S4's grade.
    sunAzimuthDeg: SUN_ANGLES.highAltitude.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.highAltitude.elevationDeg,
  },
  {
    background: '#171310',
    ground: '#151311',
    fogDensity: 0.00015,
    exposureCompensation: 1,
    environmentIntensity: 1,
    lights: {
      key: { temperatureKelvin: 3000, color: '#ffb46f', intensity: 0.04 },
      fill: { temperatureKelvin: 5000, color: '#e3edff', intensity: 0.06 },
      rim: { temperatureKelvin: 3800, color: '#ffc18a', intensity: 0.06 },
    },
    hemisphere: { skyColor: '#171310', groundColor: '#151311', intensity: 0.15 },
    // S5 holds S6's angle instead: the rig rotates from high-altitude to
    // sunset across S4's span (interpolating S4's anchor above toward this
    // one), then holds at sunset through S5 and into S6 itself.
    sunAzimuthDeg: SUN_ANGLES.sunset.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.sunset.elevationDeg,
  },
  {
    background: '#27344e',
    ground: '#1b2430',
    fogDensity: 0.00125,
    exposureCompensation: 1.05,
    environmentIntensity: 0.68,
    lights: {
      key: { temperatureKelvin: 3600, color: '#ffb27c', intensity: 1.05 },
      fill: { temperatureKelvin: 7600, color: '#b9d2ff', intensity: 0.24 },
      rim: { temperatureKelvin: 4200, color: '#ffc29f', intensity: 1.45 },
    },
    hemisphere: { skyColor: '#27344e', groundColor: '#1b2430', intensity: 0.3 },
    sunAzimuthDeg: SUN_ANGLES.sunset.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.sunset.elevationDeg,
  },
  {
    background: '#080a0e',
    ground: '#090b0e',
    fogDensity: 0.0018,
    exposureCompensation: 0.82,
    environmentIntensity: 0.4,
    lights: {
      key: { temperatureKelvin: 3000, color: '#ff9f63', intensity: 0.12 },
      fill: { temperatureKelvin: 7000, color: '#bfd5ff', intensity: 0.08 },
      rim: { temperatureKelvin: 3400, color: '#ffad78', intensity: 0.2 },
    },
    hemisphere: { skyColor: '#080a0e', groundColor: '#090b0e', intensity: 0.15 },
    // activeHdriSectionSlot(6) is still 'sunset' (sectionIndex >= 5).
    sunAzimuthDeg: SUN_ANGLES.sunset.azimuthDeg,
    sunElevationDeg: SUN_ANGLES.sunset.elevationDeg,
  },
]

export interface SampledEnvironmentTheme {
  background: Color
  ground: Color
  fogDensity: number
  exposureCompensation: number
  environmentIntensity: number
  lights: Record<ExteriorLightRole, { color: Color; temperatureKelvin: number; intensity: number }>
  hemisphere: { skyColor: Color; groundColor: Color; intensity: number }
  lightPositions: LightPositions
}

const sampledTheme: SampledEnvironmentTheme = {
  background: new Color(),
  ground: new Color(),
  fogDensity: 0,
  exposureCompensation: 1,
  environmentIntensity: 1,
  hemisphere: { skyColor: new Color(), groundColor: new Color(), intensity: 0 },
  lightPositions: { key: [0, 0, 0], fill: [0, 0, 0], rim: [0, 0, 0] },
  lights: {
    key: { color: new Color(), temperatureKelvin: 0, intensity: 0 },
    fill: { color: new Color(), temperatureKelvin: 0, intensity: 0 },
    rim: { color: new Color(), temperatureKelvin: 0, intensity: 0 },
  },
}

const colorScratch = new Color()

const smoothstep01 = (value: number) => {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Samples all exterior atmosphere and lighting values without allocating per frame. */
export function sampleEnvironmentTheme(progress: number): SampledEnvironmentTheme {
  const index = getActiveSectionIndex(progress)
  const from = SECTION_ENVIRONMENT[index]
  const to = SECTION_ENVIRONMENT[Math.min(index + 1, SECTION_ENVIRONMENT.length - 1)]
  const t = smoothstep01(localProgress(progress, SECTIONS[index]))

  sampledTheme.background.set(from.background).lerp(colorScratch.set(to.background), t)
  sampledTheme.ground.set(from.ground).lerp(colorScratch.set(to.ground), t)
  sampledTheme.fogDensity = lerp(from.fogDensity, to.fogDensity, t)
  sampledTheme.exposureCompensation = lerp(from.exposureCompensation, to.exposureCompensation, t)
  sampledTheme.environmentIntensity = lerp(from.environmentIntensity, to.environmentIntensity, t)

  for (const role of ['key', 'fill', 'rim'] as const) {
    const fromLight = from.lights[role]
    const toLight = to.lights[role]
    const sampledLight = sampledTheme.lights[role]
    sampledLight.color.set(fromLight.color).lerp(colorScratch.set(toLight.color), t)
    sampledLight.temperatureKelvin = Math.round(lerp(fromLight.temperatureKelvin, toLight.temperatureKelvin, t))
    sampledLight.intensity = lerp(fromLight.intensity, toLight.intensity, t)
  }

  sampledTheme.hemisphere.skyColor.set(from.hemisphere.skyColor).lerp(colorScratch.set(to.hemisphere.skyColor), t)
  sampledTheme.hemisphere.groundColor.set(from.hemisphere.groundColor).lerp(colorScratch.set(to.hemisphere.groundColor), t)
  sampledTheme.hemisphere.intensity = lerp(from.hemisphere.intensity, to.hemisphere.intensity, t)

  const sunAzimuthDeg = lerp(from.sunAzimuthDeg, to.sunAzimuthDeg, t)
  const sunElevationDeg = lerp(from.sunElevationDeg, to.sunElevationDeg, t)
  const positions = computeLightPositions(sunAzimuthDeg, sunElevationDeg)
  sampledTheme.lightPositions.key[0] = positions.key[0]
  sampledTheme.lightPositions.key[1] = positions.key[1]
  sampledTheme.lightPositions.key[2] = positions.key[2]
  sampledTheme.lightPositions.fill[0] = positions.fill[0]
  sampledTheme.lightPositions.fill[1] = positions.fill[1]
  sampledTheme.lightPositions.fill[2] = positions.fill[2]
  sampledTheme.lightPositions.rim[0] = positions.rim[0]
  sampledTheme.lightPositions.rim[1] = positions.rim[1]
  sampledTheme.lightPositions.rim[2] = positions.rim[2]

  return sampledTheme
}

/** Compatibility helper for callers that only need the atmospheric colour. */
export function sampleEnvironmentColor(progress: number): Color {
  return sampleEnvironmentTheme(progress).background
}
