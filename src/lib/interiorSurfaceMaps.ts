import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'

/**
 * Round 5: procedural surface and screen-content maps for the cabin. The
 * published interior.glb carries POSITION + NORMAL only (no UVs — see
 * scripts/verify-interior-glb.mjs), so every map here is sampled through
 * the planar/bounds UV generation in interiorMaterials.ts. All generators
 * are deterministic, allocate nothing per texel beyond the output buffer,
 * and cost well under the terrain texture's measured budget (progress4.md
 * 04-04): the largest is 512×256.
 */
type RGB = readonly [number, number, number]

function noise(x: number, y: number, salt: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

function valueNoise(x: number, y: number, cell: number, salt: number, period = 0): number {
  const cx = x / cell
  const cy = y / cell
  let ix = Math.floor(cx)
  let iy = Math.floor(cy)
  const fx = smoothstep01(cx - ix)
  const fy = smoothstep01(cy - iy)
  const wrap = (v: number) => (period > 0 ? ((v % period) + period) % period : v)
  const a = noise(wrap(ix), wrap(iy), salt)
  const b = noise(wrap(ix + 1), wrap(iy), salt)
  const c = noise(wrap(ix), wrap(iy + 1), salt)
  const d = noise(wrap(ix + 1), wrap(iy + 1), salt)
  ix = 0
  iy = 0
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function fbm(x: number, y: number, cell: number, salt: number, octaves: number, period = 0): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, y * frequency, cell, salt + octave * 7, period * frequency) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / norm
}

function texture(data: Uint8Array, width: number, height: number, srgb: boolean, repeat: boolean): DataTexture {
  const result = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  if (srgb) result.colorSpace = SRGBColorSpace
  result.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping
  result.wrapT = result.wrapS
  result.magFilter = LinearFilter
  result.minFilter = LinearMipmapLinearFilter
  result.generateMipmaps = true
  result.needsUpdate = true
  return result
}

function normalFromHeight(heightAt: (x: number, y: number) => number, size: number, strength: number): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const nx = -(heightAt(x + 1, y) - heightAt(x - 1, y)) * strength
      const ny = -(heightAt(x, y + 1) - heightAt(x, y - 1)) * strength
      const inv = 1 / Math.hypot(nx, ny, 1)
      data[offset] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      data[offset + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      data[offset + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      data[offset + 3] = 255
    }
  }
  return texture(data, size, size, false, true)
}

function grayTexture(valueAt: (x: number, y: number) => number, size: number): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const v = Math.round(Math.min(255, Math.max(0, valueAt(x, y) * 255)))
      data[offset] = v
      data[offset + 1] = v
      data[offset + 2] = v
      data[offset + 3] = 255
    }
  }
  return texture(data, size, size, false, true)
}

export interface SurfaceKit {
  albedo?: DataTexture
  normal?: DataTexture
  roughness?: DataTexture
}

/** Woven fabric / carpet: crossed thread ridges plus fibre noise. Tiles. */
export function createWeaveMaps(size = 128, threads = 24): SurfaceKit {
  const period = size / threads
  const heightAt = (x: number, y: number) => {
    const wx = ((x % size) + size) % size
    const wy = ((y % size) + size) % size
    const warp = Math.abs(Math.sin((wx / period) * Math.PI))
    const weft = Math.abs(Math.sin((wy / period) * Math.PI))
    const over = Math.floor(wx / period + wy / period) % 2 === 0 ? warp : weft
    return over * 1.4 + noise(wx, wy, 3) * 0.5
  }
  return {
    normal: normalFromHeight(heightAt, size, 0.5),
    roughness: grayTexture((x, y) => 0.8 + noise(x, y, 4) * 0.15, size),
  }
}

/** Carpet albedo: base colour with lighter/darker flecks and a faint diagonal pile direction. Tiles. */
export function createCarpetAlbedo(size = 128, base: RGB, fleck: RGB, fleckShare = 0.18): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const flecked = noise(x, y, 11) < fleckShare
      const pile = 0.92 + 0.08 * Math.sin(((x + y) / size) * Math.PI * 12)
      const shade = (0.85 + noise(x, y, 12) * 0.3) * pile
      const source = flecked ? fleck : base
      data[offset] = Math.round(Math.min(255, source[0] * shade))
      data[offset + 1] = Math.round(Math.min(255, source[1] * shade))
      data[offset + 2] = Math.round(Math.min(255, source[2] * shade))
      data[offset + 3] = 255
    }
  }
  return texture(data, size, size, true, true)
}

