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
    if (!inInterior) return
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

  if (!inInterior) return null

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
