import { SECTIONS } from './sections'

// PLAN.md §5: "exterior golden hour (S1-S2)... gran altitud (S3)". The two
// real HDRIs (blender/generate_hdri.py) crossfade across the S2/S3 boundary
// and the golden-hour one never shows again; the high-altitude one fades
// back out before S4, handing the atmosphere fully back to the existing
// threshold crossfade (thresholdLighting.ts) — this only shapes S1-S3, nothing
// about the already-verified S4+ behavior changes.
const GOLDEN_TO_HIGH_ALT = SECTIONS[1].end // S2 -> S3 boundary, 0.28
const HIGH_ALT_OUT = SECTIONS[2].end // S3 -> S4 boundary, 0.42

// S6's own HDRI (PLAN.md §5's third: "atardecer (S6)"). Fades in across S6's
// own entry rather than snapping on at the S5/S6 boundary — S6 already has
// InteriorLighting's cabin lights fading out over the same span
// (cabinFactor's exit ramp), so the sunset sky and the cabin light crossfade
// against each other instead of one popping on right as the other cuts.
// Fades back out across S7, handing off to that section's own near-flat
// near-black background (environmentTheme.ts) — same reasoning as the
// golden-hour/high-altitude handoff to thresholdLighting.ts above, one
// section later.
const SUNSET_IN = SECTIONS[5].start // S5 -> S6 boundary, 0.82
const SUNSET_OUT = SECTIONS[6].start // S6 -> S7 boundary, 0.95
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

/** Fades in across the S5/S6 boundary, holds through S6, fades out across S7. */
export function sunsetWeight(progress: number): number {
  const fadeIn = rampUp(SUNSET_IN - FADE_HALF, SUNSET_IN + FADE_HALF, progress)
  const fadeOut = 1 - rampUp(SUNSET_OUT, 1, progress)
  return Math.min(fadeIn, fadeOut)
}

/**
 * Discrete (not continuous) pick of which HDRI feeds scene.environment for
 * PBR reflections — unlike the sky dome's per-pixel color mix, reflection
 * probes don't blend two textures cheaply, so this hard-switches at the same
 * boundaries the visible crossfade is centered on. Driven by the section
 * index (already a discrete, render-cheap value — see scrollStore.ts), not
 * raw progress, so it changes at most three times across the whole page.
 */
export function activeHdriSectionSlot(sectionIndex: number): 'golden' | 'high-altitude' | 'sunset' | null {
  if (sectionIndex <= 1) return 'golden'
  if (sectionIndex === 2) return 'high-altitude'
  if (sectionIndex >= 5) return 'sunset'
  return null
}