/** Brushed metal: roughness streaks along x, faint normal grooves. Tiles. */
export function createBrushedMetalMaps(size = 128): SurfaceKit {
  const streak = (x: number, y: number) => valueNoise(x * 0.08, y * 3, 2, 21, 0)
  return {
    normal: normalFromHeight((x, y) => streak(x, y) * 0.9 + noise(x, y, 22) * 0.2, size, 0.35),
    roughness: grayTexture((x, y) => 0.22 + streak(x, y) * 0.25 + noise(x, y, 23) * 0.06, size),
  }
}

/** Leather grain: two-scale bumpy cells. Tiles. */
export function createLeatherMaps(size = 128): SurfaceKit {
  const heightAt = (x: number, y: number) => fbm(x, y, 6, 31, 3, size / 6) * 1.6 + fbm(x + 40, y - 20, 18, 32, 2, size / 18) * 0.8
  return {
    normal: normalFromHeight(heightAt, size, 0.75),
    roughness: grayTexture((x, y) => 0.5 + fbm(x, y, 10, 33, 2, size / 10) * 0.25, size),
  }
}

/** Moulded cabin panel: very fine texture, a soft horizontal seam per tile, mild roughness variation. Tiles. */
export function createPanelMaps(size = 128): SurfaceKit {
  const heightAt = (x: number, y: number) => {
    const wy = ((y % size) + size) % size
    const seam = wy < 3 ? -1.2 : 0
    return fbm(x, y, 9, 41, 2, size / 9) * 0.35 + seam
  }
  return {
    normal: normalFromHeight(heightAt, size, 0.45),
    roughness: grayTexture((x, y) => 0.42 + fbm(x, y, 22, 42, 2, size / 22) * 0.2, size),
  }
}

// ---------------------------------------------------------------------------
// Screen content

class Raster {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Uint8Array(width * height * 4)
  }
  fill(color: RGB) {
    this.rect(0, 0, this.width, this.height, color)
  }
  pixel(x: number, y: number, color: RGB, alpha = 1) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return
    const offset = (Math.floor(y) * this.width + Math.floor(x)) * 4
    this.data[offset] = Math.round(this.data[offset] * (1 - alpha) + color[0] * alpha)
    this.data[offset + 1] = Math.round(this.data[offset + 1] * (1 - alpha) + color[1] * alpha)
    this.data[offset + 2] = Math.round(this.data[offset + 2] * (1 - alpha) + color[2] * alpha)
    this.data[offset + 3] = 255
  }
  rect(x: number, y: number, w: number, h: number, color: RGB, alpha = 1) {
    for (let py = Math.max(0, y); py < Math.min(this.height, y + h); py += 1) {
      for (let px = Math.max(0, x); px < Math.min(this.width, x + w); px += 1) this.pixel(px, py, color, alpha)
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, color: RGB, thickness = 1) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = x0 + (x1 - x0) * t
      const y = y0 + (y1 - y0) * t
      this.rect(Math.round(x - thickness / 2), Math.round(y - thickness / 2), thickness, thickness, color)
    }
  }
  /** Fake text: a run of short bright dashes, the way UI labels read at a few px. */
  label(x: number, y: number, chars: number, color: RGB, glyph = 3) {
    for (let index = 0; index < chars; index += 1) {
      if (noise(index, y, 77) < 0.12) continue
      this.rect(x + index * (glyph + 1), y, glyph, glyph + 1, color)
    }
  }
}

const WHITE: RGB = [235, 240, 245]
const GREEN: RGB = [70, 235, 110]
const CYAN: RGB = [60, 200, 240]
const MAGENTA: RGB = [235, 80, 220]
const AMBER: RGB = [240, 180, 60]

/**
 * Cockpit display atlas, 512×256: left half a primary flight display
 * (attitude sphere, pitch ladder, speed/altitude tapes, heading strip,
 * flight-mode annunciators), right half a systems/ECAM-style tile that the
 * console and overhead screens sample with planar UVs.
 */
