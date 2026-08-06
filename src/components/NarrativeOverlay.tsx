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
 * DOM narrative layer for S1/S2/S3/S4/S6/S7 (PLAN.md §3, §10.2). S5's
 * per-zone content lives in InteriorOverlay.tsx instead — it's driven by
 * the walkthrough's zone index, not section activeIndex, so it doesn't fit
 * this component's one-panel-per-section shape. Panels stay mounted at all
 * times and fade via `data-active` (see index.css) rather than conditional
 * rendering, so the CSS transition has something to animate both in and out
 * of. `activeIndex` is safe to select reactively — it only changes 6 times
 * across the page (scrollStore.ts).
 */
export function NarrativeOverlay() {
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
          <div className="overlay__eyebrow">S2 — Rodaje y despegue</div>
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

      {/* S4: "mínimo o nulo... a lo sumo una línea" (PLAN.md §3 S4) — kept
          outside the thirds grid since it's a single centered line, not a
          two-column panel. */}
      <div className="overlay__threshold-line" data-active={thresholdActive}>
        {THRESHOLD_LINE}
      </div>
    </>
  )
}
