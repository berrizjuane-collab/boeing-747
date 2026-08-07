import { useEffect, useRef } from 'react'
import {
  EXIT_CONTENT,
  FOOTER_ATTRIBUTION,
  FOOTER_COLOPHON,
  HERO_CONTENT,
  SPEC_SHEET,
  TAKEOFF_DATA,
  THRESHOLD_LINE,
} from '../lib/content'
import { localProgress, SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

// Fraction of S2's own local progress (0..1) at which each TAKEOFF_DATA
// item reveals — PLAN.md §3 S2 asks for data "disparados progresivamente
// conforme avanza el scroll", not all four together on section entry.
// Needs its own rAF loop rather than the activeIndex hook: activeIndex only
// changes once for all of S2, which is too coarse for a reveal *within* it.
const TAKEOFF_REVEAL_AT = [0.08, 0.32, 0.58, 0.8]

function TakeoffData() {
  const itemRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { progress } = useScrollStore.getState()
      const local = localProgress(progress, SECTIONS[1])
      TAKEOFF_REVEAL_AT.forEach((threshold, i) => {
        const el = itemRefs.current[i]
        if (el) el.dataset.revealed = String(local >= threshold)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
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
  const isActive = useScrollStore((s) => s.activeIndex === index)
  return (
    <div className={`overlay__col overlay__col--${side}`}>
      <div className="overlay__panel" data-active={isActive} data-section={SECTIONS[index].id}>
        {children}
      </div>
    </div>
  )
}

/**
 * DOM narrative layer for S1/S2/S3/S4/S6/S7 (PLAN.md §3, §10.2), split into
 * two components — `NarrativeOverlayHead` (S1-S4) and `NarrativeOverlayTail`
 * (S6-S7) — instead of one, so App.tsx can mount InteriorOverlay.tsx's S5
 * content *between* them. S5 isn't part of either: it's driven by the
 * walkthrough's zone index, not section activeIndex, so it doesn't fit this
 * component's one-panel-per-section shape. That split exists purely for DOM
 * order: PLAN.md §8.3 wants the heading hierarchy linear regardless of
 * scroll position, and this whole narrative layer's panels already stay
 * mounted at all times precisely so a screen reader's heading list reflects
 * every section up front — but headings only read "linear" if they also
 * appear in *story* order (S1→S2→S3→S4→S5→S6→S7), not DOM-insertion order.
 * A single component mounted before InteriorOverlay would put S6/S7 ahead of
 * S5 in that list, which is what a first pass at this (mount all of
 * NarrativeOverlay, then InteriorOverlay, unconditionally) actually did —
 * caught via the Fase 7 Playwright pass's own heading-order dump. Panels
 * stay mounted at all times and fade via `data-active` (see index.css)
 * rather than conditional rendering, so the CSS transition has something to
 * animate both in and out of. `activeIndex` is safe to select reactively —
 * it only changes 6 times across the page (scrollStore.ts).
 */
export function NarrativeOverlayHead() {
  const thresholdActive = useScrollStore((s) => s.activeIndex === 3)

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
      <div className="overlay__threshold-line" data-active={thresholdActive}>
        {THRESHOLD_LINE}
      </div>
    </>
  )
}

export function NarrativeOverlayTail() {
  return (
    <div className="overlay">
      <Panel index={5} side="right">
        <div className="overlay__eyebrow">{EXIT_CONTENT.eyebrow}</div>
        <h2 className="overlay__title">{EXIT_CONTENT.title}</h2>
        <p className="overlay__body">{EXIT_CONTENT.body}</p>
      </Panel>

      <Panel index={6} side="left">
        <p className="overlay__footer-colophon">{FOOTER_COLOPHON}</p>
        <details className="overlay__footer-attribution">
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
      </Panel>
    </div>
  )
}
