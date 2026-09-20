// plan6 5.2 / A19 — measure the exterior asset's surface data instead of
// asserting it is fine because a procedural normal map was layered on top.
//
// ASSET_AUDIT.md records that the source has overlapping and degenerate UVs.
// Round 5 added procedural roughness and normal maps, which the round-6
// audit correctly pointed out does not demonstrate the UVs were fixed. This
// reports what is actually in the shipped GLB: degenerate UV triangles,
// texel-density spread across the hull, non-unit or NaN normals, and how
// much of the UV square is covered more than once.
//
//   node scripts/audit-exterior-surface.mjs [--out docs/evidence/round7/exterior-surface.json]

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const outIndex = process.argv.indexOf('--out')
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : 'docs/evidence/round7/exterior-surface.json'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const document = await io.read('public/models/exterior.glb')

const GRID = 128
const coverage = new Uint16Array(GRID * GRID)

const report = { file: 'public/models/exterior.glb', meshes: [], totals: {} }
let totalTriangles = 0
let degenerateUv = 0
let missingUv = 0
let badNormals = 0
const densities = []

for (const node of document.getRoot().listNodes()) {
  const mesh = node.getMesh()
  if (!mesh) continue
  for (const primitive of mesh.listPrimitives()) {
    const position = primitive.getAttribute('POSITION')
    const uv = primitive.getAttribute('TEXCOORD_0')
    const normal = primitive.getAttribute('NORMAL')
    const indices = primitive.getIndices()
    const count = indices ? indices.getCount() : position.getCount()
    const entry = { node: node.getName(), triangles: count / 3, hasUv: Boolean(uv), hasNormal: Boolean(normal) }

    if (normal) {
      for (let i = 0; i < normal.getCount(); i += 1) {
        const n = normal.getElement(i, [])
        const length = Math.hypot(n[0], n[1], n[2])
        if (!Number.isFinite(length) || Math.abs(length - 1) > 0.05) badNormals += 1
      }
    }

    for (let i = 0; i < count; i += 3) {
      totalTriangles += 1
      const tri = [0, 1, 2].map((k) => (indices ? indices.getScalar(i + k) : i + k))
      const p = tri.map((index) => position.getElement(index, []))
      const worldArea =
        0.5 *
        Math.hypot(
          (p[1][1] - p[0][1]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][1] - p[0][1]),
          (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]),
          (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]),
        )

      if (!uv) {
        missingUv += 1
        continue
      }
      const t = tri.map((index) => uv.getElement(index, []))
      const uvArea = Math.abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) / 2
      if (uvArea < 1e-12) {
        degenerateUv += 1
        continue
      }
      if (worldArea > 1e-9) densities.push(Math.sqrt(uvArea / worldArea))

      // Coverage: stamp the triangle's UV bounding box. A bounding box
      // over-counts, so this is an upper bound on overlap — reported as
      // such rather than as a measured overlap figure.
      const minU = Math.max(0, Math.min(t[0][0], t[1][0], t[2][0]))
      const maxU = Math.min(1, Math.max(t[0][0], t[1][0], t[2][0]))
      const minV = Math.max(0, Math.min(t[0][1], t[1][1], t[2][1]))
      const maxV = Math.min(1, Math.max(t[0][1], t[1][1], t[2][1]))
      for (let gv = Math.floor(minV * GRID); gv <= Math.floor(maxV * GRID) && gv < GRID; gv += 1) {
        for (let gu = Math.floor(minU * GRID); gu <= Math.floor(maxU * GRID) && gu < GRID; gu += 1) {
          if (gu >= 0 && gv >= 0) coverage[gv * GRID + gu] = Math.min(65535, coverage[gv * GRID + gu] + 1)
        }
      }
    }
    report.meshes.push(entry)
  }
}

densities.sort((a, b) => a - b)
const quantile = (q) => (densities.length ? densities[Math.min(densities.length - 1, Math.floor(q * densities.length))] : null)
let covered = 0
let multiplyCovered = 0
for (const cell of coverage) {
  if (cell > 0) covered += 1
  if (cell > 1) multiplyCovered += 1
}

report.totals = {
  triangles: totalTriangles,
  trianglesWithoutUv: missingUv,
  degenerateUvTriangles: degenerateUv,
  degenerateUvShare: totalTriangles ? degenerateUv / totalTriangles : 0,
  nonUnitNormals: badNormals,
  texelDensity: {
    unit: 'uv units per world unit',
    p05: quantile(0.05),
    p50: quantile(0.5),
    p95: quantile(0.95),
    // How uneven the texturing is across the hull. A ratio near 1 means one
    // texel covers about the same area everywhere; large values mean some
    // regions get far more texture than others, which is what shows up as
    // a seam between a crisp panel and a blurred one.
    spreadP95OverP05: quantile(0.05) ? quantile(0.95) / quantile(0.05) : null,
  },
  uvCoverage: {
    grid: GRID,
    occupiedCells: covered,
    occupiedShare: covered / (GRID * GRID),
    cellsCoveredMoreThanOnce: multiplyCovered,
    overlapUpperBound: covered ? multiplyCovered / covered : 0,
    note: 'Triangles are stamped by UV bounding box, so overlap is an upper bound, not a measured figure.',
  },
}

await mkdir(dirname(outPath), { recursive: true })
await writeFile(outPath, `${JSON.stringify(report.totals, null, 2)}\n`)
console.log(JSON.stringify(report.totals, null, 2))
