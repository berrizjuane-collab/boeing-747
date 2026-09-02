import { BufferGeometry, Float32BufferAttribute } from 'three'
import { fbm2D } from './terrainField'

/**
 * Round 5: a rolling ridge ring around the aerodrome so the horizon has a
 * dented silhouette (plan4.md §3.1 property 1/4) instead of a straight
 * line, and so the far tree band has slopes to stand on.
 *
 * Pure height field over world (x, z): zero inside HILL_INNER_RADIUS (the
 * flat aerodrome basin the terrain disc already carries), rising through a
 * smooth shoulder to full amplitude, falling back to zero past
 * HILL_OUTER_RADIUS. Amplitude is fbm over (x, z) so ridges and saddles
 * are irregular, not a uniform doughnut.
 */
export const HILL_INNER_RADIUS = 520
export const HILL_FULL_RADIUS = 760
export const HILL_FADE_RADIUS = 1150
export const HILL_OUTER_RADIUS = 1400
export const HILL_MAX_HEIGHT = 96

const HILL_SALT = 0x4c1bb

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function hillHeightAt(x: number, z: number): number {
  const radius = Math.hypot(x, z)
  if (radius <= HILL_INNER_RADIUS || radius >= HILL_OUTER_RADIUS) return 0
  const rise = smoothstep(HILL_INNER_RADIUS, HILL_FULL_RADIUS, radius)
  const fall = 1 - smoothstep(HILL_FADE_RADIUS, HILL_OUTER_RADIUS, radius)
  const profile = Math.min(rise, fall)
  // Two scales: broad ridges (cell 420) carrying most of the amplitude,
  // finer knolls (cell 140) breaking the ridge line into a jagged crest.
  const broad = fbm2D(x, z, HILL_SALT, 3, 420)
  const fine = fbm2D(x + 900, z - 700, HILL_SALT + 17, 2, 140)
  const shape = Math.max(0, broad * 0.78 + fine * 0.22 - 0.22) / 0.78
  return profile * shape * HILL_MAX_HEIGHT
}

export const HILL_RING_ANGULAR_SEGMENTS = 320
export const HILL_RING_RADIAL_SEGMENTS = 14

/**
 * Annular mesh sampling hillHeightAt on a polar grid, world-locked at the
 * origin. Indexed, with smooth vertex normals for the forest material's
 * lighting; UV is world/220 for a low-frequency ground tint.
 */
export function createHillRingGeometry(): BufferGeometry {
  const angular = HILL_RING_ANGULAR_SEGMENTS
  const radial = HILL_RING_RADIAL_SEGMENTS
  const positions: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const foliage: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= radial; ring += 1) {
    const t = ring / radial
    // Denser rows near the inner shoulder where the slope is steepest.
    const radius = HILL_INNER_RADIUS + (HILL_OUTER_RADIUS - HILL_INNER_RADIUS) * (t * t * 0.55 + t * 0.45)
    for (let segment = 0; segment <= angular; segment += 1) {
      const angle = (segment / angular) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      const y = hillHeightAt(x, z)
      positions.push(x, y, z)
      uvs.push(x / 220, z / 220)
      // Slight darkening in the valleys, lighter crests — read as forested
      // slopes catching the low sun from a distance — and a mottle of
      // darker stands / lighter clearings (fbm at ~90 u) so the ridge reads
      // as wooded ground rather than a smooth dune, which matters most on
      // the Low tier where the far tree band is thinned to 36 %.
      const mottle = 0.72 + 0.28 * fbm2D(x - 400, z + 250, HILL_SALT + 31, 3, 90)
      const shade = (0.62 + Math.min(1, y / HILL_MAX_HEIGHT) * 0.46) * mottle
      colors.push(shade, shade, shade)
      foliage.push(1)
    }
  }
  const stride = angular + 1
  for (let ring = 0; ring < radial; ring += 1) {
    for (let segment = 0; segment < angular; segment += 1) {
      const a = ring * stride + segment
      const b = a + 1
      const c = a + stride
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aFoliage', new Float32BufferAttribute(foliage, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}
