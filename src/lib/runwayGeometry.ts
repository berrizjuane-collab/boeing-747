import { BufferGeometry, Float32BufferAttribute } from 'three'

export const RUNWAY_SURFACE_Y = 0.025
export const RUNWAY_WIDTH = 32
export const RUNWAY_LENGTH = 520
/** Distance of each threshold marking from the runway's z=0 center. */
export const RUNWAY_THRESHOLD_Z = 226

/**
 * plan3.md E4: single source of truth for the airport's static layout, so
 * `airportGroundPlan.ts` can connect taxiways to the same coordinates
 * `RunwayEnvironment.tsx` draws hangars and the apron at, instead of a second
 * hand-copied set of numbers that could silently drift out of sync.
 */
export const APRON = { centerX: -58, centerZ: -45, width: 162, depth: 112 } as const

export const HANGARS = [
  { position: [-105, 6, -35] as const, size: [38, 12, 30] as const, color: '#596168' },
  { position: [-101, 5, 4] as const, size: [30, 10, 24] as const, color: '#697078' },
  { position: [-24, 7, -102] as const, size: [44, 14, 34] as const, color: '#515a62' },
] as const

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
export function createRunwayMarkingsGeometry() {
  const buffers: QuadBuffers = { positions: [], normals: [], indices: [] }

  for (let z = -234; z <= 234; z += 18) addHorizontalQuad(buffers, -0.36, 0.36, z, z + 9)
  addHorizontalQuad(buffers, -15.35, -14.95, -255, 255)
  addHorizontalQuad(buffers, 14.95, 15.35, -255, 255)

  for (const thresholdZ of [-RUNWAY_THRESHOLD_Z, RUNWAY_THRESHOLD_Z]) {
    for (let lane = -5; lane <= 5; lane += 1) {
      const x = lane * 2.35
      addHorizontalQuad(buffers, x - 0.72, x + 0.72, thresholdZ - 4, thresholdZ + 4)
    }
  }
  for (const z of [-105, -72, 72, 105]) {
    addHorizontalQuad(buffers, -9.8, -6.4, z - 0.8, z + 0.8)
    addHorizontalQuad(buffers, 6.4, 9.8, z - 0.8, z + 0.8)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
