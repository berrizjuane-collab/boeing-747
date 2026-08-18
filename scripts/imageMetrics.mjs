/**
 * Pure, side-effect-free pixel metrics shared by scripts/visual-qa.mjs and
 * by tests/plan4 baseline drivers. Split out of visual-qa.mjs specifically
 * so these can be imported (and unit-exercised) without triggering that
 * script's top-level `chromium.launch()` — importing visual-qa.mjs for any
 * reason runs the whole capture pipeline, which this module has no part in.
 */

function rowMeanLuma(data, info) {
  const rows = new Float64Array(info.height)
  for (let y = 0; y < info.height; y += 1) {
    let sum = 0
    const rowOffset = y * info.width * info.channels
    for (let x = 0; x < info.width; x += 1) {
      const offset = rowOffset + x * info.channels
      sum += data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722
    }
    rows[y] = sum / info.width
  }
  return rows
}

const HORIZON_SEARCH_TOP_FRACTION = 0.12
const HORIZON_SEARCH_BOTTOM_FRACTION = 0.78
const HORIZON_BAND_HALF_PX = 20
const HORIZON_REFERENCE_HALF_PX = 50

/**
 * plan4.md bug #14 / Fase I4: today the sky dome doesn't participate in
 * fog (skyDomeMaterial.ts, EnvironmentPlaceholder.tsx's sunset dome), so
 * the ground (fully fogged near its far edge) meets raw HDRI sky as a hard
 * colour step — the "corte recto en el horizonte" the round exists to
 * close. This locates that step from the image itself instead of a
 * hand-picked pixel row per camera keyframe: scan per-row mean luma for
 * its steepest vertical jump within a plausible sky/ground search band
 * (excludes the top/bottom margins where overlay chrome and vignette live),
 * then compare that jump to the median jump of its own 100-row
 * neighbourhood. A closed horizon should look like the rest of the
 * gradient, not spike above it.
 */
export function horizonMetrics(data, info) {
  const rows = rowMeanLuma(data, info)
  const searchStart = Math.max(1, Math.floor(info.height * HORIZON_SEARCH_TOP_FRACTION))
  const searchEnd = Math.min(info.height - 1, Math.floor(info.height * HORIZON_SEARCH_BOTTOM_FRACTION))

  let horizonRow = searchStart
  let peakStep = -1
  for (let y = searchStart; y <= searchEnd; y += 1) {
    const step = Math.abs(rows[y] - rows[y - 1])
    if (step > peakStep) {
      peakStep = step
      horizonRow = y
    }
  }

  const bandStart = Math.max(1, horizonRow - HORIZON_BAND_HALF_PX)
  const bandEnd = Math.min(info.height - 1, horizonRow + HORIZON_BAND_HALF_PX)
  let horizonStepEstimate = 0
  for (let y = bandStart; y <= bandEnd; y += 1) {
    horizonStepEstimate = Math.max(horizonStepEstimate, Math.abs(rows[y] - rows[y - 1]))
  }

  const refStart = Math.max(1, horizonRow - HORIZON_REFERENCE_HALF_PX)
  const refEnd = Math.min(info.height - 1, horizonRow + HORIZON_REFERENCE_HALF_PX)
  const referenceSteps = []
  for (let y = refStart; y <= refEnd; y += 1) referenceSteps.push(Math.abs(rows[y] - rows[y - 1]))
  referenceSteps.sort((a, b) => a - b)
  const horizonStepMedian = referenceSteps.length ? referenceSteps[Math.floor(referenceSteps.length / 2)] : 0

  return {
    horizonRow,
    horizonStepEstimate,
    horizonStepMedian,
    horizonStepRatio: horizonStepMedian > 0 ? horizonStepEstimate / horizonStepMedian : horizonStepEstimate,
  }
}

const GROUND_MID_BAND_START_PX = 15
const GROUND_MID_BAND_HEIGHT_PX = 120

/**
 * plan4.md Fase H2: "el bosque cierra el horizonte" and "hay textura de
 * terreno" have to be more than a screenshot opinion. Mean horizontal
 * neighbour-pixel luma delta in the ground band just below the horizon
 * (today: a single flat-colour planeGeometry, EnvironmentPlaceholder.tsx)
 * is close to 0 for a flat colour surface and rises once real terrain
 * texture and tree silhouettes occupy that band — a falsifiable stand-in
 * for "this band has detail" that doesn't require camera-space distance.
 */
export function groundDetailEnergy(data, info, horizonRow) {
  const bandStart = Math.min(info.height - 2, horizonRow + GROUND_MID_BAND_START_PX)
  const bandEnd = Math.min(info.height - 1, horizonRow + GROUND_MID_BAND_START_PX + GROUND_MID_BAND_HEIGHT_PX)
  if (bandEnd <= bandStart) return 0

  let sum = 0
  let count = 0
  for (let y = bandStart; y < bandEnd; y += 1) {
    const rowOffset = y * info.width * info.channels
    for (let x = 0; x < info.width - 1; x += 1) {
      const o1 = rowOffset + x * info.channels
      const o2 = o1 + info.channels
      const l1 = data[o1] * 0.2126 + data[o1 + 1] * 0.7152 + data[o1 + 2] * 0.0722
      const l2 = data[o2] * 0.2126 + data[o2 + 1] * 0.7152 + data[o2 + 2] * 0.0722
      sum += Math.abs(l1 - l2)
      count += 1
    }
  }
  return count > 0 ? sum / count : 0
}

