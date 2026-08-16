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
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

/** Ramps down across S4, holds through S5, ramps back up across S6 (over
 * `outRampFraction` of S6's own span, then holds at 1 for the rest of it).
 * Shared shape for exposure and sun intensity. */
function threshold(progress: number, low: number, outRampFraction = 1): number {
  if (progress < THRESHOLD_IN.start) return 1
  if (progress < THRESHOLD_IN.end) return lerp(1, low, localProgress(progress, THRESHOLD_IN))
  if (progress < INTERIOR.end) return low
  if (progress < THRESHOLD_OUT.end) {
    const rampT = clamp01(localProgress(progress, THRESHOLD_OUT) / outRampFraction)
    return lerp(low, 1, rampT)
  }
  return 1
}

// plan3.md bug (§1.5 cause 2 / B7): exposureMultiplier used to ramp across
// *all* of S6 (outRampFraction=1, reaching neutral only at the exact instant
// S6 ends), multiplied against environmentTheme.ts's own exposureCompensation
// for S6 — which starts lerping toward S7's *lower* 0.82 from the moment S6
// begins (sampleEnvironmentTheme's generic "this section's row -> next
// section's row" shape). The two effects compound the same direction, so the
// product (the actual rendered exposure) never reached neutral anywhere in
// S6: 0.651 at the start, 0.757 at mid, 0.820 at the end — verified by
// reproducing this exact formula and matching plan3.md's cited numbers
// exactly. Completing the ramp by 25% into S6 instead of 100% lets exposure
// hit ~0.99 (effectively neutral) right as environmentTheme's own downward
// drift is still small, then track that drift alone (0.99 -> 0.82) rather
// than compounding with it — measured after the fix, see progress3.md.
// sunIntensityMultiplier keeps the original full-span ramp: its timing was
// "already tuned and verified" for the light *popping back in* (a separate
// concern from scene exposure), and this fix doesn't touch it.
const S6_EXPOSURE_RAMP_FRACTION = 0.25

export const exposureMultiplier = (progress: number): number => threshold(progress, INTERIOR_EXPOSURE, S6_EXPOSURE_RAMP_FRACTION)
export const sunIntensityMultiplier = (progress: number): number => threshold(progress, INTERIOR_SUN)

/**
 * 0 before S6, ramps to 1 across S6, holds through S7. The "sun" directional
 * light's *intensity* already ramps back up across this same span (the
 * `threshold()` shape above) — reused as-is, since it was already tuned and
 * verified in Fase 4. But intensity alone returning to full isn't enough:
 * at identical color, a full-intensity light reads as literally the same S1
 * sun, which is exactly what PLAN.md §10.1 says S6 must not do ("no vuelve a
 * la luz de S3"). EnvironmentPlaceholder.tsx uses this weight to lerp the
 * light's color toward S6's dusk accent (`#E89B6C`, §10.1) as it fades back
 * in, instead of only changing how bright the same golden-hour hue gets.
 */
export function duskColorMix(progress: number): number {
  if (progress < THRESHOLD_OUT.start) return 0
  if (progress < THRESHOLD_OUT.end) return localProgress(progress, THRESHOLD_OUT)
  return 1
}
