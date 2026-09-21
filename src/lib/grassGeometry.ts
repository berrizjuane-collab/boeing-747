import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * plan4.md H3: one grass clump — `bladeCount` curved blades radiating from
 * a common root, each a 2-segment strip (4 triangles). Unlike the old
 * crossed flat triangles, normals are set explicitly to a sky-facing blend
 * (`n.y > 0` on every vertex — the shading floor the old
 * `computeVertexNormals()` on vertical triangles could never give), the
 * blade leans outward with a quadratic curve, and two extra attributes feed
 * the grass material (grassMaterial.ts):
 *
 * - `color`   — baked AO, dark at the root, full at the tip.
 * - `aHeight` — 0 at the root, 1 at the tip; the wind bends `aHeight²`.
 *
 * Height is 1 unit here; the instance scale sets the real clump height.
 */
export const GRASS_BLADES_PER_CLUMP = 11
const BLADE_LEVELS = [0, 0.55, 1] as const

function hash(value: number): number {
  const v = Math.sin(value * 12.9898 + 78.233) * 43758.5453
  return v - Math.floor(v)
}

export function createGrassClumpGeometry(bladeCount = GRASS_BLADES_PER_CLUMP): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const heights: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (let blade = 0; blade < bladeCount; blade += 1) {
    const angle = (blade / bladeCount) * Math.PI * 2 + hash(blade * 3.1) * 0.9
    const outwardX = Math.cos(angle)
    const outwardZ = Math.sin(angle)
    const sideX = -outwardZ
    const sideZ = outwardX
    const rootRadius = 0.05 + hash(blade * 7.7) * 0.2
    const lean = 0.18 + hash(blade * 5.3) * 0.3
    const bladeHeight = 0.6 + hash(blade * 9.1) * 0.5
    const baseWidth = 0.025 + hash(blade * 11.3) * 0.02
    // Bent normal: mostly up, tilted toward the blade's own outward lean.
    const nx = outwardX * 0.42
    const ny = 0.9
    const nz = outwardZ * 0.42
    const inverseLength = 1 / Math.hypot(nx, ny, nz)

    const first = positions.length / 3
    for (const level of BLADE_LEVELS) {
      const y = level * bladeHeight
      const width = baseWidth * (1 - level * 0.82)
      const reach = rootRadius + lean * level * level
      const cx = outwardX * reach
      const cz = outwardZ * reach
      for (const side of [-1, 1] as const) {
        positions.push(cx + sideX * width * 0.5 * side, y, cz + sideZ * width * 0.5 * side)
        normals.push(nx * inverseLength, ny * inverseLength, nz * inverseLength)
        const ao = 0.52 + level * 0.48
        colors.push(ao, ao, ao)
        heights.push(level)
        uvs.push(side * 0.5 + 0.5, level)
      }
    }
    for (let segment = 0; segment < BLADE_LEVELS.length - 1; segment += 1) {
      const a = first + segment * 2
      const b = a + 1
      const c = a + 2
      const d = a + 3
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aHeight', new Float32BufferAttribute(heights, 1))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
