// Boundaries match PLAN.md §3 exactly. S0 (loading) is a pre-scroll gate and
// has no range here — real asset loading is Fase 6 scope, not Fase 1/2.
export interface SectionDef {
  id: string
  index: number
  label: string
  start: number // fraction of total scroll, 0..1
  end: number
}

export const SECTIONS: SectionDef[] = [
  { id: 'hero', index: 0, label: 'S1 — Pista de despegue', start: 0, end: 0.12 },
  { id: 'takeoff', index: 1, label: 'S2 — Rodaje y despegue', start: 0.12, end: 0.28 },
  { id: 'climb', index: 2, label: 'S3 — Ascenso', start: 0.28, end: 0.42 },
  { id: 'threshold', index: 3, label: 'S4 — Umbral', start: 0.42, end: 0.5 },
  { id: 'interior', index: 4, label: 'S5 — Interior', start: 0.5, end: 0.82 },
  { id: 'exit', index: 5, label: 'S6 — Salida', start: 0.82, end: 0.95 },
  { id: 'footer', index: 6, label: 'S7 — Footer', start: 0.95, end: 1 },
]

// §12.6: ~800vh total scroll budget, confirmed.
export const TOTAL_VH = 800

export function getActiveSectionIndex(progress: number): number {
  for (const section of SECTIONS) {
    if (progress >= section.start && progress < section.end) return section.index
  }
  return progress >= 1 ? SECTIONS[SECTIONS.length - 1].index : 0
}

/** Where `progress` falls within a specific section's own range, clamped to [0,1]. */
export function localProgress(progress: number, section: SectionDef): number {
  const span = section.end - section.start
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (progress - section.start) / span))
}