export function createCockpitDisplayAtlas(): DataTexture {
  const r = new Raster(512, 256)
  r.fill([4, 6, 9])
  // --- PFD (0..255 × 0..255)
  const cx = 128
  const horizon = 138
  r.rect(64, 34, 128, 190, [42, 118, 210])
  r.rect(64, horizon, 128, 224 - horizon, [128, 82, 40])
  r.line(64, horizon, 191, horizon, WHITE, 2)
  for (let pitch = -5; pitch <= 5; pitch += 1) {
    if (pitch === 0) continue
    const y = horizon - pitch * 15
    const half = Math.abs(pitch) % 2 === 0 ? 22 : 12
    r.line(cx - half, y, cx + half, y, WHITE, 1)
  }
  // Aircraft symbol
  r.rect(cx - 40, horizon - 2, 24, 4, AMBER)
  r.rect(cx + 16, horizon - 2, 24, 4, AMBER)
  r.rect(cx - 3, horizon - 3, 6, 6, AMBER)
  // Flight director
  r.line(cx - 30, horizon - 8, cx + 30, horizon - 8, MAGENTA, 2)
  r.line(cx + 6, horizon - 40, cx + 6, horizon + 40, MAGENTA, 2)
  // Speed tape
  r.rect(14, 30, 40, 198, [24, 28, 34])
  for (let y = 36; y < 226; y += 12) r.line(48, y, 54, y, WHITE, 1)
  r.rect(18, 122, 36, 14, [10, 12, 16])
  r.label(20, 126, 4, GREEN)
  r.rect(50, 96, 5, 6, MAGENTA)
  // Altitude tape
  r.rect(202, 30, 42, 198, [24, 28, 34])
  for (let y = 36; y < 226; y += 12) r.line(202, y, 208, y, WHITE, 1)
  r.rect(206, 122, 36, 14, [10, 12, 16])
  r.label(208, 126, 5, GREEN)
  r.rect(202, 108, 5, 6, MAGENTA)
  // Heading strip
  r.rect(64, 228, 128, 22, [24, 28, 34])
  for (let x = 68; x < 192; x += 10) r.line(x, 230, x, x % 20 === 8 ? 238 : 234, WHITE, 1)
  r.rect(cx - 2, 228, 4, 8, MAGENTA)
  // FMA
  r.rect(64, 6, 128, 22, [12, 14, 18])
  r.label(70, 12, 5, GREEN)
  r.label(108, 12, 5, WHITE)
  r.label(146, 12, 6, GREEN)
  r.line(104, 8, 104, 26, [90, 96, 104], 1)
  r.line(142, 8, 142, 26, [90, 96, 104], 1)

  // --- Systems tile (256..511): dense, dim instrument clutter — read at a
  // glance as "a panel full of indicators", never as legible blocks, since
  // the overhead and pedestal screens are big and close to the camera.
  const dim = (color: RGB, k: number): RGB => [color[0] * k, color[1] * k, color[2] * k]
  r.rect(256, 0, 256, 256, [4, 6, 9])
  for (let x = 256; x < 512; x += 16) r.line(x, 0, x, 255, [10, 22, 30], 1)
  for (let y = 0; y < 256; y += 16) r.line(256, y, 511, y, [10, 22, 30], 1)
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const gx = 264 + col * 62
      const gy = 12 + row * 62
      for (let angle = -140; angle <= 40; angle += 6) {
        const a = (angle * Math.PI) / 180
        r.pixel(gx + 14 + Math.cos(a) * 11, gy + 14 + Math.sin(a) * 11, angle < -30 ? dim(GREEN, 0.55) : dim(WHITE, 0.4))
      }
      r.line(gx + 14, gy + 14, gx + 14 + Math.cos(-1.1 + row * 0.2) * 10, gy + 14 + Math.sin(-1.1 + row * 0.2) * 10, dim(GREEN, 0.7), 1)
      r.label(gx + 30, gy + 4, 5, dim(CYAN, 0.55), 2)
      r.label(gx + 30, gy + 12, 4, dim(WHITE, 0.45), 2)
      r.label(gx + 30, gy + 20, 5, (row + col) % 3 === 0 ? dim(AMBER, 0.6) : dim(GREEN, 0.5), 2)
      r.rect(gx + 2, gy + 34, 50, 3, [14, 30, 40])
      r.rect(gx + 2, gy + 34, 12 + ((row * 7 + col * 11) % 34), 3, dim(GREEN, 0.5))
      r.label(gx + 2, gy + 44, 12, dim(WHITE, 0.35), 2)
    }
  }
  return texture(r.data, 512, 256, true, false)
}

