import { BRAND_NAME } from '../lib/content'
import { SECTIONS } from '../lib/sections'
import { cycleTier, TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { usePresentedActive } from '../lib/usePresentedActive'

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
  const tier = useQualityStore((s) => s.tier)
  const setTier = useQualityStore((s) => s.setTier)

  return (
    <nav className="site-nav" aria-label="Navegación de secciones">
      <div className="site-nav__scrim" aria-hidden="true" />
      <div className="site-nav__wordmark">{BRAND_NAME}</div>
      <div className="site-nav__right">
        <div className="site-nav__marks">
          {SECTIONS.map((section, index) => <SectionMark key={section.id} index={index} onJump={onJump} />)}
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

function SectionMark({ index, onJump }: { index: number; onJump: (index: number) => void }) {
  const ref = usePresentedActive<HTMLButtonElement>('activeIndex', index, true)
  return <button ref={ref} type="button" className="site-nav__mark"
    aria-label={`Saltar a ${SECTIONS[index].label}`} onClick={() => onJump(index)} />
}
