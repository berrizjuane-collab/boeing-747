import type { RefObject } from 'react'
import { SECTIONS, TOTAL_VH } from '../lib/sections'

/**
 * Invisible DOM spacer track: gives the document its ~800vh of scrollable
 * height (§12.6) so Lenis/ScrollTrigger have something to measure. Section
 * labels here are placeholder orientation markers for the Fase 2 arc
 * review, not the real overlay typography system — that's Fase 6.
 */
export function ScrollTrack({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={containerRef} className="scroll-track">
      {SECTIONS.map((section) => (
        <div
          key={section.id}
          className="scroll-track__section"
          style={{ height: `${(section.end - section.start) * TOTAL_VH}vh` }}
        >
          <span className="scroll-track__label">{section.label}</span>
        </div>
      ))}
    </div>
  )
}
