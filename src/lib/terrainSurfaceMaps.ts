import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'
import { GRASS_COVERAGE_TARGET, GRASS_EDGE_SOFTNESS } from './terrainField'

export interface TerrainSurfaceMaps {
  albedo: DataTexture
  normal: DataTexture
  roughness: DataTexture
  roughnessRange: readonly [number, number]
}

// The terrain material is shared for the lifetime of the scene. High and
// Mid intentionally resolve to the same 1024px maps; keeping a tiny cache by
// the actual generation parameters avoids rebuilding a million texels when
// switching between those tiers, or when returning from Low. The cache owns
// these textures until the page itself is discarded.
const surfaceMapCache = new Map<number, Promise<TerrainSurfaceMaps>>()
const readyMapSizes = new Set<number>()

export interface TerrainSurfaceMapPayload {
  size: number
  albedoData: Uint8Array
  normalData: Uint8Array
  roughnessData: Uint8Array
  roughnessRange: readonly [number, number]
}

/**
 * plan4.md G2/§3.9: tier-scaled per §04-04's declared budget (high/mid
 * 1024², low 512²) — the same tier already threading through
 * qualityStore.ts, not a fourth independent size table.
 */
export const TERRAIN_SURFACE_MAP_SIZE: Record<'high' | 'mid' | 'low', number> = {
  high: 1024,
  mid: 1024,
  low: 512,
}

