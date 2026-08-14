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

interface SectionEnvironmentAnchor {
  background: string
  ground: string
  /** Distance haze is authored independently from the clear-sky background. */
  fogColor: string
  fogDensity: number
  hemisphereSky: string
  hemisphereGround: string
  hemisphereIntensity: number
  /** Isotropic shadow lift; kept low and section-authored so S5/S7 remain dark. */
  ambientIntensity: number
  /** Multiplies the threshold exposure curve; S5 therefore keeps its existing 0.62 value. */
  exposureCompensation: number
  /** PBR image-based-light strength; lower exterior values preserve form on white paint. */
  environmentIntensity: number
  lights: Record<ExteriorLightRole, LightAnchor>
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
    position: [68.029, 20.906, -186.909],
    castsShadow: false,
  },
  fill: {
    name: 'Exterior · Fill · Sky',
    role: 'fill',
    purpose: 'Cool frontal lift that preserves detail on the aircraft shadow side.',
    position: [-164.696, 61.803, 95.106],
    castsShadow: false,
  },
  rim: {
    name: 'Exterior · Rim · Separation',
    role: 'rim',
    purpose: 'Rear three-quarter edge light separating the white fuselage from sky.',
    position: [138.37, 41.582, 138.37],
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
    fogColor: '#ad765e',
    fogDensity: 0.0015,
    hemisphereSky: '#c9dcf1',
    hemisphereGround: '#6b7055',
    hemisphereIntensity: 0.34,
    ambientIntensity: 0.18,
    exposureCompensation: 0.82,
    environmentIntensity: 0.72,
    lights: {
      key: { temperatureKelvin: 4300, color: '#ffd0a0', intensity: 1.55 },
      fill: { temperatureKelvin: 7200, color: '#c8dcff', intensity: 0.3 },
      rim: { temperatureKelvin: 5000, color: '#ffe4bd', intensity: 0.68 },
    },
  },
  {
    background: '#b77752',
    ground: '#526154',
    fogColor: '#b98565',
    fogDensity: 0.0013,
    hemisphereSky: '#d3e3f5',
    hemisphereGround: '#626c57',
    hemisphereIntensity: 0.38,
    ambientIntensity: 0.2,
    exposureCompensation: 0.82,
    environmentIntensity: 0.68,
    lights: {
      key: { temperatureKelvin: 4700, color: '#ffdbb3', intensity: 1.7 },
      fill: { temperatureKelvin: 7000, color: '#cfdeff', intensity: 0.29 },
      rim: { temperatureKelvin: 5200, color: '#ffe9c9', intensity: 0.78 },
    },
  },
  {
    background: '#719fbe',
    ground: '#46545d',
    fogColor: '#89b4cf',
    fogDensity: 0.00055,
    hemisphereSky: '#b8d8ef',
    hemisphereGround: '#536a78',
    hemisphereIntensity: 0.42,
    ambientIntensity: 0.09,
    exposureCompensation: 0.68,
    environmentIntensity: 0.58,
    lights: {
      key: { temperatureKelvin: 5600, color: '#fff0dc', intensity: 1.2 },
      fill: { temperatureKelvin: 7800, color: '#b9d6ff', intensity: 0.35 },
      rim: { temperatureKelvin: 6500, color: '#dbe9ff', intensity: 1 },
    },
  },
  {
    background: '#354b5d',
    ground: '#28343b',
    fogColor: '#42586a',
    fogDensity: 0.0003,
    hemisphereSky: '#a9c5dc',
    hemisphereGround: '#394853',
    hemisphereIntensity: 0.16,
    ambientIntensity: 0.03,
    exposureCompensation: 1,
    environmentIntensity: 0.75,
    lights: {
      key: { temperatureKelvin: 4100, color: '#ffc38f', intensity: 0.18 },
      fill: { temperatureKelvin: 6200, color: '#dce8ff', intensity: 0.16 },
      rim: { temperatureKelvin: 5000, color: '#ffe1bc', intensity: 0.3 },
    },
  },
  {
    background: '#171310',
    ground: '#151311',
    fogColor: '#211a16',
    fogDensity: 0.00015,
    hemisphereSky: '#776d66',
    hemisphereGround: '#2d2925',
    hemisphereIntensity: 0.04,
    ambientIntensity: 0.008,
    exposureCompensation: 1,
    environmentIntensity: 1,
    lights: {
      key: { temperatureKelvin: 3000, color: '#ffb46f', intensity: 0.04 },
      fill: { temperatureKelvin: 5000, color: '#e3edff', intensity: 0.06 },
      rim: { temperatureKelvin: 3800, color: '#ffc18a', intensity: 0.06 },
    },
  },
  {
    background: '#27344e',
    ground: '#1b2430',
    fogColor: '#8b5f57',
    fogDensity: 0.00125,
    hemisphereSky: '#d89979',
    hemisphereGround: '#424a5c',
    hemisphereIntensity: 0.32,
    ambientIntensity: 0.08,
    exposureCompensation: 1.45,
    environmentIntensity: 0.58,
    lights: {
      key: { temperatureKelvin: 3600, color: '#ffb27c', intensity: 1.25 },
      fill: { temperatureKelvin: 7600, color: '#b9d2ff', intensity: 0.32 },
      rim: { temperatureKelvin: 4200, color: '#ffc29f', intensity: 0.72 },
    },
  },
  {
    background: '#080a0e',
    ground: '#090b0e',
    fogColor: '#5a3f45',
    fogDensity: 0.0018,
    hemisphereSky: '#8f6b68',
    hemisphereGround: '#252733',
    hemisphereIntensity: 0.12,
    ambientIntensity: 0.025,
    exposureCompensation: 1.05,
    environmentIntensity: 0.42,
    lights: {
      key: { temperatureKelvin: 3000, color: '#ff9f63', intensity: 0.12 },
      fill: { temperatureKelvin: 7000, color: '#bfd5ff', intensity: 0.08 },
      rim: { temperatureKelvin: 3400, color: '#ffad78', intensity: 0.2 },
    },
  },
]

