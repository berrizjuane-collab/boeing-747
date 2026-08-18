/**
 * plan4.md §3.3 (bug #16): a single deterministic spatial field feeding
 * terrain texture, grass placement, tree placement/clustering and terrain
 * relief. One field means the ground-mask texture (Fase G2) can never say
 * "grass here" in a spot where no grass instance (Fase H3) actually landed
 * — the failure mode three independent noise sources would produce.
 *
 * Every export here is a pure function of (x, z, ...) and a fixed module
 * seed — no mutable state, no Math.random. `seededRandom` (seededRandom.ts)
 * is a *sequential* PRNG for i.i.d. draws (grass blade colour jitter, dust
 * drift); this module instead needs *spatial* coherence — the same (x, z)
 * has to answer "grass or dirt" the same way every time it's asked, from
 * any caller, in any order — so it hashes integer lattice coordinates
 * directly rather than drawing from a sequential stream.
 */

const TERRAIN_FIELD_SEED = 0x6d21f0

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(t: number): number {
  const clamped = clamp01(t)
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Deterministic integer-lattice hash → [0, 1). Standard bit-mixing hash
 * (multiply-xorshift), not a cryptographic one — this only needs to be
 * well-distributed and pure, not secure.
 */
function hashLattice(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4_294_967_296
}

/** Bilinear value noise over a square lattice of the given cell size, smoothstep-interpolated. */
function valueNoise2D(x: number, z: number, cellSize: number, salt: number): number {
  const cx = x / cellSize
  const cz = z / cellSize
  const ix0 = Math.floor(cx)
  const iz0 = Math.floor(cz)
  const fx = smoothstep01(cx - ix0)
  const fz = smoothstep01(cz - iz0)

  const v00 = hashLattice(ix0, iz0, salt)
  const v10 = hashLattice(ix0 + 1, iz0, salt)
  const v01 = hashLattice(ix0, iz0 + 1, salt)
  const v11 = hashLattice(ix0 + 1, iz0 + 1, salt)

  const vx0 = v00 + (v10 - v00) * fx
  const vx1 = v01 + (v11 - v01) * fx
  return vx0 + (vx1 - vx0) * fz
}

/** Fractal sum of valueNoise2D octaves, normalised back to ~[0, 1]. */
function fbm2D(x: number, z: number, salt: number, octaves: number, baseCellSize: number): number {
  const lacunarity = 2.1
  const gain = 0.55
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, baseCellSize, salt + octave * 101) * amplitude
    norm += amplitude
    amplitude *= gain
    frequency *= lacunarity
  }
  return norm > 0 ? sum / norm : 0
}

/** Domain-warped fbm: bends the sampling point by a second noise field so patch edges read as irregular blotches, not smooth ellipses (plan4.md §3.1: "manchones de bordes irregulares"). */
function warpedFbm2D(x: number, z: number, salt: number, octaves: number, baseCellSize: number, warpStrength: number): number {
  const warpX = (fbm2D(x * 0.5 + 500, z * 0.5 - 500, salt + 900, 2, baseCellSize * 0.6) - 0.5) * warpStrength
  const warpZ = (fbm2D(x * 0.5 - 500, z * 0.5 + 500, salt + 901, 2, baseCellSize * 0.6) - 0.5) * warpStrength
  return fbm2D(x + warpX, z + warpZ, salt, octaves, baseCellSize)
}

// §3.1 property 2: dirt dominates the clearings, grass sits in patches —
// grass is the minority coverage, never a continuous field. Coverage
// target and edge softness are declared here so G2 (the terrain texture)
// and H3 (grass placement) read the identical numbers.
export const GRASS_COVERAGE_TARGET = 0.38
export const GRASS_EDGE_SOFTNESS = 0.12
const GRASS_MASK_CELL_SIZE = 46
const GRASS_MASK_WARP = 9

/**
 * 0 = bare terracotta dirt, 1 = grass. Threshold-banded fbm so the result
 * is mostly-0-or-mostly-1 with a soft, irregular edge between patches,
 * rather than a smooth grey gradient everywhere.
 */
export function groundMaskAt(x: number, z: number): number {
  const base = warpedFbm2D(x, z, TERRAIN_FIELD_SEED, 4, GRASS_MASK_CELL_SIZE, GRASS_MASK_WARP)
  const threshold = 1 - GRASS_COVERAGE_TARGET
  return smoothstep01((base - (threshold - GRASS_EDGE_SOFTNESS)) / (2 * GRASS_EDGE_SOFTNESS))
}

// plan4.md §1.6/G1: subtle undulation, not hills — the runway markings and
// the built aerodrome footprint must stay flat (aerodromeKeepOut.ts is
// responsible for flattening height to 0 there; this field doesn't know
// about the keep-out at all, by design, so it stays a pure spatial
// function reusable by anything).
export const TERRAIN_RELIEF_AMPLITUDE = 1.4
const TERRAIN_RELIEF_CELL_SIZE = 260

export function terrainHeightAt(x: number, z: number): number {
  return (fbm2D(x, z, TERRAIN_FIELD_SEED + 777, 3, TERRAIN_RELIEF_CELL_SIZE) - 0.5) * 2 * TERRAIN_RELIEF_AMPLITUDE
}

// §3.2: three legible distance bands in the hero, radii derived from
// plan4.md §1.6's fog-transmittance table (near F<0.13, mid 0.13-0.63, far
// 0.63-0.99) rather than picked freehand.
export const TREE_BAND_RADII = { near: 400, mid: 900, far: 1500 } as const
export type TreeBand = 'near' | 'mid' | 'far'

