import { qaTier } from '../lib/qaConfig'
import { create } from 'zustand'

/**
 * PLAN.md §7.1's three tiers, kept as short internal keys with the plan's
 * own names carried in `label` (TIER_SETTINGS) rather than used as the type
 * itself — `'desktop-low-mobile-high'` as a discriminant reads worse
 * everywhere it's matched than `'mid'` does, and the label is what any UI
 * needs anyway.
 */
export type QualityTier = 'high' | 'mid' | 'low'

export interface TierSettings {
  label: string
  dprMax: number
  antialiasing: 'fxaa' | 'smaa'
  /** §7.1's own grouping — 'full' also includes godrays as the desktop-high
   * enhancement per §7.4 (godrays isn't its own row in the tier table). */
  postProcessing: 'full' | 'bloomVignette' | 'toneMappingOnly'
  particlesPct: number
  /** Real-time shadow casting for InteriorLighting.tsx's spots specifically
   * (§7.1's "Sombras" row). The S1-S2 aircraft contact shadow is a single
   * analytical quad (RunwayEnvironment.tsx's AircraftGroundShadow, not a
   * real shadow map) that fades itself out via `runwayPresence`, tied
   * directly to `SECTIONS[1].end` — already scoped to a short window
   * regardless of tier, and cheap enough (one draw call, no light or shadow
   * camera) that it isn't gated here either; the interior spots are the
   * "Interior en tiempo real" vs "Sólo horneadas" difference the table
   * actually names. (plan3.md bug #10: this used to point at a
   * SHADOW_SECTION_END constant in EnvironmentPlaceholder.tsx that no
   * longer exists — the scoping moved inline into AircraftGroundShadow
   * without the comment here following it.) */
  interiorRealtimeShadows: boolean
}

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  high: {
    label: 'Desktop High',
    dprMax: 2.0,
    antialiasing: 'smaa',
    postProcessing: 'full',
    particlesPct: 1,
    interiorRealtimeShadows: true,
  },
  mid: {
    label: 'Desktop Low / Mobile High',
    dprMax: 1.5,
    antialiasing: 'smaa',
    postProcessing: 'bloomVignette',
    particlesPct: 0.4,
    interiorRealtimeShadows: false,
  },
  low: {
    label: 'Mobile Low',
    dprMax: 1.0,
    antialiasing: 'fxaa',
    postProcessing: 'toneMappingOnly',
    particlesPct: 0,
    interiorRealtimeShadows: false,
  },
}

const TIER_ORDER: QualityTier[] = ['high', 'mid', 'low']

export function downgradeTier(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  return TIER_ORDER[Math.min(i + 1, TIER_ORDER.length - 1)]
}

export function cycleTier(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  return TIER_ORDER[(i + 1) % TIER_ORDER.length]
}

/**
 * Rough starting guess before the real ~2s frame-time measurement
 * (§7.3, see TierAutoDetect.tsx) has a chance to run — without this the
 * scene would boot at 'high' for every device, including ones the
 * measurement is about to immediately downgrade, which is exactly the
 * "picked the wrong tier and only found out after the fact" case §7.3
 * itself calls out as needing a manual override for. `deviceMemory` isn't
 * on the lib.dom Navigator type (non-standard, Chromium-only), so it's read
 * through a narrow local cast rather than pulling in a whole extra type
 * dependency for one optional field.
 */
function guessInitialTier(): QualityTier {
  if (typeof navigator === 'undefined') return 'high'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  const cores = navigator.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  if (isMobile) return memory >= 6 && cores >= 6 ? 'mid' : 'low'
  return cores >= 4 ? 'high' : 'mid'
}

interface QualityState {
  tier: QualityTier
  /** False once the user (or, functionally the same thing, the nav toggle)
   * has picked a tier explicitly — §7.3: "un usuario con una buena máquina
   * que cayó al tier bajo debe poder corregirlo", so a manual choice has to
   * stick and not get silently overwritten by the next auto-measurement. */
  auto: boolean
  setTier: (tier: QualityTier, source: 'auto' | 'manual') => void
}

export const useQualityStore = create<QualityState>((set, get) => ({
  tier: qaTier ?? guessInitialTier(),
  auto: qaTier === null,
  setTier: (tier, source) => {
    if (source === 'auto' && !get().auto) return
    set({ tier, auto: source === 'auto' })
  },
}))
