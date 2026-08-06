import { SECTIONS } from './sections'

// PLAN.md §5: "exterior golden hour (S1-S2)... gran altitud (S3)". The two
// real HDRIs (blender/generate_hdri.py) crossfade across the S2/S3 boundary
// and the golden-hour one never shows again; the high-altitude one fades
// back out before S4, handing the atmosphere fully back to the existing
// threshold crossfade (thresholdLighting.ts) — this only shapes S1-S3, nothing
// about the already-verified S4+ behavior changes.
const GOLDEN_TO_HIGH_ALT = SECTIONS[1].end // S2 -> S3 boundary, 0.28
const HIGH_ALT_OUT = SECTIONS[2].end // S3 -> S4 boundary, 0.42
const FADE_HALF = 0.02

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const rampUp = (edge0: number, edge1: number, x: number) => clamp01((x - edge0) / (edge1 - edge0))

/** 1 through S1-S2, fades to 0 across the S2/S3 boundary. */
export function goldenHourWeight(progress: number): number {
  return 1 - rampUp(GOLDEN_TO_HIGH_ALT - FADE_HALF, GOLDEN_TO_HIGH_ALT + FADE_HALF, progress)
}

/** Fades in across the S2/S3 boundary, holds through S3, fades out before S4. */
export function highAltitudeWeight(progress: number): number {
  const fadeIn = rampUp(GOLDEN_TO_HIGH_ALT - FADE_HALF, GOLDEN_TO_HIGH_ALT + FADE_HALF, progress)
  const fadeOut = 1 - rampUp(HIGH_ALT_OUT - FADE_HALF, HIGH_ALT_OUT + FADE_HALF, progress)
  return Math.min(fadeIn, fadeOut)
}

/**
 * Discrete (not continuous) pick of which HDRI feeds scene.environment for
 * PBR reflections — unlike the sky dome's per-pixel color mix, reflection
 * probes don't blend two textures cheaply, so this hard-switches at the same
 * boundaries the visible crossfade is centered on. Driven by the section
 * index (already a discrete, render-cheap value — see scrollStore.ts), not
 * raw progress, so it changes at most twice across the whole page.
 */
export function activeHdriSectionSlot(sectionIndex: number): 'golden' | 'high-altitude' | null {
  if (sectionIndex <= 1) return 'golden'
  if (sectionIndex === 2) return 'high-altitude'
  return null
}
