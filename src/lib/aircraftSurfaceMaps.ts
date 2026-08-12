import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three'

export const AIRCRAFT_SURFACE_MAP_SIZE = 64

export interface AircraftSurfaceMaps {
  normal: DataTexture
  roughness: DataTexture
  roughnessRange: readonly [number, number]
}

function deterministicNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

function heightAt(x: number, y: number): number {
  const size = AIRCRAFT_SURFACE_MAP_SIZE
  const wrappedX = ((x % size) + size) % size
  const wrappedY = ((y % size) + size) % size
  const verticalSeam = wrappedX % 32 <= 1 ? -0.7 : 0
  const horizontalSeam = wrappedY % 16 <= 1 ? -0.55 : 0
  const staggeredRivet = wrappedY % 16 === 4 && (wrappedX + Math.floor(wrappedY / 16) * 4) % 8 <= 1 ? 0.22 : 0
  return verticalSeam + horizontalSeam + staggeredRivet + (deterministicNoise(wrappedX, wrappedY) - 0.5) * 0.08
}

/**
 * Small authored data maps keep the original licensed livery untouched while
 * supplying the missing physical surface channels. The tile is deliberately
 * subtle: broad material identity comes from the albedo-aware shader profile,
 * while these maps add panel seams, rivets and non-uniform micro-roughness.
 */
export function createAircraftSurfaceMaps(): AircraftSurfaceMaps {
  const size = AIRCRAFT_SURFACE_MAP_SIZE
  const normalData = new Uint8Array(size * size * 4)
  const roughnessData = new Uint8Array(size * size * 4)
  let roughnessMin = 255
  let roughnessMax = 0

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const slopeX = heightAt(x + 1, y) - heightAt(x - 1, y)
      const slopeY = heightAt(x, y + 1) - heightAt(x, y - 1)
      const nx = -slopeX * 0.28
      const ny = -slopeY * 0.28
      const nz = 1
      const inverseLength = 1 / Math.hypot(nx, ny, nz)

      normalData[offset] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 2] = Math.round((nz * inverseLength * 0.5 + 0.5) * 255)
      normalData[offset + 3] = 255

      const onPanelSeam = x % 32 <= 1 || y % 16 <= 1
      const noise = deterministicNoise(x + 101, y + 307)
      const roughness = Math.round(Math.min(255, Math.max(0, (onPanelSeam ? 0.68 : 0.39 + noise * 0.13) * 255)))
      roughnessMin = Math.min(roughnessMin, roughness)
      roughnessMax = Math.max(roughnessMax, roughness)
      roughnessData[offset] = roughness
      roughnessData[offset + 1] = roughness
      roughnessData[offset + 2] = roughness
      roughnessData[offset + 3] = 255
    }
  }

  const normal = new DataTexture(normalData, size, size, RGBAFormat, UnsignedByteType)
  normal.name = 'MERIDIAN_A380_panel_normal'
  normal.wrapS = RepeatWrapping
  normal.wrapT = RepeatWrapping
  normal.repeat.set(10, 6)
  normal.magFilter = LinearFilter
  normal.minFilter = LinearMipmapLinearFilter
  normal.generateMipmaps = true
  normal.needsUpdate = true

  const roughness = new DataTexture(roughnessData, size, size, RGBAFormat, UnsignedByteType)
  roughness.name = 'MERIDIAN_A380_surface_roughness'
  roughness.wrapS = RepeatWrapping
  roughness.wrapT = RepeatWrapping
  roughness.repeat.copy(normal.repeat)
  roughness.magFilter = LinearFilter
  roughness.minFilter = LinearMipmapLinearFilter
  roughness.generateMipmaps = true
  roughness.needsUpdate = true

  return {
    normal,
    roughness,
    roughnessRange: [roughnessMin / 255, roughnessMax / 255],
  }
}
