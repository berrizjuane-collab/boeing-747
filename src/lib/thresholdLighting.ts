import { SECTIONS, localProgress } from './sections'

const THRESHOLD_IN = SECTIONS[3] // S4
const INTERIOR = SECTIONS[4] // S5
const THRESHOLD_OUT = SECTIONS[5] // S6

// ~1 stop down, contained/warm cabin exposure instead of open daylight.
const INTERIOR_EXPOSURE = 0.62
// The sun doesn't reach the cabin — not literally zero, so the interior
// isn't lit by hemisphere fill alone.
const INTERIOR_SUN = 0.04

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Ramps down across S4, holds through S5, ramps back up across S6. Shared shape for exposure and sun intensity. */
function threshold(progress: number, low: number): number {
  if (progress < THRESHOLD_IN.start) return 1
  if (progress < THRESHOLD_IN.end) return lerp(1, low, localProgress(progress, THRESHOLD_IN))
  if (progress < INTERIOR.end) return low
  if (progress < THRESHOLD_OUT.end) return lerp(low, 1, localProgress(progress, THRESHOLD_OUT))
  return 1
}

export const exposureMultiplier = (progress: number): number => threshold(progress, INTERIOR_EXPOSURE)
export const sunIntensityMultiplier = (progress: number): number => threshold(progress, INTERIOR_SUN)
