/** Pixel metrics with explicit screen-space regions and DOM exclusion masks. */

function scaleRects(rects, scale) {
  return (rects ?? []).filter(Boolean).map(({ x, y, width, height }) => ({
    left: Math.floor(x * scale), top: Math.floor(y * scale),
    right: Math.ceil((x + width) * scale), bottom: Math.ceil((y + height) * scale),
  }))
}

function includedColumns(width, xRanges) {
  if (!xRanges?.length) return [[0, width]]
  return xRanges.map(([start, end]) => [
    Math.max(0, Math.floor(start * width)),
    Math.min(width, Math.ceil(end * width)),
  ]).filter(([start, end]) => end > start)
}

function isExcluded(x, y, masks) {
  return masks.some(mask => x >= mask.left && x < mask.right && y >= mask.top && y < mask.bottom)
}

function rowMeanLuma(data, info, { xRanges, excludeRects = [], deviceScaleFactor = 1 } = {}) {
  const rows = new Float64Array(info.height)
  rows.fill(Number.NaN)
  const columns = includedColumns(info.width, xRanges)
  const masks = scaleRects(excludeRects, deviceScaleFactor)
  let sampledColumnsPerRow = 0
  for (const [start, end] of columns) sampledColumnsPerRow += end - start

  for (let y = 0; y < info.height; y += 1) {
    let sum = 0
    let count = 0
    for (const [start, end] of columns) {
      for (let x = start; x < end; x += 1) {
        if (isExcluded(x, y, masks)) continue
        const offset = (y * info.width + x) * info.channels
        sum += data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
        count += 1
      }
    }
    // Ignore rows obscured almost entirely by a DOM card. A lone remaining
    // sliver must not become a false horizon edge.
    if (count >= Math.max(4, sampledColumnsPerRow * 0.25)) rows[y] = sum / count
  }
  return { rows, sampledColumnsPerRow }
}

const HORIZON_SEARCH_TOP_FRACTION = 0.12
const HORIZON_SEARCH_BOTTOM_FRACTION = 0.78
const HORIZON_BAND_HALF_PX = 20
const HORIZON_REFERENCE_HALF_PX = 50

/**
 * Finds the strongest sky/ground luminance step using only explicitly
 * selected clean side rails. The caller supplies the active DOM masks and
 * excludes the centered aircraft/terminal footprint from its ROI. This
 * avoids treating text, the aircraft silhouette, or buildings as a horizon.
 */
export function horizonMetrics(data, info, options = {}) {
  const { rows, sampledColumnsPerRow } = rowMeanLuma(data, info, options)
  const searchStart = Math.max(1, Math.floor(info.height * HORIZON_SEARCH_TOP_FRACTION))
  const searchEnd = Math.min(info.height - 1, Math.floor(info.height * HORIZON_SEARCH_BOTTOM_FRACTION))

  let horizonRow = searchStart
  let peakStep = -1
  for (let y = searchStart; y <= searchEnd; y += 1) {
    if (!Number.isFinite(rows[y]) || !Number.isFinite(rows[y - 1])) continue
    const step = Math.abs(rows[y] - rows[y - 1])
    if (step > peakStep) { peakStep = step; horizonRow = y }
  }

  const bandStart = Math.max(1, horizonRow - HORIZON_BAND_HALF_PX)
  const bandEnd = Math.min(info.height - 1, horizonRow + HORIZON_BAND_HALF_PX)
  let horizonStepEstimate = 0
  for (let y = bandStart; y <= bandEnd; y += 1) {
    if (!Number.isFinite(rows[y]) || !Number.isFinite(rows[y - 1])) continue
    horizonStepEstimate = Math.max(horizonStepEstimate, Math.abs(rows[y] - rows[y - 1]))
  }

  const refStart = Math.max(1, horizonRow - HORIZON_REFERENCE_HALF_PX)
  const refEnd = Math.min(info.height - 1, horizonRow + HORIZON_REFERENCE_HALF_PX)
  const referenceSteps = []
  for (let y = refStart; y <= refEnd; y += 1) {
    if (Number.isFinite(rows[y]) && Number.isFinite(rows[y - 1])) referenceSteps.push(Math.abs(rows[y] - rows[y - 1]))
  }
  referenceSteps.sort((a, b) => a - b)
  const horizonStepMedian = referenceSteps.length ? referenceSteps[Math.floor(referenceSteps.length / 2)] : 0

  return {
    horizonRow,
    horizonStepEstimate,
    horizonStepMedian,
    horizonStepRatio: horizonStepMedian > 0 ? horizonStepEstimate / horizonStepMedian : horizonStepEstimate,
    sampledColumnsPerRow,
  }
}

const GROUND_MID_BAND_START_PX = 15
const GROUND_MID_BAND_HEIGHT_PX = 120

/** Horizontal detail energy in the same masked side rails used for horizon. */
export function groundDetailEnergy(data, info, horizonRow, options = {}) {
  const bandStart = Math.min(info.height - 2, horizonRow + GROUND_MID_BAND_START_PX)
  const bandEnd = Math.min(info.height - 1, horizonRow + GROUND_MID_BAND_START_PX + GROUND_MID_BAND_HEIGHT_PX)
  if (bandEnd <= bandStart) return 0
  const columns = includedColumns(info.width, options.xRanges)
  const masks = scaleRects(options.excludeRects, options.deviceScaleFactor ?? 1)

  let sum = 0
  let count = 0
  for (let y = bandStart; y < bandEnd; y += 1) {
    for (const [start, end] of columns) {
      for (let x = start; x < end - 1; x += 1) {
        if (isExcluded(x, y, masks) || isExcluded(x + 1, y, masks)) continue
        const o1 = (y * info.width + x) * info.channels
        const o2 = o1 + info.channels
        const l1 = data[o1] * 0.2126 + data[o1 + 1] * 0.7152 + data[o1 + 2] * 0.0722
        const l2 = data[o2] * 0.2126 + data[o2 + 1] * 0.7152 + data[o2 + 2] * 0.0722
        sum += Math.abs(l1 - l2)
        count += 1
      }
    }
  }
  return count ? sum / count : 0
}
