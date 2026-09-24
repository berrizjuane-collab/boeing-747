import {
  DataTexture,
  EquirectangularReflectionMapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
} from 'three'

/**
 * Small procedural equirectangular fill environment for the cabin. It is
 * intentionally not presented as an HDRI: the interior brief calls for an
 * irradiated, low-cost fill map, while external HDRIs remain a separate
 * asset gate.
 */
function createCabinFillTexture() {
  const width = 64
  const height = 32
  const data = new Uint8Array(width * height * 4)

  for (let y = 0; y < height; y += 1) {
    const vertical = y / (height - 1)
    const ceilingWarmth = 1 - Math.abs(vertical - 0.2) / 0.8
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const sideVariation = 0.92 + 0.08 * Math.sin((x / width) * Math.PI * 2)
      data[i] = Math.round((90 + 110 * ceilingWarmth) * sideVariation)
      data[i + 1] = Math.round((82 + 86 * ceilingWarmth) * sideVariation)
      data[i + 2] = Math.round((74 + 62 * ceilingWarmth) * sideVariation)
      data[i + 3] = 255
    }
  }

  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.colorSpace = SRGBColorSpace
  texture.mapping = EquirectangularReflectionMapping
  texture.needsUpdate = true
  return texture
}

let fill: DataTexture | null = null

/**
 * The cabin's fill environment, as an equirectangular source. It is mixed
 * with the exterior probes by EnvironmentPlaceholder's ProbeBlender and
 * convolved there, like every other probe, so the nose and door crossings
 * blend into and out of the cabin instead of swapping cubemaps.
 */
export function getCabinFillTexture(): Texture {
  fill ??= createCabinFillTexture()
  return fill
}
