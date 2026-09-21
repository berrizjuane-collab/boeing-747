import { BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * plan4.md §3.2 / H1: solid instanced tree geometry in three detail levels
 * — no billboards. Every factory returns ONE merged, non-indexed
 * BufferGeometry carrying, besides position/normal/uv:
 *
 * - `color`    — a baked ambient-occlusion multiplier (dark at the base of
 *                each tier, bright at its tip) that `vertexColors: true`
 *                multiplies against the per-instance foliage colour.
 * - `aFoliage` — 1.0 on foliage vertices, 0.0 on trunk vertices; the forest
 *                material (forestMaterial.ts) mixes a trunk colour uniform in
 *                for the latter so trunk and crown share one draw call.
 *
 * Cones are open-ended: a base cap would carry an `n.y = -1` normal and
 * fail the frond-normal contract (`n.y >= 0.3` on every foliage vertex,
 * plan4.md §3.4's corrected C1 criterion — a cone's lateral normal is
 * mostly horizontal, but never negative and never exactly zero the way the
 * old crossed-triangle grass "trees" were).
 */
export type TreeLod = 'near' | 'mid' | 'far'

interface TierSpec {
  radius: number
  height: number
  baseY: number
  segments: number
}

const CONIFER_TIERS: Record<TreeLod, readonly TierSpec[]> = {
  near: [
    { radius: 2.7, height: 4.4, baseY: 2.1, segments: 8 },
    { radius: 2.05, height: 4.0, baseY: 4.9, segments: 8 },
    { radius: 1.35, height: 3.9, baseY: 7.5, segments: 8 },
  ],
  mid: [
    { radius: 2.9, height: 6.2, baseY: 1.8, segments: 6 },
    { radius: 1.9, height: 5.0, baseY: 6.4, segments: 6 },
  ],
  far: [{ radius: 3.2, height: 10.4, baseY: 0, segments: 5 }],
}

const CONIFER_TRUNK: Record<TreeLod, { radiusTop: number; radiusBottom: number; height: number; segments: number } | null> = {
  near: { radiusTop: 0.2, radiusBottom: 0.4, height: 3.4, segments: 6 },
  mid: { radiusTop: 0.22, radiusBottom: 0.38, height: 2.6, segments: 5 },
  far: null,
}

function tag(geometry: BufferGeometry, foliage: number, aoBottom: number, aoTop: number, minY: number, maxY: number) {
  const position = geometry.getAttribute('position')
  const count = position.count
  const color = new Float32Array(count * 3)
  const foliageAttribute = new Float32Array(count)
  const span = Math.max(1e-6, maxY - minY)
  for (let index = 0; index < count; index += 1) {
    const t = Math.min(1, Math.max(0, (position.getY(index) - minY) / span))
    const ao = aoBottom + (aoTop - aoBottom) * t
    color[index * 3] = ao
    color[index * 3 + 1] = ao
    color[index * 3 + 2] = ao
    foliageAttribute[index] = foliage
  }
  geometry.setAttribute('color', new Float32BufferAttribute(color, 3))
  geometry.setAttribute('aFoliage', new Float32BufferAttribute(foliageAttribute, 1))
  return geometry
}

function trunk(spec: { radiusTop: number; radiusBottom: number; height: number; segments: number }, baseY = -0.3) {
  const geometry = new CylinderGeometry(spec.radiusTop, spec.radiusBottom, spec.height, spec.segments, 1, true)
  geometry.translate(0, baseY + spec.height / 2, 0)
  return tag(geometry.toNonIndexed(), 0, 0.6, 1, baseY, baseY + spec.height)
}

function coneTier(tier: TierSpec, irregular = false) {
  const geometry = new ConeGeometry(tier.radius, tier.height, tier.segments, 1, true)
  if (irregular) {
    const p = geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i))
      const scale = 1 + .12 * Math.sin(3 * a + tier.baseY) + .055 * Math.cos(5 * a)
      p.setXYZ(i, p.getX(i) * scale, p.getY(i), p.getZ(i) * scale)
    }
    // Keep the authored sky-facing normals: foliage is a cluster, not a smooth cone.
  }
  geometry.translate(0, tier.baseY + tier.height / 2, 0)
  return tag(geometry.toNonIndexed(), 1, 0.5, 1.05, tier.baseY, tier.baseY + tier.height)
}

