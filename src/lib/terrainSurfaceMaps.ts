import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

export const TERRAIN_SURFACE_MAP_SIZE = 256

function hash(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Bilinearly-interpolated value noise on the integer lattice — smooth
 * blobby patches instead of the pure static a raw hash grid would give. */
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

/** Three-octave field: coarse dry/moist patches, mid-scale clumping, fine grain. */
function fieldAt(x: number, y: number): number {
  return valueNoise(x / 27, y / 27) * 0.5 + valueNoise(x / 9, y / 9) * 0.32 + valueNoise(x * 0.9, y * 0.9) * 0.18
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export interface TerrainSurfaceMaps {
  albedo: DataTexture
  roughness: DataTexture
}

/**
 * plan3.md C3 / Fase E piece 1: deterministic ground detail, same authored-
 * math-not-a-downloaded-asset approach as aircraftSurfaceMaps.ts (§3.2
 * explicitly extends that pattern to the terrain). Tiled via RepeatWrapping
 * over the camera-following terrain disc's world-space UV
 * (EnvironmentPlaceholder.tsx's onBeforeCompile) so it reads as patchy,
 * varied ground instead of the single flat color plan3.md's audit found
 * (§1.2) — every value here is a pure function of (x, y), so two calls
 * produce byte-identical textures (tests/terrain-surface-maps.test.mjs), and
 * the section tint (theme.ground) still multiplies this per-pixel result, so
 * dark sections (S5/S7) stay dark (E6) rather than turning into a lit green
 * field.
 */
export function createTerrainSurfaceMaps(): TerrainSurfaceMaps {
  const size = TERRAIN_SURFACE_MAP_SIZE
  const albedoData = new Uint8Array(size * size * 4)
  const roughnessData = new Uint8Array(size * size * 4)

  // Two authored tint multipliers patches blend between, centered near 1.0
  // so multiplying by theme.ground doesn't systematically shift a section's
  // overall brightness — only its patch-to-patch variation.
  const cool: readonly [number, number, number] = [0.82, 0.9, 0.74]
  const dry: readonly [number, number, number] = [1.14, 1.0, 0.76]

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const field = fieldAt(x, y)
      const grain = (hash(x + 401, y + 733) - 0.5) * 0.16

      albedoData[offset] = clampByte((cool[0] + (dry[0] - cool[0]) * field + grain) * 255)
      albedoData[offset + 1] = clampByte((cool[1] + (dry[1] - cool[1]) * field + grain) * 255)
      albedoData[offset + 2] = clampByte((cool[2] + (dry[2] - cool[2]) * field + grain) * 255)
      albedoData[offset + 3] = 255

      const roughnessByte = clampByte((0.78 + field * 0.2 + (hash(x + 91, y + 17) - 0.5) * 0.06) * 255)
      roughnessData[offset] = roughnessByte
      roughnessData[offset + 1] = roughnessByte
      roughnessData[offset + 2] = roughnessByte
      roughnessData[offset + 3] = 255
    }
  }

  const makeTexture = (data: Uint8Array, name: string) => {
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
    texture.name = name
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }

  return {
    albedo: makeTexture(albedoData, 'MERIDIAN_terrain_albedo'),
    roughness: makeTexture(roughnessData, 'MERIDIAN_terrain_roughness'),
  }
}
