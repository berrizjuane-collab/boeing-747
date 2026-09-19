import { groundDetailEnergy, horizonMetrics } from './imageMetrics.mjs'
import sharp from 'sharp'
function percentileFromHistogram(histogram, sampleCount, fraction) {
  const threshold = Math.max(0, Math.ceil(sampleCount * fraction) - 1)
  let accumulated = 0
  for (let index = 0; index < histogram.length; index += 1) {
    accumulated += histogram[index]
    if (accumulated > threshold) return index / (histogram.length - 1)
  }
  return 1
}

function linearChannel(byte) {
  const value = byte / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

export async function measureScreenshot(file, panelBounds) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const luminanceHistogram = new Uint32Array(256)
  let lumaSum = 0
  let clippedWhite = 0

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const luma = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)
    luminanceHistogram[luma] += 1
    lumaSum += luma
    if (red >= 250 && green >= 250 && blue >= 250) clippedWhite += 1
  }

  const pixels = info.width * info.height
  const result = {
    meanLuma: lumaSum / pixels,
    p05Luma: percentileFromHistogram(luminanceHistogram, pixels, 0.05) * 255,
    p50Luma: percentileFromHistogram(luminanceHistogram, pixels, 0.5) * 255,
    p95Luma: percentileFromHistogram(luminanceHistogram, pixels, 0.95) * 255,
    clippedWhitePct: (clippedWhite / pixels) * 100,
    panelContrastEstimate: null,
  }

  const horizon = horizonMetrics(data, info)
  result.horizonRow = horizon.horizonRow
  result.horizonStepEstimate = horizon.horizonStepEstimate
  result.horizonStepMedian = horizon.horizonStepMedian
  result.horizonStepRatio = horizon.horizonStepRatio
  result.groundDetailEnergy = groundDetailEnergy(data, info, horizon.horizonRow)

  if (panelBounds) {
    const left = Math.max(0, Math.floor(panelBounds.x + 4))
    const top = Math.max(0, Math.floor(panelBounds.y + 4))
    const right = Math.min(info.width, Math.ceil(panelBounds.x + panelBounds.width - 4))
    const bottom = Math.min(info.height, Math.ceil(panelBounds.y + panelBounds.height - 4))
    const contrastHistogram = new Uint32Array(1001)
    let panelPixels = 0

    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * info.width + x) * info.channels
        const relativeLuminance =
          linearChannel(data[offset]) * 0.2126 +
          linearChannel(data[offset + 1]) * 0.7152 +
          linearChannel(data[offset + 2]) * 0.0722
        contrastHistogram[Math.min(1000, Math.round(relativeLuminance * 1000))] += 1
        panelPixels += 1
      }
    }

    if (panelPixels > 0) {
      const background = percentileFromHistogram(contrastHistogram, panelPixels, 0.5)
      const foreground = percentileFromHistogram(contrastHistogram, panelPixels, 0.97)
      result.panelContrastEstimate = (foreground + 0.05) / (background + 0.05)
    }
  }

  return result
}

