import { BufferGeometry, Float32BufferAttribute } from 'three'

export const RUNWAY_SURFACE_Y = 0.025

// plan3.md §3.2 item 1 ("fuente única de verdad"): airportGroundPlan.ts's
// taxiways need to share this exact contract (touch the runway edge at the
// right X, stay clear of its Z span) rather than hardcoding a second copy of
// these numbers — a GLB would have forked that into an uncheckable second
// source; a TS import keeps CI able to cross-check both.
export const RUNWAY_WIDTH = 32
export const RUNWAY_LENGTH = 520

export interface QuadBuffers {
  positions: number[]
  normals: number[]
  indices: number[]
}

/** Adds a world-XZ quad whose winding and normals both face +Y. Exported for
 * airportGroundPlan.ts, which needs the exact same flat-and-upward contract
 * B4 already asserts for runway markings. */
export function addHorizontalQuad(buffers: QuadBuffers, x1: number, x2: number, z1: number, z2: number) {
  const first = buffers.positions.length / 3
  buffers.positions.push(
    x1, RUNWAY_SURFACE_Y, z1,
    x1, RUNWAY_SURFACE_Y, z2,
    x2, RUNWAY_SURFACE_Y, z2,
    x2, RUNWAY_SURFACE_Y, z1,
  )
  buffers.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  buffers.indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
}

// D3 (plan3.md): "numeración de cabecera" — no text-rendering library exists
// anywhere in this project (no font mesher in package.json), so digits are
// built the same way every other marking here is: flat quads through
// addHorizontalQuad, which is what keeps them automatically subject to B4's
// contract instead of needing a parallel one. Seven-segment blocks read
// clearly at this project's viewing distances/sizes (§1.8: 5.3 px/unit at
// 36% scroll) and are the same bold, geometric letterform real runway
// numbering actually uses. Local digit space: x in [0,1] (lateral), y in
// [0,2] (along the runway), y=0 at the digit's own base.
const SEGMENT_PATTERNS: Record<number, readonly string[]> = {
  0: ['a', 'b', 'c', 'd', 'e', 'f'],
  1: ['b', 'c'],
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
  4: ['f', 'g', 'b', 'c'],
  5: ['a', 'f', 'g', 'c', 'd'],
  6: ['a', 'f', 'g', 'e', 'c', 'd'],
  7: ['a', 'b', 'c'],
  8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  9: ['a', 'b', 'c', 'd', 'f', 'g'],
}

const SEGMENT_THICKNESS = 0.16
const SEGMENT_RECTS: Record<string, readonly [number, number, number, number]> = {
  a: [SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS, 2 - SEGMENT_THICKNESS, 2],
  d: [SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS, 0, SEGMENT_THICKNESS],
  g: [SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS / 2, 1 + SEGMENT_THICKNESS / 2],
  f: [0, SEGMENT_THICKNESS, 1 + SEGMENT_THICKNESS / 2, 2 - SEGMENT_THICKNESS],
  b: [1 - SEGMENT_THICKNESS, 1, 1 + SEGMENT_THICKNESS / 2, 2 - SEGMENT_THICKNESS],
  e: [0, SEGMENT_THICKNESS, SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS / 2],
  c: [1 - SEGMENT_THICKNESS, 1, SEGMENT_THICKNESS, 1 - SEGMENT_THICKNESS / 2],
}

/** Two-digit runway heading number, centered on `centerX`/`centerZ`, digit
 * "up" pointing toward +Z. Exported so tests can assert its vertices too. */
export function addRunwayHeadingNumber(
  buffers: QuadBuffers,
  digits: readonly [number, number],
  centerX: number,
  centerZ: number,
  digitWidth: number,
  digitHeight: number,
  gap: number,
) {
  const totalWidth = digitWidth * 2 + gap
  const startX = centerX - totalWidth / 2
  digits.forEach((digit, index) => {
    const digitCenterX = startX + digitWidth * (index + 0.5) + gap * index
    for (const key of SEGMENT_PATTERNS[digit] ?? []) {
      const [lx1, lx2, ly1, ly2] = SEGMENT_RECTS[key]
      const x1 = digitCenterX + (lx1 - 0.5) * digitWidth
      const x2 = digitCenterX + (lx2 - 0.5) * digitWidth
      const z1 = centerZ + (ly1 - 1) * (digitHeight / 2)
      const z2 = centerZ + (ly2 - 1) * (digitHeight / 2)
      addHorizontalQuad(buffers, x1, x2, z1, z2)
    }
  })
}

// Both headers share one canonical up-direction (+Z) rather than each being
// mirrored to read upright for its own approach: this scene doesn't
// simulate landing direction, and D3's own verification is a top-down
// debug capture checking the digits are legible, not aviation-convention
// correct. 09/27 is a real, physically consistent reciprocal heading pair
// (090°/270°), not an arbitrary choice. Positioned inboard of the threshold
// bars (±226) and clear of the touchdown markers (±105/±72, §1.3).
const HEADING_NUMBER_Z = 195
const HEADING_DIGIT_WIDTH = 5
const HEADING_DIGIT_HEIGHT = 9
const HEADING_DIGIT_GAP = 1.2

/**
 * One merged draw call for every painted marking. Building in XZ directly
 * makes B4 structural: no parent rotation can stand these quads upright.
 */
export function createRunwayMarkingsGeometry() {
  const buffers: QuadBuffers = { positions: [], normals: [], indices: [] }

  for (let z = -234; z <= 234; z += 18) addHorizontalQuad(buffers, -0.36, 0.36, z, z + 9)
  addHorizontalQuad(buffers, -15.35, -14.95, -255, 255)
  addHorizontalQuad(buffers, 14.95, 15.35, -255, 255)

  for (const thresholdZ of [-226, 226]) {
    for (let lane = -5; lane <= 5; lane += 1) {
      const x = lane * 2.35
      addHorizontalQuad(buffers, x - 0.72, x + 0.72, thresholdZ - 4, thresholdZ + 4)
    }
  }
  for (const z of [-105, -72, 72, 105]) {
    addHorizontalQuad(buffers, -9.8, -6.4, z - 0.8, z + 0.8)
    addHorizontalQuad(buffers, 6.4, 9.8, z - 0.8, z + 0.8)
  }

  // D3: heading numbers, "09" and "27" — 090deg/270deg, a real reciprocal
  // pair, painted inboard of each threshold.
  addRunwayHeadingNumber(buffers, [0, 9], 0, -HEADING_NUMBER_Z, HEADING_DIGIT_WIDTH, HEADING_DIGIT_HEIGHT, HEADING_DIGIT_GAP)
  addRunwayHeadingNumber(buffers, [2, 7], 0, HEADING_NUMBER_Z, HEADING_DIGIT_WIDTH, HEADING_DIGIT_HEIGHT, HEADING_DIGIT_GAP)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