export interface SampledEnvironmentTheme {
  background: Color
  ground: Color
  fogColor: Color
  fogDensity: number
  hemisphereSky: Color
  hemisphereGround: Color
  hemisphereIntensity: number
  ambientIntensity: number
  exposureCompensation: number
  environmentIntensity: number
  lights: Record<ExteriorLightRole, { color: Color; temperatureKelvin: number; intensity: number }>
}

const sampledTheme: SampledEnvironmentTheme = {
  background: new Color(),
  ground: new Color(),
  fogColor: new Color(),
  fogDensity: 0,
  hemisphereSky: new Color(),
  hemisphereGround: new Color(),
  hemisphereIntensity: 0,
  ambientIntensity: 0,
  exposureCompensation: 1,
  environmentIntensity: 1,
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
  sampledTheme.fogColor.set(from.fogColor).lerp(colorScratch.set(to.fogColor), t)
  sampledTheme.fogDensity = lerp(from.fogDensity, to.fogDensity, t)
  sampledTheme.hemisphereSky.set(from.hemisphereSky).lerp(colorScratch.set(to.hemisphereSky), t)
  sampledTheme.hemisphereGround.set(from.hemisphereGround).lerp(colorScratch.set(to.hemisphereGround), t)
  sampledTheme.hemisphereIntensity = lerp(from.hemisphereIntensity, to.hemisphereIntensity, t)
  sampledTheme.ambientIntensity = lerp(from.ambientIntensity, to.ambientIntensity, t)
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

  return sampledTheme
}

/** Compatibility helper for callers that only need the atmospheric colour. */
export function sampleEnvironmentColor(progress: number): Color {
  return sampleEnvironmentTheme(progress).background
}
