import { Color } from 'three'

/**
 * plan4.md G4/§3.6: the "bruma de dosel" colour — warmer and measurably
 * brighter than theme.background itself (property 5 of §3.1: fog raises
 * luminance with distance, it doesn't lower it). Extracted from
 * TerrainGround.tsx's inline G4 computation (character-for-character the
 * same formula — this file changes nothing about already-verified G4
 * output) so Fase H (forest/grass canopy fog) and Fase I (sky-dome horizon
 * band) can converge on literally the same colour instead of three
 * independent copies of this HSL nudge silently drifting apart. See
 * plan4-fase-g.test.mjs / plan4-fase-h.test.mjs for the byte-identical
 * regression check against TerrainGround's own call site.
 */
const hslScratch = { h: 0, s: 0, l: 0 }

export function computeCanopyMistColor(background: Color, target: Color): Color {
  target.copy(background)
  target.getHSL(hslScratch)
  target.setHSL((hslScratch.h + 0.02) % 1, Math.max(hslScratch.s, 0.4), Math.min(1, hslScratch.l + 0.22))
  return target
}
