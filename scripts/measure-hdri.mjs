import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { FloatType } from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'

const DEFAULT_FILES = [
  'public/hdri/golden-hour.hdr',
  'public/hdri/high-altitude.hdr',
  'public/hdri/sunset.hdr',
]

function parseArguments(argv) {
  const files = []
  let assertRatio = null
  let assertMedianRatio = null

  for (const argument of argv) {
    if (argument.startsWith('--assert-ratio=')) {
      assertRatio = Number(argument.slice('--assert-ratio='.length))
      if (!Number.isFinite(assertRatio) || assertRatio <= 1) {
        throw new Error('--assert-ratio must be a finite number greater than 1.')
      }
    } else if (argument.startsWith('--assert-median-ratio=')) {
      assertMedianRatio = Number(argument.slice('--assert-median-ratio='.length))
      if (!Number.isFinite(assertMedianRatio) || assertMedianRatio <= 1) {
        throw new Error('--assert-median-ratio must be a finite number greater than 1.')
      }
    } else {
      files.push(argument)
    }
  }

  return { files: files.length > 0 ? files : DEFAULT_FILES, assertRatio, assertMedianRatio }
}

function percentile(sortedValues, fraction) {
  const index = Math.min(sortedValues.length - 1, Math.floor(fraction * sortedValues.length))
  return sortedValues[index]
}

async function measure(file) {
  const absolutePath = path.resolve(file)
  const buffer = await readFile(absolutePath)
  const parsed = new HDRLoader().setDataType(FloatType).parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  )
  const luminances = new Float64Array(parsed.width * parsed.height)
  let sum = 0
  let maximum = 0

  for (let pixel = 0; pixel < luminances.length; pixel += 1) {
    const offset = pixel * 4
    const luminance =
      parsed.data[offset] * 0.2126 + parsed.data[offset + 1] * 0.7152 + parsed.data[offset + 2] * 0.0722
    luminances[pixel] = luminance
    sum += luminance
    maximum = Math.max(maximum, luminance)
  }

  luminances.sort()
  const medianLuminance = percentile(luminances, 0.5)
  // plan3.md bug #3/B3: same sky-body-vs-sun-disc split
  // blender/generate_hdri.py's _sky_body_mean_luminance calibrates against —
  // a plain whole-image mean is dominated by the sun disc's few hundred
  // texels almost regardless of how bright the sky itself reads, which is
  // the entire bug. Excluding anything past 50x the image's own median
  // (every preset's p99 sits within ~19x, so this clears real sky glow by a
  // wide margin and only cuts the disc + immediate corona) gives a mean
  // that's actually comparable across presets and still means something for
  // rough-surface IBL, unlike the disc-swamped whole-image mean or a median
  // alone (which throws the sun's real energy contribution away entirely).
  let skyBodySum = 0
  let skyBodyCount = 0
  const skyBodyThreshold = medianLuminance * 50
  for (let pixel = 0; pixel < luminances.length; pixel += 1) {
    if (luminances[pixel] <= skyBodyThreshold) {
      skyBodySum += luminances[pixel]
      skyBodyCount += 1
    }
  }

  return {
    file: path.relative(process.cwd(), absolutePath),
    resolution: [parsed.width, parsed.height],
    skyBodyMeanLuminance: skyBodySum / skyBodyCount,
    skyBodyPixelFraction: skyBodyCount / luminances.length,
    medianLuminance,
    p95Luminance: percentile(luminances, 0.95),
    p99Luminance: percentile(luminances, 0.99),
    maxLuminance: maximum,
    /** Diagnostic only, not asserted — dominated by the sun disc by design
     * (bug #3), kept here only so a regression in the disc itself is still
     * visible in the report. */
    wholeImageMeanLuminance: sum / luminances.length,
  }
}

const { files, assertRatio, assertMedianRatio } = parseArguments(process.argv.slice(2))
const measurements = await Promise.all(files.map(measure))
const skyBodyMeans = measurements.map(({ skyBodyMeanLuminance }) => skyBodyMeanLuminance)
const medians = measurements.map(({ medianLuminance }) => medianLuminance)
// plan3.md bug #3/B3: --assert-ratio used to gate the whole-image mean —
// meaningless once calibration targets the sky body instead (see
// blender/generate_hdri.py), since the sun disc's absolute brightness after
// that calibration is a side effect of how much each preset's sky needed
// scaling, not something this ratio should be constraining. Gates the
// sky-body mean instead, which is the metric that's actually calibrated.
const maxMeanRatio = Math.max(...skyBodyMeans) / Math.min(...skyBodyMeans)
const maxMedianRatio = Math.max(...medians) / Math.min(...medians)
const report = { measurements, maxMeanRatio, maxMedianRatio }

console.log(JSON.stringify(report, null, 2))

if (assertRatio !== null && maxMeanRatio >= assertRatio) {
  console.error(`HDRI sky-body mean-luminance ratio ${maxMeanRatio.toFixed(3)} must be below ${assertRatio}.`)
  process.exitCode = 1
}

if (assertMedianRatio !== null && maxMedianRatio >= assertMedianRatio) {
  console.error(`HDRI median-luminance ratio ${maxMedianRatio.toFixed(3)} must be below ${assertMedianRatio}.`)
  process.exitCode = 1
}
