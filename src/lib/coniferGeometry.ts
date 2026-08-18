import { BufferGeometry, Color, Float32BufferAttribute } from 'three'

/**
 * plan4.md H1/§3.2: solid instanced conifers, not billboards — the hero's
 * real on-screen scale (§1.4: a 12u pine at 40u reads 326px tall, 5-6x
 * plan3.md's cross-billboard measurement) makes a 2-quad alpha-test cutout
 * read as exactly that, and alpha-test edges are SMAA's worst case (Fase
 * A3). Every triangle here is a distinct, unshared vertex per face
 * (matching three.js's own ConeGeometry convention of one apex vertex per
 * radial segment) so computeVertexNormals() below can't blend a cone's
 * lateral normal against its neighbour — a single shared apex vertex would
 * average to a straight-up (0,1,0) normal at the tip, silently failing the
 * "n.y >= 0.3 across the whole frond" contract this module exists to meet.
 */

interface GeometryBuffers {
  positions: number[]
  colors: number[]
  indices: number[]
}

// bark vs. canopy — same warm/olive family as terrainSurfaceMaps.ts's
// DIRT_BASE/GRASS_BASE (plan4.md §3.1 property 3: "verde oliva contra
// tierra rojiza"), not independently invented colours.
const TRUNK_COLOR = new Color('#4a3626').toArray() as [number, number, number]
const CANOPY_COLOR = new Color('#3f5432').toArray() as [number, number, number]

/**
 * n.y = r / sqrt(r^2 + h^2) for a cone's lateral normal (plan4.md §3.2,
 * derived from the profile line's perpendicular). Solving for r/h at the
 * target n.y=0.4 (comfortably clearing H1's n.y>=0.3 floor and >=0.35 mean
 * with margin for what 8/6/5-segment discretisation does to the continuous
 * formula) gives this ratio — used for every cone in every band so the
 * whole forest reads as one consistent species silhouette rather than
 * freehand-picked proportions per band.
 */
const CANOPY_RADIUS_TO_HEIGHT = 0.44

function addConeLateral(buffers: GeometryBuffers, segments: number, baseY: number, height: number, color: readonly [number, number, number]) {
  const radius = height * CANOPY_RADIUS_TO_HEIGHT
  const apexY = baseY + height
  for (let index = 0; index < segments; index += 1) {
    const angle0 = (index / segments) * Math.PI * 2
    const angle1 = ((index + 1) / segments) * Math.PI * 2
    const first = buffers.positions.length / 3
    buffers.positions.push(
      Math.cos(angle0) * radius, baseY, Math.sin(angle0) * radius,
      Math.cos(angle1) * radius, baseY, Math.sin(angle1) * radius,
      0, apexY, 0,
    )
    for (let vertex = 0; vertex < 3; vertex += 1) buffers.colors.push(...color)
    // (v2-v0) x (v1-v0), not (v1-v0) x (v2-v0): verified numerically against
    // a hand-worked segment (a0=0, a1=90 deg) that the (base0,base1,apex)
    // order computeVertexNormals() would otherwise use points the lateral
    // normal *inward* (negative n.y) — this project's H1 contract needs it
    // pointing outward, so base1/apex are swapped in the index order.
    buffers.indices.push(first, first + 2, first + 1)
  }
}

/** Open-ended prism (no caps — base sits at ground, top is always hidden under the lowest canopy cone), flat-shaded per side via unshared vertices. */
function addPrismSide(buffers: GeometryBuffers, segments: number, radius: number, baseY: number, topY: number, color: readonly [number, number, number]) {
  for (let index = 0; index < segments; index += 1) {
    const angle0 = (index / segments) * Math.PI * 2
    const angle1 = ((index + 1) / segments) * Math.PI * 2
    const first = buffers.positions.length / 3
    buffers.positions.push(
      Math.cos(angle0) * radius, baseY, Math.sin(angle0) * radius,
      Math.cos(angle1) * radius, baseY, Math.sin(angle1) * radius,
      Math.cos(angle1) * radius, topY, Math.sin(angle1) * radius,
      Math.cos(angle0) * radius, topY, Math.sin(angle0) * radius,
    )
    for (let vertex = 0; vertex < 4; vertex += 1) buffers.colors.push(...color)
    // Same outward-winding fix as addConeLateral above, applied to both
    // triangles of this quad.
    buffers.indices.push(first, first + 2, first + 1, first, first + 3, first + 2)
  }
}

function finalizeGeometry(buffers: GeometryBuffers): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(buffers.colors, 3))
  geometry.setIndex(buffers.indices)
  // Safe here specifically because trunk and canopy never share an index
  // (each addXxx call pushes wholly fresh vertices) — no cross-part normal
  // blending at the visual seam, unlike a single shared-vertex mesh would risk.
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

export interface ConiferGeometryResult {
  geometry: BufferGeometry
  /** Vertex index where canopy/frond triangles begin — trunk vertices (if any) precede it. H1's "n.y >= 0.3 across the whole frond" assertion is scoped to [frondVertexStart, end); the trunk itself is a near-horizontal-normal prism by design and isn't part of that contract. 0 for bands with no trunk. */
  frondVertexStart: number
  triangleCount: number
}

function triangleCountOf(buffers: GeometryBuffers): number {
  return buffers.indices.length / 3
}

// plan4.md §3.2's own starting table: near ~36 tris/tree (trunk + 3 stacked
// cones, 8 segments), mid ~14 (2 cones, 6 segments — this build lands at 12,
// close enough that the table's "~" already covers it; see progress4.md),
// far ~5 (1 cone, 5 segments). Total heights (10u/7.5u/8u) share one family
// so near/mid/far read as the same species at different LOD, not three
// different plants.
export function createNearConiferGeometry(): ConiferGeometryResult {
  const buffers: GeometryBuffers = { positions: [], colors: [], indices: [] }
  addPrismSide(buffers, 6, 0.32, 0, 2.0, TRUNK_COLOR)
  const frondVertexStart = buffers.positions.length / 3
  addConeLateral(buffers, 8, 1.6, 4.4, CANOPY_COLOR)
  addConeLateral(buffers, 8, 4.6, 3.5, CANOPY_COLOR)
  addConeLateral(buffers, 8, 7.1, 2.9, CANOPY_COLOR)
  return { geometry: finalizeGeometry(buffers), frondVertexStart, triangleCount: triangleCountOf(buffers) }
}

export function createMidConiferGeometry(): ConiferGeometryResult {
  const buffers: GeometryBuffers = { positions: [], colors: [], indices: [] }
  addConeLateral(buffers, 6, 0, 4.5, CANOPY_COLOR)
  addConeLateral(buffers, 6, 3.0, 4.5, CANOPY_COLOR)
  return { geometry: finalizeGeometry(buffers), frondVertexStart: 0, triangleCount: triangleCountOf(buffers) }
}

export function createFarConiferGeometry(): ConiferGeometryResult {
  const buffers: GeometryBuffers = { positions: [], colors: [], indices: [] }
  addConeLateral(buffers, 5, 0, 8.0, CANOPY_COLOR)
  return { geometry: finalizeGeometry(buffers), frondVertexStart: 0, triangleCount: triangleCountOf(buffers) }
}

export const NEAR_CONIFER_HEIGHT = 10.0
export const MID_CONIFER_HEIGHT = 7.5
export const FAR_CONIFER_HEIGHT = 8.0