function merge(parts: BufferGeometry[]) {
  const merged = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  if (!merged) throw new Error('Tree geometry merge failed — attribute sets must match across parts')
  merged.computeBoundingSphere()
  return merged
}

/** Conifer: prismatic trunk + stacked open cones (3 near, 2 mid, 1 far). */
export function createConiferGeometry(lod: TreeLod): BufferGeometry {
  const parts: BufferGeometry[] = []
  const trunkSpec = CONIFER_TRUNK[lod]
  if (trunkSpec) parts.push(trunk(trunkSpec))
  for (const tier of CONIFER_TIERS[lod]) parts.push(coneTier(tier, lod === 'near'))
  return merge(parts)
}

interface BlobSpec {
  radius: number
  center: readonly [number, number, number]
}

const BROADLEAF_BLOBS: readonly BlobSpec[] = [
  { radius: 2.7, center: [0, 5.2, 0] },
  { radius: 2.0, center: [1.6, 4.5, 0.7] },
  { radius: 1.85, center: [-1.5, 4.8, -0.9] },
  { radius: 1.7, center: [0.3, 6.9, 0.3] },
]

/** Broadleaf: trunk + four overlapping low-segment spheres (smooth normals, all with a real +Y share on the upper half). */
export function createBroadleafGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [trunk({ radiusTop: 0.26, radiusBottom: 0.44, height: 4.2, segments: 6 })]
  for (const blob of BROADLEAF_BLOBS) {
    const sphere = new SphereGeometry(blob.radius, 6, 4)
    sphere.scale(1, 0.82, 1)
    sphere.translate(blob.center[0], blob.center[1], blob.center[2])
    const minY = blob.center[1] - blob.radius * 0.82
    const maxY = blob.center[1] + blob.radius * 0.82
    parts.push(tag(sphere.toNonIndexed(), 1, 0.42, 1.08, minY, maxY))
  }
  return merge(parts)
}

/** Low shrub for the near band: three flattened blobs, no trunk. */
export function createShrubGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (const blob of [
    { radius: 1.0, center: [0, 0.55, 0] as const },
    { radius: 0.8, center: [0.75, 0.45, 0.35] as const },
    { radius: 0.7, center: [-0.6, 0.5, -0.45] as const },
  ]) {
    const sphere = new SphereGeometry(blob.radius, 5, 3)
    sphere.scale(1, 0.7, 1)
    sphere.translate(blob.center[0], blob.center[1], blob.center[2])
    parts.push(tag(sphere.toNonIndexed(), 1, 0.45, 1.05, blob.center[1] - blob.radius * 0.7, blob.center[1] + blob.radius * 0.7))
  }
  return merge(parts)
}

export interface FoliageNormalStats {
  foliageVertexCount: number
  minFoliageNormalY: number
  meanFoliageNormalY: number
}

/** Pure inspection helper for the H1 normal contract (tests/plan5.test.mjs). */
export function foliageNormalStats(geometry: BufferGeometry): FoliageNormalStats {
  const normal = geometry.getAttribute('normal')
  const foliage = geometry.getAttribute('aFoliage')
  let count = 0
  let min = Number.POSITIVE_INFINITY
  let sum = 0
  for (let index = 0; index < normal.count; index += 1) {
    if (foliage.getX(index) < 0.5) continue
    const y = normal.getY(index)
    count += 1
    min = Math.min(min, y)
    sum += y
  }
  return { foliageVertexCount: count, minFoliageNormalY: count ? min : 0, meanFoliageNormalY: count ? sum / count : 0 }
}

export function triangleCount(geometry: BufferGeometry): number {
  return Math.round((geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3)
}
