import assert from 'node:assert/strict'
import test from 'node:test'
import { groundDetailEnergy, horizonMetrics } from '../scripts/imageMetrics.mjs'

const info = { width: 100, height: 100, channels: 4 }
function outdoorFrame(withOverlays) {
  const data = new Uint8Array(info.width * info.height * info.channels)
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      let luma = y < 60 ? 35 : 115
      // DOM card covers most of the image and has a stronger edge than the
      // real horizon. A center aircraft silhouette also contaminates rows.
      if (withOverlays && x >= 8 && x < 92 && y >= 0 && y < 46) luma = y < 23 ? 10 : 245
      if (withOverlays && x >= 35 && x < 65 && y >= 12 && y < 80) luma = (x + y) % 2 ? 0 : 255
      const i = (y * info.width + x) * info.channels
      data[i] = data[i + 1] = data[i + 2] = luma
      data[i + 3] = 255
    }
  }
  return data
}

test('8.3: horizon and ground metrics ignore DOM, aircraft and central buildings outside the outdoor ROI', () => {
  const options = {
    xRanges: [[0, 0.04], [0.96, 1]],
    excludeRects: [{ x: 8, y: 0, width: 84, height: 46 }],
    deviceScaleFactor: 1,
  }
  const clean = outdoorFrame(false)
  const contaminated = outdoorFrame(true)
  const cleanHorizon = horizonMetrics(clean, info, options)
  const maskedHorizon = horizonMetrics(contaminated, info, options)
  assert.equal(cleanHorizon.horizonRow, 60)
  assert.equal(maskedHorizon.horizonRow, cleanHorizon.horizonRow)
  assert.equal(maskedHorizon.sampledColumnsPerRow, 8)
  assert.equal(groundDetailEnergy(contaminated, info, maskedHorizon.horizonRow, options), groundDetailEnergy(clean, info, cleanHorizon.horizonRow, options))
})
