import { BufferGeometry, Float32BufferAttribute } from 'three'

export const RUNWAY_SURFACE_Y = 0.025

// plan4.md bug #16: the physical runway box (RunwayEnvironment.tsx's
// asphalt boxGeometry) used to declare these as private local constants
// duplicating what this module's marking geometry already assumes about
// the runway's footprint. Exported here so anything that needs the
// aerodrome's real extents (the terrain keep-out in aerodromeKeepOut.ts,
// the airport ground plan of a later round) imports the same two numbers
// instead of re-typing them.
export const RUNWAY_WIDTH = 32
export const RUNWAY_LENGTH = 520

interface QuadBuffers {
  positions: number[]
  normals: number[]
  indices: number[]
}

/** Adds a world-XZ quad whose winding and normals both face +Y. */
function addHorizontalQuad(buffers: QuadBuffers, x1: number, x2: number, z1: number, z2: number) {
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

/**
 * One merged draw call for every painted marking. Building in XZ directly
 * makes B4 structural: no parent rotation can stand these quads upright.
 */
// North is -Z in this fictional airport. Reciprocal designators share the
// painted mesh (no text texture, depth offset or extra draw call).
export const RUNWAY_DESIGNATORS = [{ text: '36', z: 204, direction: 1 }, { text: '18', z: -204, direction: -1 }] as const
const DIGITS: Record<string, string[]> = {
  '1': ['010', '110', '010', '010', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '8': ['111', '101', '111', '101', '111'],
}
export function createRunwayMarkingsGeometry() {
  const buffers: QuadBuffers = { positions: [], normals: [], indices: [] }

  for (let z = -180; z <= 180; z += 18) addHorizontalQuad(buffers, -0.36, 0.36, z, z + 9)
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

  for (const end of RUNWAY_DESIGNATORS) {
    [...end.text].forEach((digit, d) => DIGITS[digit].forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel !== '1') return
        const cx = (d * 4 + x - 3) * 1.2 * end.direction
        const cz = end.z + (y - 2) * 2.2 * end.direction
        addHorizontalQuad(buffers, cx - .6, cx + .6, cz - 1.1, cz + 1.1)
      })
    }))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
