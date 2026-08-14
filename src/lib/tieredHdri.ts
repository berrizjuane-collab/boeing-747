import {
  DataUtils,
  HalfFloatType,
  LinearMipmapLinearFilter,
  type DataTextureLoaderTexData,
  type LoadingManager,
} from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import type { QualityTier } from '../state/qualityStore'

export const HDRI_SOURCE_RESOLUTION = [4096, 2048] as const
export const HDRI_GPU_WIDTH: Record<QualityTier, number> = {
  high: 4096,
  mid: 2048,
  low: 1024,
}

const HDRI_COUNT = 3
const CHANNELS = 4
const HALF_FLOAT_BYTES = 2
const MIP_CHAIN_FACTOR = 4 / 3

export function estimatedHdriGpuBytes(tier: QualityTier) {
  const width = HDRI_GPU_WIDTH[tier]
  const height = width / 2
  return Math.ceil(width * height * CHANNELS * HALF_FLOAT_BYTES * MIP_CHAIN_FACTOR * HDRI_COUNT)
}

function downsampleHalfFloatRgba(source: Uint16Array, width: number, height: number, factor: number) {
  if (factor === 1) return { data: source, width, height }
  if (width % factor !== 0 || height % factor !== 0) {
    throw new Error(`HDRI ${width}x${height} is not divisible by tier factor ${factor}`)
  }

  const targetWidth = width / factor
  const targetHeight = height / factor
  const target = new Uint16Array(targetWidth * targetHeight * CHANNELS)
  const sampleCount = factor * factor
  const opaque = DataUtils.toHalfFloat(1)

  for (let targetY = 0; targetY < targetHeight; targetY += 1) {
    for (let targetX = 0; targetX < targetWidth; targetX += 1) {
      let red = 0
      let green = 0
      let blue = 0
      for (let offsetY = 0; offsetY < factor; offsetY += 1) {
        const sourceY = targetY * factor + offsetY
        for (let offsetX = 0; offsetX < factor; offsetX += 1) {
          const sourceX = targetX * factor + offsetX
          const sourceOffset = (sourceY * width + sourceX) * CHANNELS
          red += DataUtils.fromHalfFloat(source[sourceOffset])
          green += DataUtils.fromHalfFloat(source[sourceOffset + 1])
          blue += DataUtils.fromHalfFloat(source[sourceOffset + 2])
        }
      }
      const targetOffset = (targetY * targetWidth + targetX) * CHANNELS
      target[targetOffset] = DataUtils.toHalfFloat(red / sampleCount)
      target[targetOffset + 1] = DataUtils.toHalfFloat(green / sampleCount)
      target[targetOffset + 2] = DataUtils.toHalfFloat(blue / sampleCount)
      target[targetOffset + 3] = opaque
    }
  }

  return { data: target, width: targetWidth, height: targetHeight }
}

abstract class TieredHdriLoader extends HDRLoader {
  private readonly downsampleFactor: number

  constructor(
    downsampleFactor: number,
    manager?: LoadingManager,
  ) {
    super(manager)
    this.downsampleFactor = downsampleFactor
    this.setDataType(HalfFloatType)
  }

  override parse(buffer: ArrayBuffer): DataTextureLoaderTexData {
    const parsed = super.parse(buffer)
    if (!(parsed.data instanceof Uint16Array) || parsed.width === undefined || parsed.height === undefined) {
      throw new Error('Plan 3 HDRI loader requires half-float RGBA source data')
    }
    const resized = downsampleHalfFloatRgba(parsed.data, parsed.width, parsed.height, this.downsampleFactor)
    return {
      ...parsed,
      ...resized,
      generateMipmaps: true,
      minFilter: LinearMipmapLinearFilter,
    }
  }
}

export class HighHdriLoader extends TieredHdriLoader {
  constructor(manager?: LoadingManager) {
    super(1, manager)
  }
}

export class MidHdriLoader extends TieredHdriLoader {
  constructor(manager?: LoadingManager) {
    super(2, manager)
  }
}

export class LowHdriLoader extends TieredHdriLoader {
  constructor(manager?: LoadingManager) {
    super(4, manager)
  }
}

export const HDRI_LOADER_BY_TIER: Record<QualityTier, typeof HDRLoader> = {
  high: HighHdriLoader,
  mid: MidHdriLoader,
  low: LowHdriLoader,
}
