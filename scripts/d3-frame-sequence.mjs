import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

const baseURL = process.env.VISUAL_QA_URL ?? 'http://127.0.0.1:4173/boeing-747/'
const outputDir = path.resolve(process.env.D3_QA_DIR ?? 'artifacts/d3-frame-sequence')
const initialSettleMs = Number(process.env.VISUAL_QA_INITIAL_SETTLE_MS ?? 55_000)
const scrollSettleMs = Number(process.env.VISUAL_QA_SCROLL_SETTLE_MS ?? 10_000)
const start = Number(process.env.D3_QA_START ?? 0.7)
const end = Number(process.env.D3_QA_END ?? 0.85)
const step = Number(process.env.D3_QA_STEP ?? 0.01)
const explicitPoints = process.env.D3_QA_POINTS
  ?.split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value))
const viewportWidth = Number(process.env.D3_QA_WIDTH ?? 1440)
const viewportHeight = Number(process.env.D3_QA_HEIGHT ?? 900)
const qualityTarget = process.env.D3_QA_QUALITY?.toLowerCase() ?? 'high'

function percentileFromHistogram(histogram, count, fraction) {
  const threshold = Math.max(0, Math.ceil(count * fraction) - 1)
  let accumulated = 0
  for (let index = 0; index < histogram.length; index += 1) {
    accumulated += histogram[index]
    if (accumulated > threshold) return index
  }
  return histogram.length - 1
}

async function measureSkyContinuity(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const bounds = {
    x: Math.floor(info.width * 0.04),
    y: Math.floor(info.height * 0.15),
    width: Math.floor(info.width * 0.4),
    height: Math.floor(info.height * 0.32),
  }
  const luma = new Uint8Array(info.width * info.height)
  for (let offset = 0, pixel = 0; offset < data.length; offset += info.channels, pixel += 1) {
    luma[pixel] = Math.round(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722)
  }

  const lumaHistogram = new Uint32Array(256)
  const gradientHistogram = new Uint32Array(256)
  let samples = 0
  let lumaSum = 0
  let highGradient = 0
  for (let y = bounds.y + 1; y < bounds.y + bounds.height - 1; y += 1) {
    for (let x = bounds.x + 1; x < bounds.x + bounds.width - 1; x += 1) {
      const index = y * info.width + x
      const value = luma[index]
      const dx = Math.abs(luma[index + 1] - luma[index - 1]) * 0.5
      const dy = Math.abs(luma[index + info.width] - luma[index - info.width]) * 0.5
      const gradient = Math.min(255, Math.round(Math.hypot(dx, dy)))
      lumaHistogram[value] += 1
      gradientHistogram[gradient] += 1
      if (gradient >= 16) highGradient += 1
      lumaSum += value
      samples += 1
    }
  }

  return {
    bounds,
    samples,
    meanLuma: lumaSum / samples,
    uniqueLumaValues: lumaHistogram.reduce((count, value) => count + Number(value > 0), 0),
    gradientP95: percentileFromHistogram(gradientHistogram, samples, 0.95),
    highGradientPct: (highGradient / samples) * 100,
  }
}

if (!(start >= 0 && end <= 1 && start <= end && step > 0)) {
  throw new Error('D3 frame range must satisfy 0 <= start <= end <= 1 and step > 0')
}
if (explicitPoints?.some((value) => value < 0 || value > 1)) {
  throw new Error('Every D3_QA_POINTS value must be within [0, 1]')
}

await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  args: [
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--use-angle=swiftshader',
    '--disable-dev-shm-usage',
  ],
})
const page = await browser.newPage({ viewport: { width: viewportWidth, height: viewportHeight } })
const errors = []

page.on('console', (message) => {
  if (message.type() === 'error') errors.push({ type: 'console', text: message.text() })
})
page.on('pageerror', (error) => errors.push({ type: 'page', text: error.message }))
page.on('requestfailed', (request) => {
  errors.push({ type: 'request', text: `${request.method()} ${request.url()}: ${request.failure()?.errorText}` })
})
page.on('response', (response) => {
  if (response.status() >= 400) errors.push({ type: 'http', text: `${response.status()} ${response.url()}` })
})

