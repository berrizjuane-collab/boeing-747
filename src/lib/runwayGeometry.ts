import { BufferGeometry, Float32BufferAttribute } from 'three'

export const RUNWAY_SURFACE_Y = 0.025

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

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
