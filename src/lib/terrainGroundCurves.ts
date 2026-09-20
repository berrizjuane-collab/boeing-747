import { Color } from 'three'
import { SECTIONS } from './sections'

// plan4.md §3.5/G3: the new textured albedo is deliberately NOT tinted by
// theme.ground until S2 ends, so the hero (S1/S2) reads as fully
// texture-authored; the mix then ramps in across S3. SECTION_ENVIRONMENT
// itself is untouched (plan4.md §7 contract: no systemic change this
// round).
export const GROUND_TINT_RAMP_START = SECTIONS[1].end
export const GROUND_TINT_RAMP_END = SECTIONS[2].end
// >1 so S5/S7's very dark theme.ground values (#151311, #090b0e) still read
// as near-black once mixed in fully, rather than the texture's own
// mid-value albedo diluting them.
export const GROUND_TINT_GAIN = 1.6

function smoothstep01(value: number): number {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

/** 0 = fully texture-authored (white multiplier), 1 = fully tinted by theme.ground * GAIN. Pure so it's directly testable without a mounted mesh. */
export function groundTintMix(progress: number): number {
  return smoothstep01((progress - GROUND_TINT_RAMP_START) / (GROUND_TINT_RAMP_END - GROUND_TINT_RAMP_START))
}

const tintScratch = new Color()

/** Mutates `target` (material.color) to white lerped toward theme.ground * GAIN by this progress's tint mix — matches material.color's role as a multiplier over the sampled diffuse map. */
export function applyGroundTint(target: Color, themeGround: Color, progress: number): Color {
  tintScratch.copy(themeGround).multiplyScalar(GROUND_TINT_GAIN)
  return target.set(1, 1, 1).lerp(tintScratch, groundTintMix(progress))
}