await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 120_000 })
await page.locator('.loading-screen').waitFor({ state: 'detached', timeout: 120_000 })
if (qualityTarget) {
  const qualityControl = page.locator('.site-nav__quality')
  // A click is required even when the guessed label already matches: it
  // marks the choice as manual so TierAutoDetect cannot silently downgrade
  // the evidence run a few seconds later.
  await qualityControl.click({ force: true, timeout: 120_000 })
  await page.waitForTimeout(400)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = (await qualityControl.textContent())?.toLowerCase() ?? ''
    if (label.includes(qualityTarget)) break
    await qualityControl.click({ force: true, timeout: 120_000 })
    await page.waitForTimeout(400)
  }
}
await page.waitForTimeout(initialSettleMs)

const frames = []
const frameCount = Math.floor((end - start) / step + 1e-8) + 1
const progresses = explicitPoints?.length
  ? explicitPoints
  : Array.from({ length: frameCount }, (_, index) => Math.min(end, start + step * index))
for (let index = 0; index < progresses.length; index += 1) {
  const progress = progresses[index]
  await page.evaluate((value) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: max * value, behavior: 'instant' })
  }, progress)
  await page.waitForTimeout(scrollSettleMs)

  const name = `d3-${String(index).padStart(2, '0')}-${Math.round(progress * 1000)}.png`
  const framePath = path.join(outputDir, name)
  await page.screenshot({
    path: framePath,
    animations: 'disabled',
    timeout: 180_000,
  })
  const state = await page.evaluate(() => ({
    scrollY: window.scrollY,
    activePanels: Array.from(document.querySelectorAll('[data-active="true"]')).map((element) => ({
      className: element.className,
      section: element.getAttribute('data-section'),
      text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 800) ?? '',
    })),
    quality: document.querySelector('.site-nav__quality')?.textContent?.trim() ?? null,
    performance: window.__MERIDIAN_PERF__ ?? null,
    imagePipeline: window.__MERIDIAN_IMAGE_PIPELINE__ ?? null,
  }))
  frames.push({ name, progress, ...state, skyContinuity: await measureSkyContinuity(framePath) })
}

await browser.close()
const assertionFailures = []
for (const frame of frames) {
  if (frame.skyContinuity.uniqueLumaValues < 24 || frame.skyContinuity.gradientP95 > 16 ||
      frame.skyContinuity.highGradientPct > 2.5) {
    assertionFailures.push(`${frame.name}: sky continuity ${JSON.stringify(frame.skyContinuity)}`)
  }
  if (frame.imagePipeline?.hdri?.mipmaps !== true || frame.imagePipeline?.skyDomeSegments?.[0] < 96 ||
      frame.imagePipeline?.skyDomeSegments?.[1] < 48) {
    assertionFailures.push(`${frame.name}: missing mipmap/dome diagnostics ${JSON.stringify(frame.imagePipeline)}`)
  }
}
for (let index = 1; index < frames.length; index += 1) {
  const delta = Math.abs(frames[index].skyContinuity.meanLuma - frames[index - 1].skyContinuity.meanLuma)
  if (delta > 45) assertionFailures.push(`${frames[index].name}: adjacent sky mean-luma jump ${delta}`)
}
await writeFile(
  path.join(outputDir, 'd3-frame-sequence.json'),
  JSON.stringify(
    {
      baseURL,
      viewport: { width: viewportWidth, height: viewportHeight },
      qualityTarget,
      initialSettleMs,
      scrollSettleMs,
      start,
      end,
      step,
      explicitPoints: explicitPoints ?? null,
      errors,
      assertionFailures,
      frames,
    },
    null,
    2,
  ),
)

if (errors.length > 0 || assertionFailures.length > 0) {
  throw new Error(
    `D3 frame sequence captured ${errors.length} runtime/network errors and ` +
      `${assertionFailures.length} continuity failures`,
  )
}
