import { BRAND_NAME } from '../lib/content'
import { SECTIONS } from '../lib/sections'
import { cycleTier, TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

/**
 * PLAN.md §10.5: 64px fixed transparent bar, wordmark left, 7-mark section
 * indicator (one per SECTIONS entry) + quality toggle right, click-to-jump
 * ("saltar a sección"). The quality toggle was deliberately left out of
 * Fase 6 (PROGRESS.md) and built here alongside the rest of Fase 8's
 * tiering work — §7.3 requires it explicitly: "un usuario con una buena
 * máquina que cayó al tier bajo debe poder corregirlo."
 *
 * Legibility: a gradient scrim from the top edge, not
 * `mix-blend-mode: difference` — the plan explicitly rejects that ("sobre
 * las nubes brillantes de S3 se rompe"), the same problem the overlay text
 * elsewhere solves with a text-shadow instead (index.css).
 */
export function SiteNav({ onJump }: { onJump: (index: number) => void }) {
  const activeIndex = useScrollStore((s) => s.activeIndex)
  const tier = useQualityStore((s) => s.tier)
  const setTier = useQualityStore((s) => s.setTier)

  return (
    <nav className="site-nav" aria-label="Navegación de secciones">
      <div className="site-nav__scrim" aria-hidden="true" />
      <div className="site-nav__wordmark">{BRAND_NAME}</div>
      <div className="site-nav__right">
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
        <button
          type="button"
          className="site-nav__quality"
          onClick={() => setTier(cycleTier(tier), 'manual')}
          aria-label={`Calidad: ${TIER_SETTINGS[tier].label}. Tocar para cambiar.`}
        >
          {tier}
        </button>
      </div>
    </nav>
  )
}
