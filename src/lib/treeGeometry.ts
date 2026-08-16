import { BufferGeometry, Float32BufferAttribute } from 'three'
import { ensureNeutralColorAttribute } from './instanceColorAttribute'

/**
 * plan3.md C1 / §3.2: a cross-billboard (2 quads at 90°) reads as an
 * individual tree at the measured on-screen size (§3.2: ~51px at 300
 * units) without needing real 3D foliage geometry — the plan's own
 * conclusion after measuring screen size, and the same billboard-impostor
 * technique real-time vegetation rendering has used for decades. The
 * silhouette itself (trunk + canopy) is painted analytically in
 * Forest.tsx's fragment shader, not a texture asset — same "authored math,
 * not a downloaded asset" approach as aircraftSurfaceMaps.ts /
 * terrainSurfaceMaps.ts.
 *
 * Normals are authored, not computed: a plain face normal for a *vertical*
 * quad is horizontal (N.y == 0) — the exact bug this plan's audit found in
 * the original grass geometry (§1.1). Every vertex here instead gets a
 * normal with a dominant +Y component, tilted per-quad so the two crossed
 * quads still shade a little differently from each other.
 */
export function createTreeBillboardGeometry(): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const addQuad = (angleRad: number) => {
    const cos = Math.cos(angleRad)
    const sin = Math.sin(angleRad)
    const first = positions.length / 3
    const corners: ReadonlyArray<readonly [number, number]> = [
      [-0.5, 0],
      [0.5, 0],
      [0.5, 1],
      [-0.5, 1],
    ]
    for (const [x, y] of corners) {
      positions.push(x * cos, y, -x * sin)
      uvs.push(x + 0.5, y)
    }
    const nx = sin * 0.4
    const ny = 1.15
    const nz = cos * 0.4
    const length = Math.hypot(nx, ny, nz)
    for (let vertex = 0; vertex < 4; vertex += 1) normals.push(nx / length, ny / length, nz / length)
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3)
  }

  addQuad(0)
  addQuad(Math.PI / 2)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  // instanceColorAttribute.ts: canopy tint comes entirely from
  // InstancedMesh.setColorAt (Forest.tsx) — needs the neutral placeholder
  // attribute regardless, or three.js's USE_COLOR path (armed by the
  // material's vertexColors flag alone) reads an unbound attribute and
  // zeroes vColor before the instance tint is even applied.
  return ensureNeutralColorAttribute(geometry)
}
