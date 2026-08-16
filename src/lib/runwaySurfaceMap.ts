import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'
import { RUNWAY_LENGTH, RUNWAY_WIDTH } from './runwayGeometry'

// The asphalt box's default UV stretches this one square texture across a
// face 520x32 in world units — a ~16:1 aspect ratio. Sampling noise at the
// same texture-space frequency in both axes would read, in world space, as
// features 16x longer than they are wide; sampling `y` at ASPECT times the
// frequency of `x` compensates directly. (A separate fine crosshatch
// visible on the runway at a grazing S3 viewing angle was checked against
// this and ruled out as its cause: it's present identically on the
// *original* flat-color asphalt material, before this texture existed at
// all — see progress3.md's D3 entry. Left as a documented, pre-existing
// SwiftShader artifact rather than something this item introduced or is
// responsible for fixing.)
const ASPECT = RUNWAY_LENGTH / RUNWAY_WIDTH

export const RUNWAY_SURFACE_MAP_SIZE = 512

function hash(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = smooth(x - x0)
  const ty = smooth(y - y0)
  const n00 = hash(x0, y0)
  const n10 = hash(x0 + 1, y0)
  const n01 = hash(x0, y0 + 1)
  const n11 = hash(x0 + 1, y0 + 1)
  const nx0 = n00 + (n10 - n00) * tx
  const nx1 = n01 + (n11 - n01) * tx
  return nx0 + (nx1 - nx0) * ty
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * plan3.md D3: asphalt tone variation plus rubber-deposit streaks in the
 * touchdown zones. Applied to the runway asphalt box's default UV — three's
 * BoxGeometry maps the +Y face's U to X (width) and V to Z (length), so `v`
 * here runs the runway's length regardless of which physical end is which,
 * and the two rubber bands are placed symmetrically (v ~ 0.2 and v ~ 0.8) so
 * that ambiguity never matters: both ends get one, matching
 * runwayGeometry.ts's own touchdown-marker Z positions (±105, ±72 of ±260
 * half-length, i.e. roughly 20-30% in from each end).
 */
export function createRunwaySurfaceMap(): DataTexture {
  const size = RUNWAY_SURFACE_MAP_SIZE
  const data = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const u = x / size
      const v = y / size
      const field = valueNoise(x / 34, y / (34 / ASPECT)) * 0.6 + valueNoise(x / 16, y / (16 / ASPECT)) * 0.4
      let tone = 0.56 + field * 0.22

      const bandDistance = Math.min(Math.abs(v - 0.2), Math.abs(v - 0.8))
      const bandFalloff = Math.max(0, 1 - bandDistance / 0.085)
      if (bandFalloff > 0) {
        const streakLateral = Math.max(0, 1 - Math.abs(u - 0.5) / 0.4)
        const streakNoise = 0.55 + 0.45 * valueNoise(x / 20, y / (20 / ASPECT))
        tone -= bandFalloff * streakLateral * streakNoise * 0.32
      }

      const byte = clampByte(tone * 255)
      data[offset] = byte
      data[offset + 1] = byte
      data[offset + 2] = byte
      data[offset + 3] = 255
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.name = 'MERIDIAN_runway_wear'
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // Correct regardless of the crosshatch finding above: this face is still
  // genuinely stretched ~16:1, and anisotropic filtering is the real fix
  // for a grazing view of that on hardware that supports it. A fixed,
  // generous value rather than renderer.capabilities.getMaxAnisotropy():
  // this module has no renderer reference, and three.js clamps to the real
  // hardware max regardless.
  texture.anisotropy = 16
  texture.needsUpdate = true
  return texture
}
