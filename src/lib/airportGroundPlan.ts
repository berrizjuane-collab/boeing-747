import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { APRON, HANGARS, RUNWAY_SURFACE_Y, RUNWAY_THRESHOLD_Z, RUNWAY_WIDTH } from './runwayGeometry'

interface ColoredQuadBuffers {
  positions: number[]
  normals: number[]
  colors: number[]
  indices: number[]
}

const ASPHALT = new Color('#3d444a')
const CENTERLINE = new Color('#d9c66a')
const HOLD_MARKING = new Color('#e9e5d8')
const PARCEL_LINE = new Color('#7d858c')

/** Adds a world-XZ quad whose winding and normals both face +Y — same
 * B4-safe pattern as runwayGeometry.ts's addHorizontalQuad, extended with a
 * per-quad vertex color so one merged draw call can still tell asphalt from
 * paint. */
function addColoredQuad(buffers: ColoredQuadBuffers, x1: number, x2: number, z1: number, z2: number, color: Color) {
  const first = buffers.positions.length / 3
  buffers.positions.push(x1, RUNWAY_SURFACE_Y, z1, x1, RUNWAY_SURFACE_Y, z2, x2, RUNWAY_SURFACE_Y, z2, x2, RUNWAY_SURFACE_Y, z1)
  buffers.normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0)
  for (let i = 0; i < 4; i += 1) buffers.colors.push(color.r, color.g, color.b)
  buffers.indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
}

/** Thin rectangular outline (4 strips), used for the apron border and each hangar's parcel line. */
function addRectOutline(
  buffers: ColoredQuadBuffers,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  thickness: number,
  color: Color,
) {
  const halfW = width / 2
  const halfD = depth / 2
  addColoredQuad(buffers, centerX - halfW, centerX + halfW, centerZ - halfD, centerZ - halfD + thickness, color)
  addColoredQuad(buffers, centerX - halfW, centerX + halfW, centerZ + halfD - thickness, centerZ + halfD, color)
  addColoredQuad(buffers, centerX - halfW, centerX - halfW + thickness, centerZ - halfD, centerZ + halfD, color)
  addColoredQuad(buffers, centerX + halfW - thickness, centerX + halfW, centerZ - halfD, centerZ + halfD, color)
}

const RUNWAY_WEST_EDGE_X = -RUNWAY_WIDTH / 2
export const TAXIWAY_INNER_X = RUNWAY_WEST_EDGE_X - 14
export const TAXIWAY_OUTER_X = RUNWAY_WEST_EDGE_X - 24
/** Where the runway-connector spur meets the runway edge — E4's "toca el
 * umbral" anchor: this point sits exactly on the runway's own west edge,
 * straddling RUNWAY_THRESHOLD_Z, importing both constants rather than
 * re-deriving them so the two geometries can never drift apart. */
export const TAXIWAY_RUNWAY_JUNCTION = { x: RUNWAY_WEST_EDGE_X, z: RUNWAY_THRESHOLD_Z } as const

/**
 * plan3.md E4: one merged draw call for every painted/paved airport-ground
 * feature that isn't the runway itself — taxiways, apron border, holding
 * point, and parcel boundaries. Building in XZ directly (mirroring
 * runwayGeometry.ts's own pattern) makes the B4-style flatness test
 * structural rather than a promise: no parent transform can tilt this.
 */
export function createAirportGroundPlanGeometry() {
  const buffers: ColoredQuadBuffers = { positions: [], normals: [], colors: [], indices: [] }

  // Parallel taxiway: runs the length of the runway's west side, from the
  // threshold (touches RUNWAY_THRESHOLD_Z, see TAXIWAY_RUNWAY_JUNCTION) down
  // past the apron to hangar 3's plot.
  addColoredQuad(buffers, TAXIWAY_OUTER_X, TAXIWAY_INNER_X, -112, RUNWAY_THRESHOLD_Z + 6, ASPHALT)
  addColoredQuad(buffers, TAXIWAY_OUTER_X + 3.5, TAXIWAY_OUTER_X + 4.3, -112, RUNWAY_THRESHOLD_Z + 6, CENTERLINE)

  // Connector spur: parallel taxiway -> runway edge, straddling the threshold.
  addColoredQuad(
    buffers,
    TAXIWAY_RUNWAY_JUNCTION.x,
    TAXIWAY_INNER_X,
    TAXIWAY_RUNWAY_JUNCTION.z - 6,
    TAXIWAY_RUNWAY_JUNCTION.z + 6,
    ASPHALT,
  )

  // Holding point: a double bar across the spur, short of the runway edge —
  // the "puntos de espera" an aircraft would stop at before entering.
  const holdX = TAXIWAY_RUNWAY_JUNCTION.x + 5.5
  addColoredQuad(buffers, holdX, holdX + 0.35, TAXIWAY_RUNWAY_JUNCTION.z - 6, TAXIWAY_RUNWAY_JUNCTION.z + 6, HOLD_MARKING)
  addColoredQuad(buffers, holdX + 1.1, holdX + 1.45, TAXIWAY_RUNWAY_JUNCTION.z - 6, TAXIWAY_RUNWAY_JUNCTION.z + 6, HOLD_MARKING)

  // Apron border: painted edge line around the apron footprint declared in
  // runwayGeometry.ts, inset half a unit so it reads as a line, not a fill.
  addRectOutline(buffers, APRON.centerX, APRON.centerZ, APRON.width - 1, APRON.depth - 1, 0.5, CENTERLINE)

  // Parcel boundaries: a generous outline around each hangar's footprint.
  for (const hangar of HANGARS) {
    const [width, , depth] = hangar.size
    addRectOutline(buffers, hangar.position[0], hangar.position[2], width + 12, depth + 12, 0.4, PARCEL_LINE)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(buffers.colors, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
