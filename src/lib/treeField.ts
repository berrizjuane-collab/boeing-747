import { seededRandom } from './grassField'

export interface TreePlacement {
  x: number
  z: number
  scale: number
  rotationY: number
  band: 'near' | 'far'
}

/**
 * plan3.md C1 (near, identifiable trees) + C4 (far treeline breaking the
 * horizon). One field, two bands, so both items share the same instanced
 * draw call instead of doubling geometry. Near trees sit east of the runway
 * only (lateral 95-150) — the west side is already built out with hangars
 * (runwayGeometry.ts's HANGARS/APRON), so keeping this band one-sided
 * avoids clipping through them without needing per-tree collision checks.
 * Far trees ring both sides at lateral >=220, comfortably beyond every
 * built footprint (the widest is the apron at |x|<=139) regardless of z.
 */
export function generateTreeField(nearCount: number, farCount: number, seed: number): TreePlacement[] {
  const random = seededRandom(seed)
  const placements: TreePlacement[] = []

  for (let index = 0; index < nearCount; index += 1) {
    placements.push({
      x: 95 + random() * 55,
      z: -200 + random() * 400,
      scale: 0.8 + random() * 0.5,
      rotationY: random() * Math.PI * 2,
      band: 'near',
    })
  }

  for (let index = 0; index < farCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    placements.push({
      x: side * (220 + random() * 260),
      z: -480 + random() * 960,
      scale: 0.55 + random() * 0.6,
      rotationY: random() * Math.PI * 2,
      band: 'far',
    })
  }

  return placements
}
