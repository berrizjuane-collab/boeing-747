import type { InteriorZoneKey } from '../lib/cameraPath'
import { INTERIOR_ZONES } from '../lib/content'
import { usePresentedActive } from '../lib/usePresentedActive'

type ZoneKey = InteriorZoneKey
const ZONE_ORDER: ZoneKey[] = ['cockpit', 'economy', 'stair', 'upperDeck']

/**
 * S5 per-zone content reads the store's atomically derived interior zone.
 * The selector changes only at dwell boundaries, so it does not re-render
 * on every progress tick; null naturally hides every panel during transit
 * and anywhere outside S5.
 */
export function InteriorOverlay() {

  return (
    <div className="overlay">
      <div className="overlay__col overlay__col--left">
        <div className="overlay__interior-stack">
          {ZONE_ORDER.map(key => <ZonePanel key={key} zoneKey={key} />)}
        </div>
      </div>
    </div>
  )
}

function ZonePanel({ zoneKey }: { zoneKey: ZoneKey }) {
  const ref = usePresentedActive<HTMLDivElement>('interiorZone', zoneKey)
  const zone = INTERIOR_ZONES[zoneKey]
  return <div ref={ref} className="overlay__panel overlay__panel--interior-zone" data-zone={zoneKey} tabIndex={0} role="region" aria-label={zone.title}>
    <div className="overlay__eyebrow">{zone.eyebrow}</div>
    <h2 className="overlay__title">{zone.title}</h2>
    <p className="overlay__body">{zone.body}</p>
    {zone.data.length > 0 && <ul className="overlay__data-list">{zone.data.map(point => <li key={point.label}>
      <div className="overlay__data-label">{point.label}</div><div className="overlay__data-value">{point.value}</div>
    </li>)}</ul>}
  </div>
}
