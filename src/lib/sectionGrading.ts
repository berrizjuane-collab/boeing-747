import { SECTIONS, getActiveSectionIndex, localProgress } from './sections'

// PLAN.md §10.1's grading table, "Key / acento" and "Sombra" columns only —
// "Base" is already the fog/background color (environmentTheme.ts), which a
// post-process grade would double up on if it also drove this. Two entries
// the table marks "—" (no sombra specified) get a neutral gray so the
// split-tone shift below resolves to zero rather than an invented color:
//
// - S4 copies S3's row exactly, not an invented "transition" color: PostFX
//   crossfades from a section's own row to the *next* section's row across
//   that section's span (sampleSectionGrade below, same shape as
//   environmentTheme.ts's sampleEnvironmentColor). If S4 had its own
//   distinct row, the shift toward it would start leaking in during S3 —
//   wrong, S3 is "máxima luminancia" and the plan is explicit that the
//   grading jump belongs *at* the threshold, not before it. Copying S3's
//   row means nothing moves during S3, and the entire S3->S5 grade change
//   happens within S4's own short span (42-50%) — "el salto" is short and
//   dense on purpose (§3 S4).
// - S7 reuses S0's key/acento (§10.1 explicitly calls S7 "Bookend de S0"),
//   sombra neutral like S0.
const NEUTRAL = '#808080'

export interface SectionGrade {
  key: string
  shadow: string
  strength: number
}

export const SECTION_GRADES: SectionGrade[] = [
  { key: '#F0A860', shadow: '#1E3A44', strength: 0.38 }, // S1 — pista
  { key: '#F0A860', shadow: '#1E3A44', strength: 0.38 }, // S2 — despegue, "igual que S1"
  { key: '#FFFFFF', shadow: '#4A7BA0', strength: 0.18 }, // S3 — ascenso
  { key: '#FFFFFF', shadow: '#4A7BA0', strength: 0.18 }, // S4 — umbral, copia de S3 (ver nota arriba)
  { key: '#D9A566', shadow: '#B8D4E8', strength: 0.32 }, // S5 — interior
  { key: '#E89B6C', shadow: '#16203A', strength: 0.64 }, // S6 — salida
  { key: '#E8B87A', shadow: NEUTRAL, strength: 0.28 }, // S7 — footer, bookend de S0
]

/** Same crossfade shape as environmentTheme.ts's sampleEnvironmentColor: the
 * active section's row, lerped toward the next section's row across the
 * active section's own local progress. */
export function sampleSectionGrade(progress: number): SectionGrade {
  const index = getActiveSectionIndex(progress)
  const from = SECTION_GRADES[index]
  const to = SECTION_GRADES[Math.min(index + 1, SECTION_GRADES.length - 1)]
  const t = localProgress(progress, SECTIONS[index])
  return {
    key: lerpHex(from.key, to.key, t),
    shadow: lerpHex(from.shadow, to.shadow, t),
    strength: from.strength + (to.strength - from.strength) * t,
  }
}

function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
