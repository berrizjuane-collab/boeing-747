import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'

/**
 * Round 5 (plan3.md Fase D): procedural surface maps for the built
 * aerodrome — runway asphalt with rubber deposits, apron concrete slabs,
 * a curtain-wall mullion grid and a ribbed hangar door. Same
 * DataTexture/deterministic-noise pattern as terrainSurfaceMaps.ts and
 * aircraftSurfaceMaps.ts: zero network bytes, byte-identical between runs.
 */
function noise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

/** Value noise; `period` (in lattice cells) wraps the lattice so tiled textures have no seam. */
function valueNoise(x: number, y: number, cell: number, salt: number, period = 0): number {
  const cx = x / cell
  const cy = y / cell
  const ix = Math.floor(cx)
  const iy = Math.floor(cy)
  const fx = smoothstep01(cx - ix)
  const fy = smoothstep01(cy - iy)
  const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v)
  const a = noise(wrap(ix), wrap(iy), salt)
  const b = noise(wrap(ix + 1), wrap(iy), salt)
  const c = noise(wrap(ix), wrap(iy + 1), salt)
  const d = noise(wrap(ix + 1), wrap(iy + 1), salt)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function makeTexture(data: Uint8Array, width: number, height: number, srgb: boolean, repeat = true): DataTexture {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = repeat ? RepeatWrapping : LinearFilter === LinearFilter ? RepeatWrapping : RepeatWrapping
  texture.wrapT = texture.wrapS
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

export interface SurfaceMapSet {
  albedo: DataTexture
  normal: DataTexture
  roughness: DataTexture
}

function normalFromHeight(heightAt: (x: number, y: number) => number, width: number, height: number, strength: number): Uint8Array {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const sx = heightAt(x + 1, y) - heightAt(x - 1, y)
      const sy = heightAt(x, y + 1) - heightAt(x, y - 1)
      const nx = -sx * strength
      const ny = -sy * strength
      const nz = 1
      const inv = 1 / Math.hypot(nx, ny, nz)
      data[offset] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      data[offset + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      data[offset + 2] = Math.round((nz * inv * 0.5 + 0.5) * 255)
      data[offset + 3] = 255
    }
  }
  return data
}

/**
 * Runway asphalt, mapped once over the whole strip (u across the width, v
 * along the length): grain, longitudinal streaking, faint slab seams every
 * ~30 u, a lighter weathered centre, and the dark rubber deposits real
 * runways carry in both touchdown zones — smeared, noisy, densest ~10 %
 * from each threshold and fading toward the middle.
 */
export function createRunwaySurfaceMaps(width = 256, height = 1024): SurfaceMapSet {
  const albedo = new Uint8Array(width * height * 4)
  const roughness = new Uint8Array(width * height * 4)
  const heightField = (x: number, y: number) => valueNoise(x, y, 3, 5) * 0.7 + noise(x, y, 6) * 0.3

  for (let y = 0; y < height; y += 1) {
    const v = y / height
    const alongFromThreshold = Math.min(v, 1 - v) // 0 at either end, 0.5 at midpoint
    for (let x = 0; x < width; x += 1) {
      const u = x / width
      const offset = (y * width + x) * 4
      const grain = valueNoise(x, y, 5, 1) * 0.5 + valueNoise(x * 4, y, 16, 2) * 0.35 + noise(x, y, 3) * 0.15
      const streak = valueNoise(x * 0.5, y * 0.04, 4, 4) // stretched along the runway
      let lum = 0.2 + grain * 0.07 + (streak - 0.5) * 0.05
      // Weathered lighter centre band, dark edge strip.
      const centre = 1 - Math.min(1, Math.abs(u - 0.5) * 2.4)
      lum += centre * 0.02
      // Slab seams every ~30 u (1024 texels / 520 u ≈ 2 texels per u).
      if (y % 59 === 0 || y % 59 === 1) lum -= 0.03
      // Rubber deposits: strongest 6-16 % from each threshold, within the
      // middle ~55 % of the width, broken up by noise.
      const rubberAlong = smoothstep01((alongFromThreshold - 0.03) / 0.05) * (1 - smoothstep01((alongFromThreshold - 0.12) / 0.14))
      const rubberAcross = 1 - smoothstep01((Math.abs(u - 0.5) - 0.14) / 0.16)
      const rubberNoise = valueNoise(x * 0.6, y * 0.12, 7, 8) * 0.6 + valueNoise(x, y, 2, 9) * 0.4
      const rubber = rubberAlong * rubberAcross * smoothstep01((rubberNoise - 0.3) / 0.5)
      lum *= 1 - rubber * 0.62
      const r = Math.round(Math.min(255, Math.max(0, lum * 255 * 0.98)))
      const g = Math.round(Math.min(255, Math.max(0, lum * 255 * 1.0)))
      const b = Math.round(Math.min(255, Math.max(0, lum * 255 * 1.04)))
      albedo[offset] = r
      albedo[offset + 1] = g
      albedo[offset + 2] = b
      albedo[offset + 3] = 255
      const rough = Math.round((0.9 + grain * 0.08 - rubber * 0.22) * 255)
      roughness[offset] = rough
      roughness[offset + 1] = rough
      roughness[offset + 2] = rough
      roughness[offset + 3] = 255
    }
  }
  return {
    albedo: makeTexture(albedo, width, height, true),
    normal: makeTexture(normalFromHeight(heightField, width, height, 0.9), width, height, false),
    roughness: makeTexture(roughness, width, height, false),
  }
}