function deterministicNoise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep01(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/**
 * Value noise on a lattice that's periodic with the given period — unlike
 * terrainField.ts's groundMaskAt (which samples a genuinely unbounded,
 * non-repeating world-space field for grass/tree placement), this texture
 * is sampled with RepeatWrapping (world-space UV / TERRAIN_TEXTURE_TILE_SIZE,
 * see terrainGeometry.ts), so it has to tile seamlessly — a texel at u=0
 * and the one that wraps to u=1 must be lattice-neighbours, which an
 * unbounded field can't guarantee. Wrapping the lattice *indices* modulo
 * the period is the standard fix, at the cost of the texture being a
 * *periodic, representative* sample of the same coverage/patchiness
 * (GRASS_COVERAGE_TARGET, GRASS_EDGE_SOFTNESS — imported, not re-picked) —
 * not a literal per-world-point lookup of the aperiodic field beyond one
 * tile. Grass/tree instance placement still uses the true field directly;
 * the consistency that actually matters (bug #16, verified in
 * tests/plan4-fase0.test.mjs) is that no instance lands on fully-bare
 * ground, which doesn't depend on the texture and instances agreeing pixel
 * -for-pixel at world scale.
 */
function periodicHash(ix: number, iz: number, period: number, salt: number): number {
  const wrappedX = ((ix % period) + period) % period
  const wrappedZ = ((iz % period) + period) % period
  let h = (Math.imul(wrappedX, 374761393) + Math.imul(wrappedZ, 668265263) + Math.imul(salt, 2246822519)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4_294_967_296
}

function periodicValueNoise(u: number, v: number, cellsPerTile: number, period: number, salt: number): number {
  const cx = u * cellsPerTile
  const cz = v * cellsPerTile
  const ix0 = Math.floor(cx)
  const iz0 = Math.floor(cz)
  const fx = smoothstep01(cx - ix0)
  const fz = smoothstep01(cz - iz0)

  const v00 = periodicHash(ix0, iz0, period, salt)
  const v10 = periodicHash(ix0 + 1, iz0, period, salt)
  const v01 = periodicHash(ix0, iz0 + 1, period, salt)
  const v11 = periodicHash(ix0 + 1, iz0 + 1, period, salt)

  const vx0 = v00 + (v10 - v00) * fx
  const vx1 = v01 + (v11 - v01) * fx
  return vx0 + (vx1 - vx0) * fz
}

// plan4.md 04-04: an earlier version called this with a fixed 3 octaves for
// the mask *and* for each of the two warp channels below — 9 value-noise
// samples (36 lattice-hash evaluations) per texel, measured at 1281ms to
// generate a 1024² set (window.__MERIDIAN_PERF__.terrainGenerationMs, real
// browser main-thread JS — not a SwiftShader artifact). Nowhere near the
// plan3.md §3.2 80-200ms estimate, which was scaled from
// aircraftSurfaceMaps.ts's much cheaper single-sample-per-texel noise. The
// warp only needs to bend the sampling point enough for irregular patch
// edges (plan4.md §3.1) — one octave reads the same as three at this
// amplitude — and a 1024² texture can't resolve a third octave's frequency
// well anyway. Octave count is a parameter specifically so this trade-off
// is visible at the call site, not buried in a hardcoded array.
function periodicFbm(u: number, v: number, cellsPerTile: number, salt: number, octaveCount: number): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let octave = 0; octave < octaveCount; octave += 1) {
    const cells = cellsPerTile * frequency
    sum += periodicValueNoise(u, v, cells, cells, salt + octave * 101) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / norm
}

// Cells per tile chosen so the patch scale reads similarly to
// terrainField.ts's own GRASS_MASK_CELL_SIZE relative to
// TERRAIN_TEXTURE_TILE_SIZE (terrainGeometry.ts): a handful of patches per
// tile, not one giant blob and not visible-grid noise.
const MASK_CELLS_PER_TILE = 5
const MASK_OCTAVES = 2
const WARP_OCTAVES = 1
const MICRO_DETAIL_TEXELS = 3 // per-texel grain wavelength, in texels

/** 0 = bare dirt, 1 = grass — periodic counterpart of terrainField.ts's groundMaskAt, same coverage/edge constants. */
export function tileGroundMask(u: number, v: number): number {
  const warpU = (periodicFbm(u + 0.37, v - 0.21, MASK_CELLS_PER_TILE, 900, WARP_OCTAVES) - 0.5) * 0.35
  const warpV = (periodicFbm(u - 0.21, v + 0.37, MASK_CELLS_PER_TILE, 901, WARP_OCTAVES) - 0.5) * 0.35
  const base = periodicFbm(u + warpU, v + warpV, MASK_CELLS_PER_TILE, 0, MASK_OCTAVES)
  const threshold = 1 - GRASS_COVERAGE_TARGET
  return smoothstep01((base - (threshold - GRASS_EDGE_SOFTNESS)) / (2 * GRASS_EDGE_SOFTNESS))
}

// plan4.md §3.1 property 2: "la tierra tiene variación propia — zonas más
// claras y más oscuras" and terracotta as the dominant clearing colour, not
// a flat fill. Kept in the same warm family as SECTION_ENVIRONMENT's S1
// `background` (#9f6246) and `ground` (#59664d) so G3's tint mix lands on a
// coherent palette rather than clashing with it.
const DIRT_BASE = new Color('#c99a74')
const DIRT_DARK = new Color('#8e5f3f')
const GRASS_BASE = new Color('#8fa257')
const GRASS_DARK = new Color('#5f7038')

const dirtScratch = new Color()
const grassScratch = new Color()

/** Two persistent scratch Colors, not `new Color()` per texel — this runs size² times (up to 1024² = ~1M). */
function albedoAt(u: number, v: number, mask: number): Color {
  const dirtVariation = deterministicNoise(u * 512, v * 512, 11)
  const grassVariation = deterministicNoise(u * 512, v * 512, 23)
  dirtScratch.copy(DIRT_DARK).lerp(DIRT_BASE, 0.35 + dirtVariation * 0.65)
  grassScratch.copy(GRASS_DARK).lerp(GRASS_BASE, 0.35 + grassVariation * 0.65)
  return dirtScratch.lerp(grassScratch, mask)
}

/**
 * Terrain albedo + normal + roughness, generated fully client-side (bug
 * #18: 0 network bytes, all cost is the generation hitch — see progress4.md
 * 04-04). Same DataTexture/deterministic-noise pattern as
 * aircraftSurfaceMaps.ts, extended with an actual colour map: unlike the
 * aircraft hull (which keeps its licensed livery texture for colour and
 * only adds normal/roughness), there's no base terrain photograph to
 * preserve here.
 */
export function createTerrainSurfaceMapPayload(size: number): TerrainSurfaceMapPayload {
  const albedoData = new Uint8Array(size * size * 4)
  const normalData = new Uint8Array(size * size * 4)
  const roughnessData = new Uint8Array(size * size * 4)
  let roughnessMin = 255
  let roughnessMax = 0

  // Separate, higher-frequency height field purely for the normal map's
  // micro-bump (dirt grain / short-grass texture) — deliberately not
  // terrainField.ts's low-amplitude relief (that's the *geometry's* job,
  // terrainGeometry.ts; this is surface micro-detail at texel scale).
  const heightAt = (x: number, y: number) => deterministicNoise(x, y, 71)

  for (let y = 0; y < size; y += 1) {
    const v = y / size
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const offset = (y * size + x) * 4

      const mask = tileGroundMask(u, v)
      const color = albedoAt(u, v, mask)
      albedoData[offset] = Math.round(color.r * 255)
      albedoData[offset + 1] = Math.round(color.g * 255)
      albedoData[offset + 2] = Math.round(color.b * 255)
      albedoData[offset + 3] = 255

      const slopeX = heightAt(x + MICRO_DETAIL_TEXELS, y) - heightAt(x - MICRO_DETAIL_TEXELS, y)
      const slopeY = heightAt(x, y + MICRO_DETAIL_TEXELS) - heightAt(x, y - MICRO_DETAIL_TEXELS)
      const nx = -slopeX * 0.4
      const ny = -slopeY * 0.4
      const nz = 1
      const inverseLength = 1 / Math.hypot(nx, ny, nz)
      normalData[offset] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 2] = Math.round((nz * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 3] = 255

      // Dry dirt and short grass are both fairly rough in reality (no
      // shiny clearings) — the roughness range sits high and narrow-ish,
      // with grain from the same micro-noise driving the normal map so
      // rougher/smoother texels correlate with the bump they sit on.
      const grain = deterministicNoise(x + 307, y + 101, 41)
      const roughnessValue = Math.round(Math.min(255, Math.max(0, (0.78 + grain * 0.2 - mask * 0.05) * 255)))
      roughnessMin = Math.min(roughnessMin, roughnessValue)
      roughnessMax = Math.max(roughnessMax, roughnessValue)
      roughnessData[offset] = roughnessValue
      roughnessData[offset + 1] = roughnessValue
      roughnessData[offset + 2] = roughnessValue
      roughnessData[offset + 3] = 255
    }
  }

  return {
    size,
    albedoData,
    normalData,
    roughnessData,
    roughnessRange: [roughnessMin / 255, roughnessMax / 255],
  }
}

