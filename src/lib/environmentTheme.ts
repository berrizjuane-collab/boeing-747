import { Color } from 'three'
import { SECTIONS, getActiveSectionIndex, localProgress } from './sections'

// One anchor color per section, loosely following the grading arc from
// PLAN.md §10.1 (warm runway → bright cool climb → warm contained interior →
// cool dusk → near-black footer). Placeholder-legible, not final grading —
// that's Fase 7. The point here is that each section reads as visually
// distinct during the Fase 2 narrative-arc review.
const SECTION_COLORS = [
  new Color('#c9895b'), // S1 hero — golden hour
  new Color('#d79a6b'), // S2 takeoff — same key, brightening
  new Color('#7fb3d5'), // S3 climb — max luminance of the site
  new Color('#5a7a95'), // S4 threshold — mid-transition
  new Color('#241a12'), // S5 interior — warm and contained (dark: we're inside)
  new Color('#2b3a55'), // S6 exit — cool dusk
  new Color('#0a0c10'), // S7 footer — bookend of the loading black
]

const scratch = new Color()

/** Crossfades from the active section's color to the next section's, finishing exactly at the section boundary. */
export function sampleEnvironmentColor(progress: number): Color {
  const index = getActiveSectionIndex(progress)
  const from = SECTION_COLORS[index]
  const to = SECTION_COLORS[Math.min(index + 1, SECTION_COLORS.length - 1)]
  const t = localProgress(progress, SECTIONS[index])
  return scratch.copy(from).lerp(to, t)
}
