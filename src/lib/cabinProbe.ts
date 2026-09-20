import {
  DataTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
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

const cache = new WeakMap<WebGLRenderer, WebGLRenderTarget>()

/**
 * The cabin's reflection probe, convolved once per renderer and kept.
 *
 * plan6 4.4/7.3 ask for effects to be prepared before they are visible and
 * for PMREM work to stay out of a visible crossing. This used to run inside
 * InteriorLighting's mount effect, which fires as the camera reaches the
 * threshold — exactly the frame that could least afford it. Calling this at
 * scene setup moves the cost to the load screen.
 */
export function getCabinProbe(renderer: WebGLRenderer): Texture {
  const cached = cache.get(renderer)
  if (cached) return cached.texture

  const fillTexture = createCabinFillTexture()
  const pmrem = new PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromEquirectangular(fillTexture)
  cache.set(renderer, target)
  fillTexture.dispose()
  pmrem.dispose()
  return target.texture
}