function makeTexture(data: Uint8Array, size: number, name: string, srgb = false): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.name = name
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export function createTerrainSurfaceMapsFromPayload(payload: TerrainSurfaceMapPayload): TerrainSurfaceMaps {
  const { size } = payload
  const albedo = makeTexture(payload.albedoData, size, 'MERIDIAN_terrain_albedo', true)
  const normal = makeTexture(payload.normalData, size, 'MERIDIAN_terrain_normal')
  const roughness = makeTexture(payload.roughnessData, size, 'MERIDIAN_terrain_roughness')

  return { albedo, normal, roughness, roughnessRange: payload.roughnessRange }
}

export function createTerrainSurfaceMaps(size: number): TerrainSurfaceMaps {
  return createTerrainSurfaceMapsFromPayload(createTerrainSurfaceMapPayload(size))
}

function createTerrainSurfaceMapsInWorker(size: number): Promise<TerrainSurfaceMaps> {
  if (typeof Worker === 'undefined') return Promise.resolve(createTerrainSurfaceMaps(size))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./terrainSurfaceMaps.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<TerrainSurfaceMapPayload>) => {
      worker.terminate()
      resolve(createTerrainSurfaceMapsFromPayload(event.data))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'Terrain texture worker failed'))
    }
    worker.postMessage({ size })
  })
}

export function getTerrainSurfaceMaps(size: number): Promise<TerrainSurfaceMaps> {
  const cached = surfaceMapCache.get(size)
  if (cached) return cached
  const promise = createTerrainSurfaceMapsInWorker(size)
    .catch(() => createTerrainSurfaceMaps(size))
    .then((maps) => { readyMapSizes.add(size); return maps })
  surfaceMapCache.set(size, promise)
  return promise
}

export function hasCachedTerrainSurfaceMaps(size: number): boolean {
  return readyMapSizes.has(size)
}

/** Useful for isolated tests and explicit scene shutdowns. */
export async function disposeTerrainSurfaceMapCache(): Promise<void> {
  const entries = [...surfaceMapCache.values()]
  surfaceMapCache.clear()
  const maps = await Promise.all(entries)
  for (const set of maps) {
    set.albedo.dispose()
    set.normal.dispose()
    set.roughness.dispose()
  }
  readyMapSizes.clear()
}