// Exported for Fase H2's own clustering test (tests/plan4-fase-h.test.mjs):
// the quadrat size that test bins forest instances into to measure
// variance-to-mean ratio needs to match this field's own correlation
// length to actually detect patch-scale clustering, not a re-typed guess.
export const FOREST_DENSITY_CELL_SIZE = 130
const FOREST_DENSITY_WARP = 22
// §3.1 property 1: manchones, not a uniform carpet — density has to have
// real gaps (bare ground between clusters), so the coverage target is
// deliberately well under 1.
export const FOREST_COVERAGE_TARGET = 0.62
export const FOREST_EDGE_SOFTNESS = 0.16

/** 0..1 "how much this point wants a tree cluster" — the forest's own field, related to but independent of the grass mask (undergrowth and canopy cluster differently in real terrain). */
export function forestDensityAt(x: number, z: number): number {
  const base = warpedFbm2D(x, z, TERRAIN_FIELD_SEED + 4200, 4, FOREST_DENSITY_CELL_SIZE, FOREST_DENSITY_WARP)
  const threshold = 1 - FOREST_COVERAGE_TARGET
  return smoothstep01((base - (threshold - FOREST_EDGE_SOFTNESS)) / (2 * FOREST_EDGE_SOFTNESS))
}

export function treeBandForRadius(radius: number): TreeBand | null {
  if (radius <= TREE_BAND_RADII.near) return 'near'
  if (radius <= TREE_BAND_RADII.mid) return 'mid'
  if (radius <= TREE_BAND_RADII.far) return 'far'
  return null
}

export interface FieldInstance {
  x: number
  z: number
  /** [0, 1) — deterministic per-instance draw for scale/rotation/species jitter at the consuming site. */
  jitter: number
  rotationY: number
}

interface JitteredGridOptions {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  cellSize: number
  /** Distinct per field (grass vs. forest) so their jitter/rotation draws don't alias. */
  salt: number
  /** Point kept only if densityAt(x, z) exceeds this per-cell random draw — higher density function values keep more cells. */
  densityAt: (x: number, z: number) => number
  /** Optional hard exclusion (e.g. the aerodrome keep-out); returning true drops the candidate. */
  excluded?: (x: number, z: number) => boolean
}

/**
 * Deterministic jittered-grid sampler: one candidate per grid cell, offset
 * by a per-cell hashed jitter so the result isn't a visible lattice, kept
 * or dropped by comparing the shared density field against an independent
 * per-cell hashed threshold. O(area / cellSize²), fully reproducible byte
 * for byte from (bounds, cellSize, salt) alone — no iteration-order
 * dependence, no external RNG state.
 */
function sampleJitteredGrid(options: JitteredGridOptions): FieldInstance[] {
  const { minX, maxX, minZ, maxZ, cellSize, salt, densityAt, excluded } = options
  const instances: FieldInstance[] = []
  const startCol = Math.floor(minX / cellSize)
  const endCol = Math.ceil(maxX / cellSize)
  const startRow = Math.floor(minZ / cellSize)
  const endRow = Math.ceil(maxZ / cellSize)

  for (let row = startRow; row < endRow; row += 1) {
    for (let col = startCol; col < endCol; col += 1) {
      const jitterX = hashLattice(col, row, salt) - 0.5
      const jitterZ = hashLattice(col, row, salt + 1) - 0.5
      const x = (col + 0.5 + jitterX * 0.8) * cellSize
      const z = (row + 0.5 + jitterZ * 0.8) * cellSize
      if (x < minX || x > maxX || z < minZ || z > maxZ) continue
      if (excluded?.(x, z)) continue

      const keepThreshold = hashLattice(col, row, salt + 2)
      if (densityAt(x, z) <= keepThreshold) continue

      instances.push({
        x,
        z,
        jitter: hashLattice(col, row, salt + 3),
        rotationY: hashLattice(col, row, salt + 4) * Math.PI * 2,
      })
    }
  }
  return instances
}

const GRASS_FIELD_SALT = 0x9a11
const GRASS_CELL_SIZE = 2.1

/** Grass instances gated by groundMaskAt, cropped to a radius (plan4.md §1.5: matting is sub-10px past ~150u, so nothing further out is worth an instance). */
export function sampleGrassField(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, excluded?: (x: number, z: number) => boolean): FieldInstance[] {
  return sampleJitteredGrid({
    ...bounds,
    cellSize: GRASS_CELL_SIZE,
    salt: GRASS_FIELD_SALT,
    densityAt: groundMaskAt,
    excluded,
  })
}

const FOREST_FIELD_SALT = 0x5c07e5
const FOREST_CELL_SIZE_BY_BAND: Record<TreeBand, number> = { near: 9, mid: 16, far: 26 }

/** Tree instances for one distance band, gated by forestDensityAt and clustered by that same field — not a uniform grid of survivors. */
export function sampleForestField(band: TreeBand, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, excluded?: (x: number, z: number) => boolean): FieldInstance[] {
  return sampleJitteredGrid({
    ...bounds,
    cellSize: FOREST_CELL_SIZE_BY_BAND[band],
    salt: FOREST_FIELD_SALT + (band === 'near' ? 0 : band === 'mid' ? 1000 : 2000),
    densityAt: forestDensityAt,
    excluded,
  })
}
