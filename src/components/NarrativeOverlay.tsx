import { useLayoutEffect, useRef } from 'react'
import {
  EXIT_CONTENT,
  FOOTER_ATTRIBUTION,
  FOOTER_COLOPHON,
  HERO_CONTENT,
  SPEC_SHEET,
  TAKEOFF_DATA,
  TECHNICAL_SOURCES,
  THRESHOLD_LINE,
} from '../lib/content'
import { localProgress, SECTIONS } from '../lib/sections'
import { TAKEOFF_REVEAL_AT } from '../lib/narrativeLayout'
import { useScrollStore } from '../state/scrollStore'
import { usePresentedActive } from '../lib/usePresentedActive'

function TakeoffData() {
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  useLayoutEffect(() => {
    const tick = () => {
      const { progress } = useScrollStore.getState()
      const local = localProgress(progress, SECTIONS[1])
      TAKEOFF_REVEAL_AT.forEach((threshold, i) => {
        const el = itemRefs.current[i]
        if (el) el.dataset.revealed = String(local >= threshold)
      })
    }
    tick()
    return useScrollStore.subscribe(tick)
  }, [])

  return (
    <ul className="overlay__data-list">
      {TAKEOFF_DATA.map((point, i) => (
        <li
          key={point.label}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          className="overlay__data-item"
        >
          <div className="overlay__data-label">{point.label}</div>
          <div className="overlay__data-value">{point.value}</div>
        </li>
      ))}
    </ul>
  )
}

function Panel({
  index,
  side,
  children,
}: {
  index: number
  side: 'left' | 'right'
  children: React.ReactNode
}) {
  const activeRef = usePresentedActive<HTMLDivElement>('activeIndex', index)
  return (
    <div className={`overlay__col overlay__col--${side}`}>
      <div
        className={`overlay__panel overlay__panel--${SECTIONS[index].id}`}
        ref={activeRef}
        data-section={SECTIONS[index].id}
        tabIndex={0}
        role="region"
        aria-label={SECTIONS[index].label}
      >
        {children}
      </div>
    </div>
  )
}

/** Presented-frame panels; inactive regions are inert. Full reading mode is
 * available from navigation independently of camera position. */
export function NarrativeOverlayHead() {
  const thresholdRef = usePresentedActive<HTMLDivElement>('activeIndex', 3)

  return (
    <>
      <div className="overlay">
        <Panel index={0} side="left">
          <div className="overlay__eyebrow">{HERO_CONTENT.eyebrow}</div>
          <h1 className="overlay__title--hero">{HERO_CONTENT.title}</h1>
          <p className="overlay__subtitle">{HERO_CONTENT.subtitle}</p>
          <div className="overlay__scroll-hint">{HERO_CONTENT.scrollHint}</div>
        </Panel>

        <Panel index={1} side="right">
          {/* PLAN.md §8.3: heading hierarchy has to be linear regardless of
              scroll position. Every other panel here has an <h1>/<h2> for
              its section — S2 only had this eyebrow div, which would leave
              a screen reader's heading list jumping straight from S1's
              "MERIDIAN" to S3's "Ficha técnica" with no S2 entry at all, even
              though there's a whole panel of engine/speed/runway data in
              between. `.overlay__eyebrow`'s styling doesn't depend on the
              element being a div, so promoting it to h2 is heading-level-only,
              no visual change. */}
          <h2 className="overlay__eyebrow">S2 — Rodaje y despegue</h2>
          <TakeoffData />
        </Panel>

        <Panel index={2} side="left">
          <div className="overlay__eyebrow">S3 — Ascenso</div>
          <h2 className="overlay__title">Ficha técnica</h2>
          <ul className="overlay__data-list">
            {SPEC_SHEET.map((point) => (
              <li key={point.label}>
                <div className="overlay__data-label">{point.label}</div>
                <div className="overlay__data-value">{point.value}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* S4: "mínimo o nulo... a lo sumo una línea" (PLAN.md §3 S4) — kept
          outside the thirds grid since it's a single centered line, not a
          two-column panel. */}
      <div className="overlay__threshold-line" ref={thresholdRef}>
        {THRESHOLD_LINE}
      </div>
    </>
  )
}

export function NarrativeOverlayTail() {
  return (
    <div className="overlay">
      {/* Left, not right: the S6 break-out brings the aircraft back into
          frame from the right (shotSheet.ts), where a right-hand panel
          hid it from 0.86 to 0.89 at desktop widths. */}
      <Panel index={5} side="left">
        <div className="overlay__eyebrow">{EXIT_CONTENT.eyebrow}</div>
        <h2 className="overlay__title">{EXIT_CONTENT.title}</h2>
        <p className="overlay__body">{EXIT_CONTENT.body}</p>
      </Panel>

      <Panel index={6} side="left">
        <p className="overlay__footer-colophon">{FOOTER_COLOPHON}</p>
        <details className="overlay__footer-attribution" open>
          <summary>{FOOTER_ATTRIBUTION.heading}</summary>
          <p>
            {FOOTER_ATTRIBUTION.modelCredit}
            <br />
            <a href={FOOTER_ATTRIBUTION.modelUrl} target="_blank" rel="noreferrer">
              Modelo original
            </a>
            {' · '}
            <a href={FOOTER_ATTRIBUTION.licenseUrl} target="_blank" rel="noreferrer">
              CC BY 4.0
            </a>
          </p>
        </details>
        <details className="overlay__footer-attribution">
          <summary>Fuentes técnicas</summary>
          <ul className="overlay__footer-sources">
            {TECHNICAL_SOURCES.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </Panel>
    </div>
  )
}
