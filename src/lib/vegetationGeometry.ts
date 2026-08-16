import { BufferGeometry, Float32BufferAttribute } from 'three'
import { ensureNeutralColorAttribute } from './instanceColorAttribute'

/**
 * plan3.md C2 (§1.1, bug root cause): a plain `computeVertexNormals()` on a
 * *vertical* triangle gives a horizontal normal (N.y == 0) — perpendicular
 * to the blade's own plane — which is why these used to read almost black
 * under a key light that's ~74% overhead: shaded like a wall, not like
 * grass. Authored normals with a dominant +Y component instead (still
 * tilted per this blade's own rotation, so the three blades in a clump keep
 * shading a little differently from one another) catch that overhead light
 * the way an actual blade surface would. Exported (not inlined in the
 * component) so tests/b1-b2.test.mjs's C2 test can assert on it directly,
 * the same pattern aircraftSurfaceMaps.ts's C1 test already uses.
 */
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
    const nx = sin * 0.4
    const ny = 1.15
    const nz = cos * 0.4
    const length = Math.hypot(nx, ny, nz)
    for (let vertex = 0; vertex < 3; vertex += 1) normals.push(nx / length, ny / length, nz / length)
    indices.push(first, first + 1, first + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  // instanceColorAttribute.ts: this mesh is tinted entirely through
  // InstancedMesh.setColorAt (RunwayEnvironment.tsx's VegetationBands), not
  // a per-vertex color — needs the neutral placeholder attribute regardless.
  return ensureNeutralColorAttribute(geometry)
}
