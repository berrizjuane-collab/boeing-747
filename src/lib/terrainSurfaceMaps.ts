import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three'

export const TERRAIN_SURFACE_MAP_SIZE = 128

export interface TerrainSurfaceMaps {
  color: DataTexture
  roughness: DataTexture
  roughnessRange: readonly [number, number]
}

function deterministicNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

/**
 * plan3.md C3/E1 (piece 1): the ground used to be one flat `#59664d`. A
 * single per-texel noise pass reads as TV static once tiled across a
 * disc hundreds of units wide — real turf/dirt varies in patches, not
 * pixels. Two octaves fix that: a coarse `16`-texel block hash gives
 * blotchy dry/rich patches, a fine per-texel hash adds grain on top of
 * each patch. Both use the same wrapped-coordinate trick as
 * aircraftSurfaceMaps.ts so the tile repeats seamlessly under
 * RepeatWrapping.
 */
export function createTerrainSurfaceMaps(): TerrainSurfaceMaps {
  const size = TERRAIN_SURFACE_MAP_SIZE
  const colorData = new Uint8Array(size * size * 4)
  const roughnessData = new Uint8Array(size * size * 4)
  let roughnessMin = 255
  let roughnessMax = 0

  const dryColor = { r: 0.42, g: 0.36, b: 0.22 }
  const richColor = { r: 0.29, g: 0.4, b: 0.22 }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const wrappedX = ((x % size) + size) % size
      const wrappedY = ((y % size) + size) % size
      const patchNoise = deterministicNoise(Math.floor(wrappedX / 16), Math.floor(wrappedY / 16))
      const grainNoise = deterministicNoise(wrappedX + 401, wrappedY + 733)

      const patchMix = patchNoise * 0.75 + grainNoise * 0.25
      const grain = 0.9 + grainNoise * 0.2
      colorData[offset] = Math.round(Math.min(255, (dryColor.r + (richColor.r - dryColor.r) * patchMix) * grain * 255))
      colorData[offset + 1] = Math.round(Math.min(255, (dryColor.g + (richColor.g - dryColor.g) * patchMix) * grain * 255))
      colorData[offset + 2] = Math.round(Math.min(255, (dryColor.b + (richColor.b - dryColor.b) * patchMix) * grain * 255))
      colorData[offset + 3] = 255

      // Drier patches (low patchMix) read rougher/duller; richer turf patches
      // read smoother. `roughnessmap_fragment` reads the green channel.
      const roughness = Math.round(Math.min(255, Math.max(0, (0.92 - patchMix * 0.28 + (grainNoise - 0.5) * 0.1) * 255)))
      roughnessMin = Math.min(roughnessMin, roughness)
      roughnessMax = Math.max(roughnessMax, roughness)
      roughnessData[offset] = roughness
      roughnessData[offset + 1] = roughness
      roughnessData[offset + 2] = roughness
      roughnessData[offset + 3] = 255
    }
  }

  const color = new DataTexture(colorData, size, size, RGBAFormat, UnsignedByteType)
  color.name = 'MERIDIAN_terrain_color'
  color.wrapS = RepeatWrapping
  color.wrapT = RepeatWrapping
  color.magFilter = LinearFilter
  color.minFilter = LinearMipmapLinearFilter
  color.generateMipmaps = true
  color.needsUpdate = true

  const roughness = new DataTexture(roughnessData, size, size, RGBAFormat, UnsignedByteType)
  roughness.name = 'MERIDIAN_terrain_roughness'
  roughness.wrapS = RepeatWrapping
  roughness.wrapT = RepeatWrapping
  roughness.magFilter = LinearFilter
  roughness.minFilter = LinearMipmapLinearFilter
  roughness.generateMipmaps = true
  roughness.needsUpdate = true

  return {
    color,
    roughness,
    roughnessRange: [roughnessMin / 255, roughnessMax / 255],
  }
}
