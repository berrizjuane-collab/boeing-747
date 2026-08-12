import type { InteriorZoneKey } from '../lib/cameraPath'
import { INTERIOR_ZONES } from '../lib/content'
import { useScrollStore } from '../state/scrollStore'

type ZoneKey = InteriorZoneKey
const ZONE_ORDER: ZoneKey[] = ['cockpit', 'economy', 'stair', 'upperDeck']

/**
 * S5 per-zone content reads the store's atomically derived interior zone.
 * The selector changes only at dwell boundaries, so it does not re-render
 * on every progress tick; null naturally hides every panel during transit
 * and anywhere outside S5.
 */
export function InteriorOverlay() {
  const activeZone = useScrollStore((state) => state.interiorZone)

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
                className="overlay__panel overlay__panel--interior-zone"
                data-active={String(key === activeZone)}
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
