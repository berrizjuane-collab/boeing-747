import { BufferGeometry, Float32BufferAttribute } from 'three'

interface TreeBuffers {
  positions: number[]
  normals: number[]
  colors: number[]
  indices: number[]
}

/**
 * Crossed vertical quads — the same "billboard blade" technique
 * createGrassClumpGeometry (RunwayEnvironment.tsx) uses, generalized to N
 * blades and an explicit height range so it can build both a trunk and a
 * canopy. Every normal is faked toward up rather than each quad's true
 * (horizontal) face normal: thin vertical geometry under an overhead-
 * dominant light rig reads as unlit black otherwise (grass's own root
 * cause). `upWeight` controls how strongly — canopy leans further toward
 * up than the trunk, since it's the part that has to read as sunlit
 * foliage; the trunk keeps more of its true side-shading.
 */
function pushCrossedBlades(
  buffers: TreeBuffers,
  bladeCount: number,
  halfWidth: number,
  yBottom: number,
  yTop: number,
  color: readonly [number, number, number],
  outwardWeight: number,
  upWeight: number,
) {
  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const length = Math.hypot(sin * outwardWeight, upWeight, cos * outwardWeight)
    const nx = (sin * outwardWeight) / length
    const ny = upWeight / length
    const nz = (cos * outwardWeight) / length

    const first = buffers.positions.length / 3
    for (const [x, y] of [[-halfWidth, yBottom], [halfWidth, yBottom], [halfWidth, yTop], [-halfWidth, yTop]] as const) {
      buffers.positions.push(x * cos, y, -x * sin)
      buffers.normals.push(nx, ny, nz)
      buffers.colors.push(color[0], color[1], color[2])
    }
    buffers.indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }
}

const TRUNK_COLOR = [0.29, 0.22, 0.15] as const
const CANOPY_COLOR = [0.16, 0.27, 0.14] as const

/**
 * plan3.md C1/C4: one low-poly instanced tree — 2 crossed trunk quads, 3
 * crossed canopy quads (14 triangles total). Vertex colors distinguish
 * trunk from canopy within a single instance; per-instance color (set by
 * the component, like VegetationBands does) multiplies on top for
 * tree-to-tree variation.
 */
export function createTreeClumpGeometry() {
  const buffers: TreeBuffers = { positions: [], normals: [], colors: [], indices: [] }

  pushCrossedBlades(buffers, 2, 0.045, 0, 0.34, TRUNK_COLOR, 0.55, 0.6)
  pushCrossedBlades(buffers, 3, 0.34, 0.28, 1, CANOPY_COLOR, 0.25, 0.75)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(buffers.positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(buffers.normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(buffers.colors, 3))
  geometry.setIndex(buffers.indices)
  geometry.computeBoundingSphere()
  return geometry
}
