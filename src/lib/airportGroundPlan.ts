import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { addHorizontalQuad, RUNWAY_WIDTH, type QuadBuffers } from './runwayGeometry'

/**
 * plan3.md Fase E piece 2 / D5: taxiways connecting the runway to the apron
 * and hangar cluster (RunwayEnvironment.tsx's HANGARS/apron), mirroring
 * runwayGeometry.ts's pattern exactly — one merged draw call, every vertex
 * flush with the runway's own paint layer, vertex colors standing in for a
 * second material so pavement and centerline paint stay in the same buffer
 * (B4's exact contract, asserted again in tests/environment.test.mjs).
 *
 * Layout: a short connector bridges the runway's west edge to the apron,
 * and a longer spine runs north-south along the near edge of the apron/
 * hangar footprint. Both are plain non-overlapping strips (pavement either
 * side of a solid centerline stripe) rather than pavement-with-paint-on-top,
 * so nothing needs a Y offset or polygonOffset to avoid z-fighting — the
 * strategy the runway itself uses for asphalt-vs-marking, unavailable here
 * since this is one material/one vertex-colored mesh, not two.
 */
export const TAXIWAY_TOUCH_X = -RUNWAY_WIDTH / 2 // -16: shared edge with the runway
const CONNECTOR_Z_CENTER = -40
const CONNECTOR_HALF_WIDTH = 5
export const TAXIWAY_TOUCH_Z_RANGE = [CONNECTOR_Z_CENTER - CONNECTOR_HALF_WIDTH, CONNECTOR_Z_CENTER + CONNECTOR_HALF_WIDTH] as const

const CONNECTOR_APRON_X = -24
const SPINE_X_CENTER = -30
const SPINE_HALF_WIDTH = 6
// Clears HANGARS[2]'s footprint (position [-24,7,-102], size [44,14,34] ->
// z in [-119,-85]) so the taxiway doesn't run under a building.
const SPINE_Z_MIN = -84
const SPINE_Z_MAX = 40

const PAVEMENT_COLOR = new Color('#43494d')
const CENTERLINE_COLOR = new Color('#e8c547')
const CENTERLINE_HALF_WIDTH = 0.15

interface ColoredQuadBuffers extends QuadBuffers {
  colors: number[]
}

function addColoredQuad(buffers: ColoredQuadBuffers, x1: number, x2: number, z1: number, z2: number, color: Color) {
  const firstIndex = buffers.colors.length / 3
  addHorizontalQuad(buffers, x1, x2, z1, z2)
  for (let vertex = 0; vertex < 4; vertex += 1) buffers.colors.push(color.r, color.g, color.b)
  return firstIndex
}

/** A strip whose length runs along X (centerline splits the Z cross-section). */
function addStripAlongX(buffers: ColoredQuadBuffers, x1: number, x2: number, zCenter: number, halfWidth: number) {
  const inner0 = zCenter - CENTERLINE_HALF_WIDTH
  const inner1 = zCenter + CENTERLINE_HALF_WIDTH
  addColoredQuad(buffers, x1, x2, zCenter - halfWidth, inner0, PAVEMENT_COLOR)
  addColoredQuad(buffers, x1, x2, inner0, inner1, CENTERLINE_COLOR)
  addColoredQuad(buffers, x1, x2, inner1, zCenter + halfWidth, PAVEMENT_COLOR)
}

/** A strip whose length runs along Z (centerline splits the X cross-section). */
function addStripAlongZ(buffers: ColoredQuadBuffers, xCenter: number, halfWidth: number, z1: number, z2: number) {
  const inner0 = xCenter - CENTERLINE_HALF_WIDTH
  const inner1 = xCenter + CENTERLINE_HALF_WIDTH
  addColoredQuad(buffers, xCenter - halfWidth, inner0, z1, z2, PAVEMENT_COLOR)
  addColoredQuad(buffers, inner0, inner1, z1, z2, CENTERLINE_COLOR)
  addColoredQuad(buffers, inner1, xCenter + halfWidth, z1, z2, PAVEMENT_COLOR)
}

export function createAirportGroundPlanGeometry() {
  const buffers: ColoredQuadBuffers = { positions: [], normals: [], indices: [], colors: [] }

  // Connector: runway west edge -> apron, along X. x1 is exactly the
  // runway's own edge, so this strip shares that vertex line with it.
  addStripAlongX(buffers, TAXIWAY_TOUCH_X, CONNECTOR_APRON_X, CONNECTOR_Z_CENTER, CONNECTOR_HALF_WIDTH)
  // Spine: parallel taxiway serving the apron/hangar cluster, along Z. Meets
  // the connector edge-to-edge at x = CONNECTOR_APRON_X (= SPINE_X_CENTER +
  // SPINE_HALF_WIDTH), inside the connector's own Z span.
  addStripAlongZ(buffers, SPINE_X_CENTER, SPINE_HALF_WIDTH, SPINE_Z_MIN, SPINE_Z_MAX)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(buffers.colors, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