/** Apron / taxiway concrete: slab grid with darker joints, stains, fine grain. Tiled. */
export function createConcreteSurfaceMaps(size = 256, slabsPerTile = 4): SurfaceMapSet {
  const albedo = new Uint8Array(size * size * 4)
  const roughness = new Uint8Array(size * size * 4)
  const slab = size / slabsPerTile
  const wrapTexel = (v: number) => ((v % size) + size) % size
  const heightField = (x: number, y: number) => {
    const wx = wrapTexel(x)
    const wy = wrapTexel(y)
    const jointX = wx % slab < 2 ? -0.6 : 0
    const jointY = wy % slab < 2 ? -0.6 : 0
    return valueNoise(wx, wy, 4, 21, size / 4) * 0.5 + jointX + jointY
  }
  const stainCell = size / 8
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const grain = valueNoise(x, y, 4, 22, size / 4) * 0.5 + noise(wrapTexel(x), wrapTexel(y), 23) * 0.2
      const stain = valueNoise(x, y, stainCell, 24, 8)
      const slabTint = noise(Math.floor(x / slab) % slabsPerTile, Math.floor(y / slab) % slabsPerTile, 25) * 0.08
      let lum = 0.56 + grain * 0.1 + slabTint - smoothstep01((stain - 0.62) / 0.3) * 0.16
      if (x % slab < 2 || y % slab < 2) lum -= 0.14
      const r = Math.round(Math.min(255, lum * 255 * 1.0))
      const g = Math.round(Math.min(255, lum * 255 * 0.99))
      const b = Math.round(Math.min(255, lum * 255 * 0.96))
      albedo[offset] = r
      albedo[offset + 1] = g
      albedo[offset + 2] = b
      albedo[offset + 3] = 255
      const rough = Math.round((0.86 + grain * 0.1) * 255)
      roughness[offset] = rough
      roughness[offset + 1] = rough
      roughness[offset + 2] = rough
      roughness[offset + 3] = 255
    }
  }
  return {
    albedo: makeTexture(albedo, size, size, true),
    normal: makeTexture(normalFromHeight(heightField, size, size, 1.2), size, size, false),
    roughness: makeTexture(roughness, size, size, false),
  }
}

/**
 * Curtain-wall glazing: pale sky-blue glass panes separated by dark
 * mullions, with a warm interior glow behind a random subset of panes so
 * the terminal and tower cab read as occupied at golden hour. Returned as
 * an sRGB albedo plus an emissive map (the lit panes) sharing one grid.
 */
export function createGlazingMaps(size = 256, panesX = 8, panesY = 2, litShare = 0.35): { albedo: DataTexture; emissive: DataTexture } {
  const albedo = new Uint8Array(size * size * 4)
  const emissive = new Uint8Array(size * size * 4)
  const paneW = size / panesX
  const paneH = size / panesY
  const mullion = Math.max(2, Math.round(size / 96))
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const px = Math.floor(x / paneW)
      const py = Math.floor(y / paneH)
      const onMullion = x % paneW < mullion || y % paneH < mullion
      const lit = noise(px, py, 31) < litShare
      const paneShade = 0.86 + noise(px, py, 32) * 0.14
      if (onMullion) {
        albedo[offset] = 38
        albedo[offset + 1] = 42
        albedo[offset + 2] = 46
        emissive[offset] = 0
        emissive[offset + 1] = 0
        emissive[offset + 2] = 0
      } else {
        albedo[offset] = Math.round(120 * paneShade)
        albedo[offset + 1] = Math.round(150 * paneShade)
        albedo[offset + 2] = Math.round(170 * paneShade)
        const glow = lit ? 0.75 + noise(px, py, 33) * 0.25 : 0.06
        emissive[offset] = Math.round(255 * glow)
        emissive[offset + 1] = Math.round(196 * glow)
        emissive[offset + 2] = Math.round(120 * glow)
      }
      albedo[offset + 3] = 255
      emissive[offset + 3] = 255
    }
  }
  return { albedo: makeTexture(albedo, size, size, true), emissive: makeTexture(emissive, size, size, true) }
}

/** Ribbed hangar door: vertical corrugation stripes as a normal + subtle albedo banding. Tiled horizontally. */
export function createRibbedPanelMaps(size = 128, ribs = 12): { albedo: DataTexture; normal: DataTexture } {
  const albedo = new Uint8Array(size * size * 4)
  const ribW = size / ribs
  const heightField = (x: number) => {
    const wx = ((x % size) + size) % size
    return Math.abs(((wx % ribW) / ribW) * 2 - 1) * 2
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const band = 0.9 + (heightField(x) - 1) * 0.06 + noise(x, y, 41) * 0.04
      const value = Math.round(Math.min(255, band * 255))
      albedo[offset] = value
      albedo[offset + 1] = value
      albedo[offset + 2] = value
      albedo[offset + 3] = 255
    }
  }
  return {
    albedo: makeTexture(albedo, size, size, true),
    normal: makeTexture(normalFromHeight((x) => heightField(x), size, size, 0.35), size, size, false),
  }
}
