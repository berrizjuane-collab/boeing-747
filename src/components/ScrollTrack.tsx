import type { RefObject } from 'react'
import { SECTIONS, TOTAL_VH } from '../lib/sections'

/**
 * Invisible DOM spacer track: gives the document its ~800vh of scrollable
 * height (§12.6) so Lenis/ScrollTrigger have something to measure.
 *
 * Used to render a visible `<span>` label per section — Fase 2 placeholder
 * orientation markers, in normal document flow rather than fixed to the
 * viewport. Removed once Fase 6's real overlay (NarrativeOverlay.tsx,
 * InteriorOverlay.tsx) made them redundant: found via the Fase 7 Playwright
 * pass that S1's own label, sitting at document-flow top + 24px padding,
 * visually collided with the fixed nav bar (SiteNav.tsx, also fixed at the
 * very top) at exactly scroll=0% — a moment no earlier verification pass
 * had specifically checked, since it's the instant before any scrolling.
 */
export function ScrollTrack({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={containerRef} className="scroll-track">
      {SECTIONS.map((section) => (
        <div
          key={section.id}
          className="scroll-track__section"
          style={{ height: `${(section.end - section.start) * TOTAL_VH}vh` }}
        />
      ))}
    </div>
  )
}
