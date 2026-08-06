import { BRAND_NAME } from '../lib/content'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

/**
 * PLAN.md §10.5: 64px fixed transparent bar, wordmark left, 7-mark section
 * indicator (one per SECTIONS entry) right with the active mark elongated,
 * click-to-jump ("saltar a sección"). No quality toggle here — PROGRESS.md's
 * own Fase 6 checklist omits it, deferring it to Fase 8's tiering work the
 * same way the audio toggle is already deferred (§12.5): "si el audio se
 * agrega en una iteración futura, el toggle entra acá, junto al de calidad
 * — no antes."
 *
 * Legibility: a gradient scrim from the top edge, not
 * `mix-blend-mode: difference` — the plan explicitly rejects that ("sobre
 * las nubes brillantes de S3 se rompe"), the same problem the overlay text
 * elsewhere solves with a text-shadow instead (index.css).
 */
export function SiteNav({ onJump }: { onJump: (index: number) => void }) {
  const activeIndex = useScrollStore((s) => s.activeIndex)

  return (
    <nav className="site-nav" aria-label="Navegación de secciones">
      <div className="site-nav__scrim" aria-hidden="true" />
      <div className="site-nav__wordmark">{BRAND_NAME}</div>
      <div className="site-nav__marks">
        {SECTIONS.map((section, index) => (
          <button
            key={section.id}
            type="button"
            className="site-nav__mark"
            data-active={index === activeIndex}
            aria-current={index === activeIndex ? 'true' : undefined}
            aria-label={`Saltar a ${section.label}`}
            onClick={() => onJump(index)}
          />
        ))}
      </div>
    </nav>
  )
}
