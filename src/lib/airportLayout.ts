import { BufferGeometry, Float32BufferAttribute } from 'three'
import { RUNWAY_LENGTH, RUNWAY_SURFACE_Y, RUNWAY_WIDTH } from './runwayGeometry'

/**
 * Round 5 (plan3.md Fase D, brought forward): the aerodrome ground plan.
 * Every footprint the airport renders at lives here — AirportBuildings.tsx
 * builds meshes from these numbers, aerodromeKeepOut.ts builds the
 * vegetation exclusion from the same numbers, and RunwayEnvironment.tsx
 * re-exports the four names the round-4 tests import (HANGARS, APRON,
 * CONTROL_TOWER_POSITION, CONTROL_TOWER_ROOF_RADIUS) so nothing re-types a
 * coordinate.
 *
 * Composition is authored against the S1 hero camera (cameraPath.ts
 * KEYFRAMES[0]: [60, 8, 55] looking at [0, 6, 0], view azimuth ≈ −137.5°,
 * horizontal half-FOV ≈ 34° at 1440×900): the terminal spans the left
 * third behind the tail, the control tower rises just right of centre
 * behind the wing root, the hangar row sits right of centre behind the
 * nose, and the forest (forestPlacement.ts) closes the horizon behind all
 * of it. The parallel taxiway and its links keep the whole west strip from
 * reading as a bare plane in S2's high tracking shot.
 */
export interface Hangar {
  position: readonly [number, number, number]
  size: readonly [number, number, number]
  color: string
  doorColor: string
}

export const HANGARS: readonly Hangar[] = [
  { position: [-82, 7, -150] as const, size: [48, 14, 38] as const, color: '#8a9096', doorColor: '#b7bcc0' },
  { position: [-144, 7, -150] as const, size: [48, 14, 38] as const, color: '#7f868d', doorColor: '#aeb4b8' },
  { position: [-206, 6, -160] as const, size: [40, 12, 32] as const, color: '#858c92', doorColor: '#b2b8bc' },
]

/** Concrete stand area between the parallel taxiway and the terminal. */
export const APRON = { position: [-104, 0.012, -31.5] as const, size: [102, 129] as const }

export const TAXIWAY = { x: -46, width: 14, length: 480, surfaceY: 0.014 } as const
/** Perpendicular links from the runway's west edge to the parallel taxiway. */
export const TAXIWAY_LINKS: readonly { z: number; width: number }[] = [
  { z: -222, width: 14 },
  { z: -118, width: 14 },
  { z: 34, width: 14 },
  { z: 192, width: 14 },
]

export const TERMINAL = {
  position: [-178, 0, -37] as const,
  /** width (x), height, depth (z) */
  size: [44, 15, 118] as const,
} as const
/** Jet bridges leave the terminal's east face at these z. */
export const JET_BRIDGE_Z: readonly number[] = [-84, -46, -8]

export const CONTROL_TOWER_POSITION = [-100, 0, -108] as const
export const CONTROL_TOWER_HEIGHT = 46
/** Widest radial extent (the cab's floor rim) — the footprint the keep-out needs. */
export const CONTROL_TOWER_ROOF_RADIUS = 7

export const FUEL_FARM = { position: [-176, 0, 56] as const, tankRadius: 5.5, tankHeight: 9, count: 2 } as const

export const FLOODLIGHT_MASTS: readonly (readonly [number, number])[] = [
  [-58, -92],
  [-58, 28],
  [-150, -92],
  [-150, 28],
]

export const WINDSOCK_POSITION = [27, 0, -66] as const

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** Every built footprint, for the keep-out union. */
export function airportFootprints(): Rect[] {
  const rects: Rect[] = [
    { minX: -33, maxX: -20, minZ: 178, maxZ: 182 },
    { minX: 20, maxX: 33, minZ: -182, maxZ: -178 },
    { minX: -RUNWAY_WIDTH / 2, maxX: RUNWAY_WIDTH / 2, minZ: -RUNWAY_LENGTH / 2, maxZ: RUNWAY_LENGTH / 2 },
    { minX: TAXIWAY.x - TAXIWAY.width / 2, maxX: TAXIWAY.x + TAXIWAY.width / 2, minZ: -TAXIWAY.length / 2, maxZ: TAXIWAY.length / 2 },
    {
      minX: APRON.position[0] - APRON.size[0] / 2,
      maxX: APRON.position[0] + APRON.size[0] / 2,
      minZ: APRON.position[2] - APRON.size[1] / 2,
      maxZ: APRON.position[2] + APRON.size[1] / 2,
    },
    {
      minX: TERMINAL.position[0] - TERMINAL.size[0] / 2,
      maxX: TERMINAL.position[0] + TERMINAL.size[0] / 2,
      minZ: TERMINAL.position[2] - TERMINAL.size[2] / 2,
      maxZ: TERMINAL.position[2] + TERMINAL.size[2] / 2,
    },
    {
      minX: CONTROL_TOWER_POSITION[0] - CONTROL_TOWER_ROOF_RADIUS,
      maxX: CONTROL_TOWER_POSITION[0] + CONTROL_TOWER_ROOF_RADIUS,
      minZ: CONTROL_TOWER_POSITION[2] - CONTROL_TOWER_ROOF_RADIUS,
      maxZ: CONTROL_TOWER_POSITION[2] + CONTROL_TOWER_ROOF_RADIUS,
    },
    {
      minX: FUEL_FARM.position[0] - FUEL_FARM.tankRadius * 3,
      maxX: FUEL_FARM.position[0] + FUEL_FARM.tankRadius * 3,
      minZ: FUEL_FARM.position[2] - FUEL_FARM.tankRadius * 1.5,
      maxZ: FUEL_FARM.position[2] + FUEL_FARM.tankRadius * 1.5,
    },
  ]
  for (const hangar of HANGARS) {
    const [width, , depth] = hangar.size
    const [x, , z] = hangar.position
    rects.push({ minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 })
  }
  return rects
}

