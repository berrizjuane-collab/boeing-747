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
  let assertResolution = null
  let assertBrightestBody = null

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
    } else if (argument.startsWith('--assert-resolution=')) {
      const match = /^(\d+)x(\d+)$/.exec(argument.slice('--assert-resolution='.length))
      if (!match) throw new Error('--assert-resolution must use WIDTHxHEIGHT.')
      assertResolution = [Number(match[1]), Number(match[2])]
    } else if (argument.startsWith('--assert-brightest-body=')) {
      assertBrightestBody = argument.slice('--assert-brightest-body='.length)
      if (!assertBrightestBody) throw new Error('--assert-brightest-body requires a file basename.')
    } else {
      files.push(argument)
    }
  }

  return {
    files: files.length > 0 ? files : DEFAULT_FILES,
    assertRatio,
    assertMedianRatio,
    assertResolution,
    assertBrightestBody,
  }
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
  return {
    file: path.relative(process.cwd(), absolutePath),
    bytes: buffer.byteLength,
    resolution: [parsed.width, parsed.height],
    meanLuminance: sum / luminances.length,
    medianLuminance: percentile(luminances, 0.5),
    p95Luminance: percentile(luminances, 0.95),
    p99Luminance: percentile(luminances, 0.99),
    maxLuminance: maximum,
  }
}

const { files, assertRatio, assertMedianRatio, assertResolution, assertBrightestBody } = parseArguments(
  process.argv.slice(2),
)
const measurements = await Promise.all(files.map(measure))
const means = measurements.map(({ meanLuminance }) => meanLuminance)
const medians = measurements.map(({ medianLuminance }) => medianLuminance)
const maxMeanRatio = Math.max(...means) / Math.min(...means)
const maxMedianRatio = Math.max(...medians) / Math.min(...medians)
const brightestBody = measurements.reduce((brightest, item) =>
  item.medianLuminance > brightest.medianLuminance ? item : brightest,
)
const report = {
  measurements,
  maxMeanRatio,
  maxMedianRatio,
  brightestBody: path.basename(brightestBody.file),
  totalBytes: measurements.reduce((sum, measurement) => sum + measurement.bytes, 0),
}

console.log(JSON.stringify(report, null, 2))

if (assertRatio !== null && maxMeanRatio >= assertRatio) {
  console.error(`HDRI mean-luminance ratio ${maxMeanRatio.toFixed(3)} must be below ${assertRatio}.`)
  process.exitCode = 1
}

if (assertMedianRatio !== null && maxMedianRatio >= assertMedianRatio) {
  console.error(`HDRI median-luminance ratio ${maxMedianRatio.toFixed(3)} must be below ${assertMedianRatio}.`)
  process.exitCode = 1
}

if (
  assertResolution !== null &&
  measurements.some(({ resolution }) => resolution[0] !== assertResolution[0] || resolution[1] !== assertResolution[1])
) {
  console.error(`Every HDRI must be ${assertResolution[0]}x${assertResolution[1]}.`)
  process.exitCode = 1
}

if (assertBrightestBody !== null && path.basename(brightestBody.file) !== assertBrightestBody) {
  console.error(
    `Brightest sky body is ${path.basename(brightestBody.file)}; expected ${assertBrightestBody} by median luminance.`,
  )
  process.exitCode = 1
}