/** Seat-back IFE: a moving map (land blobs, sea, route with aircraft symbol), title bar and icon dock. 256×160. */
export function createIfeScreenTexture(): DataTexture {
  const w = 256
  const h = 160
  const r = new Raster(w, h)
  r.fill([12, 30, 68])
  for (let y = 22; y < 132; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const land = fbm(x, y, 34, 51, 3) - 0.46
      if (land > 0) {
        const shade = 0.75 + land * 2
        r.pixel(x, y, [Math.round(76 * shade), Math.round(128 * shade), Math.round(70 * shade)])
      } else if (land > -0.03) {
        r.pixel(x, y, [60, 120, 160])
      }
    }
  }
  r.line(28, 118, 214, 44, [250, 250, 255], 2)
  r.rect(206, 36, 16, 16, [250, 250, 255])
  r.rect(210, 30, 8, 28, [250, 250, 255])
  r.rect(0, 0, w, 22, [8, 16, 34])
  r.label(8, 8, 12, WHITE)
  r.label(190, 8, 8, [150, 180, 220])
  r.rect(0, 132, w, 28, [6, 12, 26])
  for (let index = 0; index < 5; index += 1) {
    r.rect(16 + index * 48, 138, 30, 16, [30, 70, 130])
    r.label(20 + index * 48, 156, 6, [120, 160, 220], 2)
  }
  r.rect(96, 146, 64, 4, [90, 140, 220])
  return texture(r.data, w, h, true, false)
}

/**
 * The view out of a cabin window at cruise: deep blue zenith fading to a
 * bright haze band, a broken cloud deck with lit tops and shadowed bases,
 * and a hazy ground plane below. Sampled panoramically (u along the
 * fuselage) so neighbouring windows show neighbouring sky.
 */
export function createWindowViewTexture(width = 512, height = 128): DataTexture {
  const data = new Uint8Array(width * height * 4)
  const zenith: RGB = [46, 96, 190]
  const mid: RGB = [130, 178, 232]
  const haze: RGB = [232, 240, 248]
  const ground: RGB = [176, 196, 214]
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1) // 0 = bottom
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      let rgb: RGB
      if (v > 0.42) {
        const t = (v - 0.42) / 0.58
        const k = smoothstep01(t)
        rgb = [mid[0] + (zenith[0] - mid[0]) * k, mid[1] + (zenith[1] - mid[1]) * k, mid[2] + (zenith[2] - mid[2]) * k]
      } else if (v > 0.3) {
        const t = (v - 0.3) / 0.12
        rgb = [haze[0] + (mid[0] - haze[0]) * t, haze[1] + (mid[1] - haze[1]) * t, haze[2] + (mid[2] - haze[2]) * t]
      } else {
        const t = smoothstep01(v / 0.3)
        const dark = fbm(x, y, 22, 61, 2, width / 22) * 0.12
        rgb = [ground[0] * (1 - dark) + (haze[0] - ground[0]) * t, ground[1] * (1 - dark) + (haze[1] - ground[1]) * t, ground[2] * (1 - dark) + (haze[2] - ground[2]) * t]
      }
      // Cloud deck between v 0.24 and 0.5, perspective-compressed toward the horizon.
      const band = smoothstep01((v - 0.22) / 0.08) * (1 - smoothstep01((v - 0.42) / 0.1))
      const cloud = Math.max(0, fbm(x, y * 2.2, 26, 62, 4, width / 26) - 0.5) * 2.4 * band
      if (cloud > 0) {
        const lit = 0.86 + smoothstep01((v - 0.3) / 0.14) * 0.14
        const cloudColor: RGB = [252 * lit, 250 * lit, 246 * lit]
        const a = Math.min(1, cloud)
        rgb = [rgb[0] + (cloudColor[0] - rgb[0]) * a, rgb[1] + (cloudColor[1] - rgb[1]) * a, rgb[2] + (cloudColor[2] - rgb[2]) * a]
      }
      data[offset] = Math.round(Math.min(255, rgb[0]))
      data[offset + 1] = Math.round(Math.min(255, rgb[1]))
      data[offset + 2] = Math.round(Math.min(255, rgb[2]))
      data[offset + 3] = 255
    }
  }
  const result = texture(data, width, height, true, true)
  result.wrapT = ClampToEdgeWrapping
  return result
}

/** 32×32 radial soft dot for point sprites (dust motes, reading lights). */
export function createSoftDotTexture(size = 32): DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2
      const a = Math.max(0, 1 - d) ** 2
      data[offset] = 255
      data[offset + 1] = 255
      data[offset + 2] = 255
      data[offset + 3] = Math.round(a * 255)
    }
  }
  const result = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  result.magFilter = LinearFilter
  result.minFilter = LinearFilter
  result.needsUpdate = true
  return result
}
