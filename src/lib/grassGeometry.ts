import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * plan4.md H3 (plan3.md §1.1 cause 1, still open going into this round):
 * the pre-H3 clump built three vertical cross-blades and called
 * computeVertexNormals() on them — for a perfectly vertical triangle that
 * produces an exactly horizontal normal (n.y === 0), so every blade shaded
 * as if lit edge-on no matter how directly the sun actually sat overhead.
 * This geometry authors the normal explicitly instead of deriving it from
 * face winding: each blade's own flat-face normal, leaned toward world-up
 * so it reads as a rounded blade catching sky/hemisphere light — the
 * "dobladas explícitamente hacia +Y" the plan calls for.
 */
const UP_LEAN = 0.55

export function createGrassClumpGeometry(): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = (blade / 3) * Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const first = positions.length / 3
    for (const [x, y] of [[-0.24, 0], [0.24, 0], [0, 1]] as const) {
      positions.push(x * cos, y, -x * sin)
    }
    const flatNormalX = sin * (1 - UP_LEAN)
    const flatNormalZ = cos * (1 - UP_LEAN)
    const length = Math.hypot(flatNormalX, UP_LEAN, flatNormalZ)
    for (let vertex = 0; vertex < 3; vertex += 1) {
      normals.push(flatNormalX / length, UP_LEAN / length, flatNormalZ / length)
    }
    indices.push(first, first + 1, first + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

// plan4.md §1.5: a 0.55-1.6u blade is sub-10px past ~150u at the hero's own
// scale (1086.5/d px per world unit) — instancing it further out spends
// draw budget on sub-pixel noise SMAA then has to fight.
export const GRASS_CUTOFF_RADIUS = 150
