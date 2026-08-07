import { useEffect, useRef } from 'react'
import { type InteriorZoneKey, zoneForLocalProgress } from '../lib/cameraPath'
import { INTERIOR_ZONES } from '../lib/content'
import { localProgress, SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

type ZoneKey = InteriorZoneKey
const ZONE_ORDER: ZoneKey[] = ['cockpit', 'economy', 'stair', 'upperDeck']

/**
 * S5 per-zone overlay content, synced to the walkthrough's own dwell
 * plateaus (cameraPath.ts) rather than a separate timing scheme — the
 * plateaus exist specifically "para que el overlay se lea" (PLAN.md §3 S5),
 * so the overlay has to key off the same signal the camera pauses on, not
 * activeIndex (which only fires once for all of S5) or its own guess at
 * timing. Continuous S5-local progress needs the same rAF-loop-writes-DOM
 * pattern as TakeoffData in NarrativeOverlay.tsx / DebugHud.tsx, for the
 * same reason: reading it through the reactive store hook would re-render
 * React on every scroll tick.
 */
export function InteriorOverlay() {
  const inInterior = useScrollStore((s) => s.activeIndex === 4)
  const panelRefs = useRef<Record<ZoneKey, HTMLDivElement | null>>({
    cockpit: null,
    economy: null,
    stair: null,
    upperDeck: null,
  })

  useEffect(() => {
    if (!inInterior) {
      // Leaving S5 cancels the rAF loop below but was never clearing the
      // zone that was active at that moment — found in Fase 9 verification:
      // scroll into S5 far enough to reach "stair", then scroll back out to
      // S2/S3 (or on to S6/S7), and "S5 — Escalera" stayed opacity:1,
      // stacked on top of that section's own panel (both share
      // `grid-row: 1`/`grid-column: 1`, so they render on top of each
      // other, not side by side). Every other panel in NarrativeOverlay.tsx
      // derives `data-active` directly from `activeIndex`, so it can't go
      // stale this way; this rAF-driven one needs an explicit reset on the
      // way out.
      for (const key of ZONE_ORDER) {
        const el = panelRefs.current[key]
        if (el) el.dataset.active = 'false'
      }
      return
    }
    let raf = 0
    const tick = () => {
      const { progress } = useScrollStore.getState()
      const zone = zoneForLocalProgress(localProgress(progress, SECTIONS[4]))
      for (const key of ZONE_ORDER) {
        const el = panelRefs.current[key]
        if (el) el.dataset.active = String(key === zone)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inInterior])

  // Stays mounted outside S5 too (not `if (!inInterior) return null`),
  // matching NarrativeOverlay.tsx's always-mounted-fade-via-data-active
  // pattern instead of conditional rendering: PLAN.md §8.3 wants the
  // heading hierarchy linear "independientemente de la posición de
  // scroll", and a component that only mounts once scroll reaches S5 hides
  // its four zone <h2>s from a screen reader's heading list entirely for
  // anyone navigating by heading shortcuts rather than physically
  // scrolling the canvas — the CSS was already built for this (zone panels
  // default `data-active="false"`, `.overlay__panel`'s base rule is
  // opacity:0, and `.overlay__panel--interior-zone` already shares one grid
  // cell so an invisible stack doesn't collapse the layout), it just wasn't
  // being used while unmounted.
  return (
    <div className="overlay">
      <div className="overlay__col overlay__col--left">
        <div className="overlay__interior-stack">
          {ZONE_ORDER.map((key) => {
            const zone = INTERIOR_ZONES[key]
            return (
              <div
                key={key}
                ref={(el) => {
                  panelRefs.current[key] = el
                }}
                className="overlay__panel overlay__panel--interior-zone"
                data-active="false"
              >
                <div className="overlay__eyebrow">{zone.eyebrow}</div>
                <h2 className="overlay__title">{zone.title}</h2>
                <p className="overlay__body">{zone.body}</p>
                {zone.data.length > 0 && (
                  <ul className="overlay__data-list">
                    {zone.data.map((point) => (
                      <li key={point.label}>
                        <div className="overlay__data-label">{point.label}</div>
                        <div className="overlay__data-value">{point.value}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
