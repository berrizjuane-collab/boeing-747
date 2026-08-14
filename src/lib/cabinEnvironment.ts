import {
  DataTexture,
  EquirectangularReflectionMapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three'

/** Low-cost authored cabin irradiance map; not presented as a photographic HDRI. */
export function createCabinFillTexture() {
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
  texture.name = 'MERIDIAN cabin fill environment'
  return texture
}
