import { seededRandom } from './proceduralRandom'

export interface TreeInstance {
  x: number
  z: number
  rotationY: number
  scale: number
  colorT: number
}

const NEAR_COUNT = 90
const FAR_COUNT = 260
export const FOREST_INSTANCE_COUNT = NEAR_COUNT + FAR_COUNT

function buildBand(count: number, seed: number, place: (random: () => number, index: number) => { x: number; z: number }): TreeInstance[] {
  const random = seededRandom(seed)
  const instances: TreeInstance[] = []
  for (let index = 0; index < count; index += 1) {
    const { x, z } = place(random, index)
    instances.push({ x, z, rotationY: random() * Math.PI * 2, scale: 0.75 + random() * 0.75, colorT: random() })
  }
  return instances
}

// Runway: x in [-16, 16]. Apron: x in [-139, -23]. Hangar cluster's own
// footprint tops out around x in [-124, -2]. S1/S2's camera keyframes stay
// within roughly x in [58, 100] of the origin (cameraPath.ts) — the first
// cut of this band (x >= 45) put "near" trees close enough to that path to
// read as one oversized blob a few meters from the lens rather than a
// background tree, caught by an actual screenshot (qa:d3 at 0.01). Starting
// at 150/200 keeps every instance clear of the runway/apron/hangars *and*
// comfortably past where the camera itself ever flies in this window.
function placeNear(random: () => number, index: number) {
  const side = index % 2 === 0 ? 1 : -1
  const lateral = side > 0 ? 150 + random() * 130 : -(200 + random() * 130)
  return { x: lateral, z: -255 + random() * 510 }
}

// Far band (C4 — "línea de árboles y relieve lejano"): a ring at a radius
// past every other structure (runway half-length 260, hangar cluster ~150)
// regardless of angle, so it never overlaps the airport itself. Its job is
// breaking the terrain disc's horizon, not being examined up close.
function placeFar(random: () => number) {
  const radius = 300 + random() * 340
  const angle = random() * Math.PI * 2
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }
}

/**
 * plan3.md C1/C4: near + far bands interleaved (not concatenated) so that
 * any tier-scaled prefix of this array — see Forest.tsx's FOREST_COUNT —
 * still samples both bands in roughly their original ratio, instead of a
 * low tier silently losing the entire far band (and with it, the horizon
 * treeline C4 asks for) just because it happens to sit at the end of the
 * array.
 */
export function buildForestInstances(): TreeInstance[] {
  const near = buildBand(NEAR_COUNT, 0x7ee1a3, placeNear)
  const far = buildBand(FAR_COUNT, 0xf0e571, placeFar)
  const interleaved: TreeInstance[] = []
  let nearIndex = 0
  let farIndex = 0
  while (nearIndex < near.length || farIndex < far.length) {
    const nearFraction = nearIndex / NEAR_COUNT
    const farFraction = farIndex / FAR_COUNT
    if (farIndex < far.length && (nearIndex >= near.length || farFraction <= nearFraction)) {
      interleaved.push(far[farIndex])
      farIndex += 1
    } else {
      interleaved.push(near[nearIndex])
      nearIndex += 1
    }
  }
  return interleaved
}