interface QuadBuffers {
  positions: number[]
  normals: number[]
  indices: number[]
}

function addHorizontalQuad(buffers: QuadBuffers, x1: number, x2: number, z1: number, z2: number, y: number) {
  const first = buffers.positions.length / 3
  buffers.positions.push(x1, y, z1, x1, y, z2, x2, y, z2, x2, y, z1)
  buffers.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  buffers.indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
}

const MARKING_Y = RUNWAY_SURFACE_Y + 0.004

/**
 * One merged draw call for every painted taxiway/apron marking: taxiway
 * centreline, link centrelines, apron edge line, three stand lead-in
 * lines with stop bars. Flat XZ quads, +Y normals, same contract as
 * runwayGeometry.ts's runway markings (tests/environment.test.mjs B4).
 */
export function createAirportMarkingsGeometry(): BufferGeometry {
  const buffers: QuadBuffers = { positions: [], normals: [], indices: [] }
  const half = 0.28

  // Parallel taxiway centreline.
  addHorizontalQuad(buffers, TAXIWAY.x - half, TAXIWAY.x + half, -TAXIWAY.length / 2 + 4, TAXIWAY.length / 2 - 4, MARKING_Y)
  // Link centrelines from the taxiway to the runway edge.
  for (const link of TAXIWAY_LINKS) {
    addHorizontalQuad(buffers, TAXIWAY.x, -RUNWAY_WIDTH / 2 - 1.5, link.z - half, link.z + half, MARKING_Y)
  }
  // Apron edge line along the taxiway side.
  const apronEast = APRON.position[0] + APRON.size[0] / 2 - 1.2
  const apronNorth = APRON.position[2] - APRON.size[1] / 2 + 2
  const apronSouth = APRON.position[2] + APRON.size[1] / 2 - 2
  addHorizontalQuad(buffers, apronEast - half, apronEast + half, apronNorth, apronSouth, MARKING_Y)
  // Stand lead-in lines + stop bars in front of each jet bridge.
  for (const z of JET_BRIDGE_Z) {
    const standEnd = TERMINAL.position[0] + TERMINAL.size[0] / 2 + 26
    addHorizontalQuad(buffers, apronEast, standEnd, z - half, z + half, MARKING_Y)
    addHorizontalQuad(buffers, standEnd - half, standEnd + half, z - 6, z + 6, MARKING_Y)
    // Stand safety box.
    for (const edgeZ of [z - 22, z + 22]) addHorizontalQuad(buffers, standEnd - 2, apronEast - 8, edgeZ - half, edgeZ + half, MARKING_Y)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}

export interface AirfieldLight {
  x: number
  z: number
  color: string
}

/**
 * Runway edge (white), threshold (green), centreline (white) and taxiway
 * edge (blue) lights — one instanced draw call in AirportBuildings.tsx.
 */
export function airfieldLights(): AirfieldLight[] {
  const lights: AirfieldLight[] = []
  const halfLength = RUNWAY_LENGTH / 2
  for (let z = -halfLength + 10; z <= halfLength - 10; z += 50) {
    lights.push({ x: -RUNWAY_WIDTH / 2 - 1.5, z, color: '#fff4d6' })
    lights.push({ x: RUNWAY_WIDTH / 2 + 1.5, z, color: '#fff4d6' })
  }
  for (const z of [-halfLength - 2, halfLength + 2]) {
    for (let x = -14; x <= 14; x += 4) lights.push({ x, z, color: '#5cff8a' })
  }
  for (let z = -halfLength + 20; z <= halfLength - 20; z += 40) lights.push({ x: 0, z, color: '#fff4d6' })
  for (let z = -TAXIWAY.length / 2 + 10; z <= TAXIWAY.length / 2 - 10; z += 40) {
    lights.push({ x: TAXIWAY.x - TAXIWAY.width / 2 - 1, z, color: '#5a8cff' })
    lights.push({ x: TAXIWAY.x + TAXIWAY.width / 2 + 1, z, color: '#5a8cff' })
  }
  return lights
}
