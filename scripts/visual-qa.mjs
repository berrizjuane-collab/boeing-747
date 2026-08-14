import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

const baseURL = process.env.VISUAL_QA_URL ?? 'http://127.0.0.1:4173/boeing-747/'
const outputDir = path.resolve(process.env.VISUAL_QA_DIR ?? 'artifacts/final-visuals')
const mode = process.env.VISUAL_QA_MODE ?? 'all'
const validModes = new Set(['all', 'screenshots', 'video'])
if (!validModes.has(mode)) {
  throw new Error(`VISUAL_QA_MODE must be one of ${[...validModes].join(', ')}; received ${JSON.stringify(mode)}`)
}
const runScreenshots = mode === 'all' || mode === 'screenshots'
const runVideo = mode === 'all' || mode === 'video'
// SwiftShader needs ~45s to compile the textured PBR+dissolve hull shader in
// this project. A shorter wait can produce a perfectly plausible screenshot
// with the aircraft missing, so these are evidence constraints, not cosmetic
// delays. Keep environment overrides for real-GPU runs without weakening the
// safe defaults used by CI and this headless workspace.
const initialSettleMs = Number(process.env.VISUAL_QA_INITIAL_SETTLE_MS ?? 55_000)
const scrollSettleMs = Number(process.env.VISUAL_QA_SCROLL_SETTLE_MS ?? 10_000)
// GitHub's shared SwiftShader runners can need more than three minutes to
// read back the first shadowed interior frame even after shader warm-up.
// Keep the full-resolution High capture and give it honest headroom rather
// than weakening the evidence tier to make CI faster.
const screenshotTimeoutMs = Number(process.env.VISUAL_QA_SCREENSHOT_TIMEOUT_MS ?? 600_000)
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

const report = {
  baseURL,
  mode,
  generatedAt: new Date().toISOString(),
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  httpErrors: [],
  assertionFailures: [],
  captures: [],
  videoFinalState: null,
  videoTimeline: null,
}

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

function measureSilhouetteEdges(lumaValues, width, height) {
  // Stable Mobile Low crop around the A380 in 11-mobile-outro.png. That tier
  // has no temporal grain, and the crop excludes the overlay card, so this is
  // a repeatable silhouette-against-sky AA measurement rather than a whole-
  // frame edge statistic polluted by UI text.
  const bounds = {
    x: 0,
    y: Math.floor(height * 0.28),
    width: Math.floor(width * 0.88),
    height: Math.floor(height * 0.35),
  }
  const histogram = new Uint32Array(256)
  let candidates = 0
  let intermediate = 0
  let evaluated = 0
  const right = Math.min(width - 1, bounds.x + bounds.width)
  const bottom = Math.min(height - 1, bounds.y + bounds.height)

  for (let y = Math.max(1, bounds.y); y < bottom; y += 1) {
    for (let x = Math.max(1, bounds.x); x < right; x += 1) {
      const index = y * width + x
      const dx = Math.abs(lumaValues[index + 1] - lumaValues[index - 1]) * 0.5
      const dy = Math.abs(lumaValues[index + width] - lumaValues[index - width]) * 0.5
      const gradient = Math.min(255, Math.round(Math.hypot(dx, dy)))
      evaluated += 1
      if (gradient < 4) continue
      histogram[gradient] += 1
      candidates += 1
      if (gradient <= 80) intermediate += 1
    }
  }

  return {
    bounds,
    evaluatedPixels: evaluated,
    edgePixels: candidates,
    edgeDensityPct: evaluated > 0 ? (candidates / evaluated) * 100 : 0,
    edgeGradientP50: candidates > 0 ? percentileFromHistogram(histogram, candidates, 0.5) * 255 : null,
    edgeGradientP95: candidates > 0 ? percentileFromHistogram(histogram, candidates, 0.95) * 255 : null,
    intermediateEdgePct: candidates > 0 ? (intermediate / candidates) * 100 : null,
  }
}

async function measureScreenshot(file, panelBounds, measureSilhouette = false) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixels = info.width * info.height
  const lumaValues = new Uint8Array(pixels)
  const luminanceHistogram = new Uint32Array(256)
  let lumaSum = 0
  let saturationSum = 0
  let clippedWhite = 0
  let pixelIndex = 0

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const luma = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)
    lumaValues[pixelIndex] = luma
    luminanceHistogram[luma] += 1
    lumaSum += luma
    const maximum = Math.max(red, green, blue)
    const minimum = Math.min(red, green, blue)
    saturationSum += maximum === 0 ? 0 : (maximum - minimum) / maximum
    if (red >= 250 && green >= 250 && blue >= 250) clippedWhite += 1
    pixelIndex += 1
  }

  const p05Luma = percentileFromHistogram(luminanceHistogram, pixels, 0.05) * 255
  const p90Luma = percentileFromHistogram(luminanceHistogram, pixels, 0.9) * 255
  const p95Luma = percentileFromHistogram(luminanceHistogram, pixels, 0.95) * 255
  let highlightCount = 0
  let highlightRed = 0
  let highlightGreen = 0
  let highlightBlue = 0
  for (let index = 0; index < pixels; index += 1) {
    if (lumaValues[index] < p90Luma) continue
    const offset = index * info.channels
    highlightRed += data[offset]
    highlightGreen += data[offset + 1]
    highlightBlue += data[offset + 2]
    highlightCount += 1
  }
  const highlightMeanRgb = highlightCount > 0
    ? [highlightRed / highlightCount, highlightGreen / highlightCount, highlightBlue / highlightCount]
    : null
  const s6Key = [0xe8 / 255, 0x9b / 255, 0x6c / 255]
  const highlightKeyDistance = highlightMeanRgb
    ? Math.hypot(
        highlightMeanRgb[0] / 255 - s6Key[0],
        highlightMeanRgb[1] / 255 - s6Key[1],
        highlightMeanRgb[2] / 255 - s6Key[2],
      )
    : null

  const edgeHistogram = new Uint32Array(256)
  let edgeSamples = 0
  let intermediateEdges = 0
  const edgeLeft = Math.floor(info.width * 0.2)
  const edgeRight = Math.ceil(info.width * 0.95)
  const edgeTop = Math.floor(info.height * 0.15)
  const edgeBottom = Math.ceil(info.height * 0.85)
  for (let y = edgeTop + 1; y < edgeBottom - 1; y += 1) {
    for (let x = edgeLeft + 1; x < edgeRight - 1; x += 1) {
      const index = y * info.width + x
      const dx = Math.abs(lumaValues[index + 1] - lumaValues[index - 1]) * 0.5
      const dy = Math.abs(lumaValues[index + info.width] - lumaValues[index - info.width]) * 0.5
      const gradient = Math.min(255, Math.round(Math.hypot(dx, dy)))
      edgeHistogram[gradient] += 1
      if (gradient >= 8 && gradient <= 80) intermediateEdges += 1
      edgeSamples += 1
    }
  }

  const result = {
    meanLuma: lumaSum / pixels,
    meanSaturation: saturationSum / pixels,
    p05Luma,
    p50Luma: percentileFromHistogram(luminanceHistogram, pixels, 0.5) * 255,
    p95Luma,
    lumaContrastRatio: (p95Luma + 5) / (p05Luma + 5),
    clippedWhitePct: (clippedWhite / pixels) * 100,
    highlightMeanRgb,
    highlightKeyDistance,
    edgeGradientP95: percentileFromHistogram(edgeHistogram, edgeSamples, 0.95) * 255,
    intermediateEdgePct: (intermediateEdges / edgeSamples) * 100,
    silhouetteEdges: measureSilhouette ? measureSilhouetteEdges(lumaValues, info.width, info.height) : null,
    panelContrastEstimate: null,
  }

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

async function measureExactPixelDiff(referenceFile, candidateFile) {
  const [reference, candidate] = await Promise.all([
    sharp(referenceFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(candidateFile).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])
  if (reference.info.width !== candidate.info.width || reference.info.height !== candidate.info.height ||
      reference.info.channels !== candidate.info.channels) {
    throw new Error('Exact pixel comparison requires images with matching dimensions and channels')
  }
  let differingPixels = 0
  let maximumChannelDelta = 0
  for (let offset = 0; offset < reference.data.length; offset += reference.info.channels) {
    let pixelDiffers = false
    for (let channel = 0; channel < reference.info.channels; channel += 1) {
      const delta = Math.abs(reference.data[offset + channel] - candidate.data[offset + channel])
      if (delta > 0) pixelDiffers = true
      maximumChannelDelta = Math.max(maximumChannelDelta, delta)
    }
    if (pixelDiffers) differingPixels += 1
  }
  return { differingPixels, maximumChannelDelta }
}

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => report.pageErrors.push({ label, text: error.message }))
  page.on('requestfailed', (request) => {
    report.requestFailures.push({
      label,
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown request failure',
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      report.httpErrors.push({ label, status: response.status(), url: response.url() })
    }
  })
}

async function openReady(page, label, url = baseURL) {
  watch(page, label)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.locator('.loading-screen').waitFor({ state: 'detached', timeout: 120_000 })
  await page.waitForTimeout(initialSettleMs)
}

async function setProgress(page, progress) {
  await page.evaluate((value) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: max * value, behavior: 'instant' })
  }, progress)
  await page.waitForTimeout(scrollSettleMs)
}

async function screenshot(page, name, progress) {
  console.log(`[visual-qa] preparing ${name} at ${(progress * 100).toFixed(1)}%`)
  await setProgress(page, progress)
  const target = path.join(outputDir, name)
  await page.screenshot({
    path: target,
    fullPage: false,
    animations: 'disabled',
    timeout: screenshotTimeoutMs,
  })
  const state = await page.evaluate(() => {
    const activeElements = Array.from(document.querySelectorAll('[data-active="true"]'))
    const activePanel = activeElements.find(
      (element) => element.classList.contains('overlay__panel') || element.classList.contains('overlay__threshold-line'),
    )
    const bounds = activePanel?.getBoundingClientRect()
    const quality = document.querySelector('.site-nav__quality')?.textContent?.trim() ?? null

    return {
      activePanels: activeElements
        .map((element) => ({
          className: element.className,
          section: element.getAttribute('data-section'),
          text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 800) ?? '',
        }))
        .filter((entry) => entry.text.length > 0),
      canvas: (() => {
        const canvas = document.querySelector('canvas')
        return canvas ? { width: canvas.width, height: canvas.height } : null
      })(),
      panelBounds: bounds
        ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        : null,
      quality,
      performance: window.__MERIDIAN_PERF__ ?? null,
      imagePipeline: window.__MERIDIAN_IMAGE_PIPELINE__ ?? null,
    }
  })
  const imageMetrics = await measureScreenshot(target, state.panelBounds, name === '11-mobile-outro.png')
  report.captures.push({ name, progress, ...state, imageMetrics })
  console.log(
    `[visual-qa] captured ${name}: ${state.quality ?? 'unknown'} · ` +
      `${state.performance?.drawCalls ?? 'n/a'} calls · ${state.performance?.triangles ?? 'n/a'} triangles`,
  )
}

async function screenshotWithAlteredBackground(page, name, progress) {
  const canvas = page.locator('canvas')
  await canvas.evaluate((element) => {
    element.dataset.qaOriginalFilter = element.style.filter
    element.style.filter = 'brightness(3) saturate(0.15) contrast(0.35)'
  })
  try {
    await screenshot(page, name, progress)
    report.captures.at(-1).backgroundProbe = {
      deliberatelyAltered: true,
      canvasFilter: 'brightness(3) saturate(0.15) contrast(0.35)',
    }
  } finally {
    await canvas.evaluate((element) => {
      element.style.filter = element.dataset.qaOriginalFilter ?? ''
      delete element.dataset.qaOriginalFilter
    })
  }
}

async function setQuality(page, target) {
  const control = page.locator('.site-nav__quality')
  if (!(await control.count())) return
  // Force at least one manual interaction even if auto-detection guessed the
  // requested label; otherwise a pending auto downgrade can mutate the tier
  // midway through a supposedly fixed-quality capture sequence.
  await control.click()
  await page.waitForTimeout(400)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = (await control.textContent())?.toLowerCase() ?? ''
    if (label.includes(target)) return
    await control.click()
    await page.waitForTimeout(400)
  }
}

async function sweepEnvironment(page) {
  return page.evaluate(() => {
    if (!window.__MERIDIAN_ENVIRONMENT_QA__) throw new Error('Environment QA bridge is unavailable')
    return Array.from({ length: 101 }, (_, index) => {
      const progress = index / 100
      return { progress, ...window.__MERIDIAN_ENVIRONMENT_QA__.sample(progress) }
    })
  })
}

async function sampleAnimationFrameTimes(page, frameCount = 9) {
  return page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const deltas = []
        let previous = null
        function sample(now) {
          if (previous !== null) deltas.push(now - previous)
          previous = now
          if (deltas.length >= count) {
            const sorted = [...deltas].sort((a, b) => a - b)
            resolve({
              samples: deltas.map((value) => Number(value.toFixed(3))),
              medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
            })
            return
          }
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      }),
    frameCount,
  )
}

if (runScreenshots) {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const desktopPage = await desktop.newPage()
  await openReady(desktopPage, 'desktop')
  await setQuality(desktopPage, 'high')
  await desktopPage.waitForTimeout(scrollSettleMs)

  for (const [name, progress] of [
    ['01-hero.png', 0.01],
    ['02-takeoff.png', 0.19],
    ['03-spec-sheet.png', 0.36],
    ['04-threshold.png', 0.47],
    ['05a-interior-cockpit.png', 0.515],
    ['05b-interior-economy.png', 0.6],
    ['05c-interior-stair.png', 0.715],
    ['05d-interior-upper-deck.png', 0.795],
    ['06a-exit-frame.png', 0.83],
    ['06b-exit-clean-86.png', 0.86],
    ['06c-sunset-clean-88.png', 0.88],
    ['06d-sunset-outro.png', 0.92],
    ['06e-environment-94.png', 0.94],
    ['06f-environment-96.png', 0.96],
    ['07-footer.png', 0.97],
  ]) {
    await screenshot(desktopPage, name, progress)
    if (name === '03-spec-sheet.png') {
      await screenshotWithAlteredBackground(desktopPage, '03a-spec-sheet-background-probe.png', progress)
    }
  }
  report.environmentSweep = await sweepEnvironment(desktopPage)
  const nullEnvironmentSamples = report.environmentSweep.filter(({ environmentBound }) => !environmentBound)
  if (report.environmentSweep.length !== 101 || nullEnvironmentSamples.length > 0) {
    report.assertionFailures.push(
      `scene.environment must be bound at all 101 samples (received ${report.environmentSweep.length}, ` +
        `${nullEnvironmentSamples.length} null)`,
    )
  }
  await desktop.close()

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const mobilePage = await mobile.newPage()
  await openReady(mobilePage, 'mobile')
  await setQuality(mobilePage, 'low')
  await mobilePage.waitForTimeout(scrollSettleMs)
  for (const [name, progress] of [
    ['08-mobile-hero.png', 0.01],
    ['08a-mobile-taxi-13.png', 0.13],
    ['08b-mobile-gear-24.png', 0.24],
    ['08c-mobile-ground-30.png', 0.30],
    ['09-mobile-spec-sheet.png', 0.36],
    ['10-mobile-interior.png', 0.6],
    ['11-mobile-outro.png', 0.91],
  ]) {
    await screenshot(mobilePage, name, progress)
  }
  await mobile.close()

  // Desktop High includes time-seeded film grain, so two screenshots taken
  // even from the same unchanged build are not a valid pixel oracle. This
  // dedicated low-tier page keeps the desktop viewport and the exact scene,
  // but removes temporal post FX and toggles the preserved source hierarchy
  // against the runtime merge inside one build.
  const gearComparison = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const gearPage = await gearComparison.newPage()
  const gearQaURL = new URL(baseURL)
  gearQaURL.searchParams.set('gear-qa', '1')
  watch(gearPage, 'gear-comparison')
  await gearPage.goto(gearQaURL.href, { waitUntil: 'networkidle', timeout: 120_000 })
  await gearPage.locator('.loading-screen').waitFor({ state: 'detached', timeout: 120_000 })
  await gearPage.waitForTimeout(initialSettleMs)
  await setQuality(gearPage, 'low')
  await setProgress(gearPage, 0.01)
  const sourceFile = path.join(outputDir, 'qa-gear-source.png')
  const mergedFile = path.join(outputDir, 'qa-gear-merged.png')
  await gearPage.evaluate(() => window.__MERIDIAN_GEAR_QA__?.setMode('source'))
  await gearPage.waitForTimeout(scrollSettleMs)
  await gearPage.screenshot({ path: sourceFile, fullPage: false, animations: 'disabled', timeout: screenshotTimeoutMs })
  await gearPage.evaluate(() => window.__MERIDIAN_GEAR_QA__?.setMode('merged'))
  await gearPage.waitForTimeout(scrollSettleMs)
  await gearPage.screenshot({ path: mergedFile, fullPage: false, animations: 'disabled', timeout: screenshotTimeoutMs })
  report.gearPixelEquivalence = await measureExactPixelDiff(sourceFile, mergedFile)
  if (report.gearPixelEquivalence.differingPixels !== 0) {
    report.assertionFailures.push(
      `LandingGear runtime merge must be pixel-exact in the deterministic desktop probe ` +
        `(measured ${report.gearPixelEquivalence.differingPixels} pixels, max channel delta ` +
        `${report.gearPixelEquivalence.maximumChannelDelta})`,
    )
  }
  const aaOnTiming = await sampleAnimationFrameTimes(gearPage)
  const aaOnState = await gearPage.evaluate(() => ({
    pipeline: window.__MERIDIAN_IMAGE_PIPELINE__ ?? null,
    performance: window.__MERIDIAN_PERF__ ?? null,
  }))
  await gearComparison.close()

  const aaOffComparison = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const aaOffPage = await aaOffComparison.newPage()
  const aaOffURL = new URL(baseURL)
  aaOffURL.searchParams.set('aa', 'off')
  await openReady(aaOffPage, 'aa-off-comparison', aaOffURL.href)
  await setQuality(aaOffPage, 'low')
  await setProgress(aaOffPage, 0.01)
  const aaOffTiming = await sampleAnimationFrameTimes(aaOffPage)
  const aaOffState = await aaOffPage.evaluate(() => ({
    pipeline: window.__MERIDIAN_IMAGE_PIPELINE__ ?? null,
    performance: window.__MERIDIAN_PERF__ ?? null,
  }))
  report.aaCost = {
    viewport: '1440x900',
    tier: 'low',
    renderer: 'SwiftShader diagnostic — not physical-hardware FPS evidence',
    enabled: { ...aaOnTiming, ...aaOnState },
    disabled: { ...aaOffTiming, ...aaOffState },
    medianDeltaMs: Number((aaOnTiming.medianMs - aaOffTiming.medianMs).toFixed(3)),
  }
  if (aaOnState.pipeline?.antialiasing !== 'SMAA' || aaOffState.pipeline?.antialiasing !== 'disabled-for-qa') {
    report.assertionFailures.push(`AA cost probe did not toggle the expected pipeline: ${JSON.stringify(report.aaCost)}`)
  }
  await aaOffComparison.close()
}

if (runVideo) {
  const video = await browser.newContext({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1,
    recordVideo: { dir: outputDir, size: { width: 960, height: 600 } },
  })
  const videoStartedAt = Date.now()
  const videoPage = await video.newPage()
  report.videoTimeline = { samples: [], ranges: [] }
  await openReady(videoPage, 'video')
  await setQuality(videoPage, 'low')
  const videoRanges = [
    [0.01, 0.30, 5200],
    [0.38, 0.56, 5200],
    [0.58, 0.96, 7200],
  ]
  for (const [rangeIndex, [start, end, duration]] of videoRanges.entries()) {
    const steps = Math.max(2, Math.ceil(duration / 180))
    const dwellMs = Math.max(0, duration / steps - 34)
    const range = {
      startProgress: start,
      endProgress: end,
      startSeconds: (Date.now() - videoStartedAt) / 1000,
      endSeconds: null,
    }
    report.videoTimeline.ranges.push(range)
    console.log(
      `[visual-qa] recording range ${rangeIndex + 1}/${videoRanges.length}: ` +
        `${(start * 100).toFixed(0)}–${(end * 100).toFixed(0)}% in ${steps + 1} frames`,
    )
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const eased = t * t * (3 - 2 * t)
      const progress = start + (end - start) * eased
      // Keep each scroll write as a separate browser round-trip and wait for a
      // real animation frame. A single in-page timer loop can outrun (or be
      // starved by) SwiftShader and record 100 seconds that never leave S5.
      await videoPage.evaluate(
        (value) =>
          new Promise((resolve) => {
            const max = document.documentElement.scrollHeight - window.innerHeight
            window.scrollTo({ top: max * value, behavior: 'instant' })
            requestAnimationFrame(() => resolve(undefined))
          }),
        progress,
      )
      report.videoTimeline.samples.push({
        progress,
        seconds: (Date.now() - videoStartedAt) / 1000,
      })
      if (dwellMs > 0) await videoPage.waitForTimeout(dwellMs)
      if (step > 0 && (step % 10 === 0 || step === steps)) {
        console.log(`[visual-qa] range ${rangeIndex + 1}: ${step}/${steps} frames`)
      }
    }
    await videoPage.waitForTimeout(700)
    range.endSeconds = (Date.now() - videoStartedAt) / 1000
  }
  await videoPage.waitForTimeout(2_000)
  report.videoFinalState = await videoPage.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    return {
      progress: max > 0 ? window.scrollY / max : 0,
      activePanels: Array.from(document.querySelectorAll('[data-active="true"]'))
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .filter(Boolean),
    }
  })
  const recordedVideo = videoPage.video()
  await videoPage.close()
  if (recordedVideo) await recordedVideo.saveAs(path.join(outputDir, 'meridian-complete-tour.webm'))
  await video.close()
}

await browser.close()

const expectedPanelText = {
  '01-hero.png': 'MERIDIAN',
  '02-takeoff.png': 'S2 — Rodaje y despegue',
  '03-spec-sheet.png': 'Ficha técnica',
  '03a-spec-sheet-background-probe.png': 'Ficha técnica',
  '04-threshold.png': 'Cruzando el umbral',
  '05a-interior-cockpit.png': 'S5 — Cabina de mando',
  '05b-interior-economy.png': 'S5 — Economy',
  '05c-interior-stair.png': 'S5 — Escalera',
  '05d-interior-upper-deck.png': 'S5 — Piso superior',
  '06a-exit-frame.png': 'Fin del recorrido',
  '06b-exit-clean-86.png': 'Fin del recorrido',
  '06c-sunset-clean-88.png': 'Fin del recorrido',
  '06d-sunset-outro.png': 'Fin del recorrido',
  '06e-environment-94.png': 'Fin del recorrido',
  '06f-environment-96.png': 'Créditos y licencias',
  '07-footer.png': 'Créditos y licencias',
  '08-mobile-hero.png': 'MERIDIAN',
  '08a-mobile-taxi-13.png': 'S2 — Rodaje y despegue',
  '08b-mobile-gear-24.png': 'S2 — Rodaje y despegue',
  '08c-mobile-ground-30.png': 'Ficha técnica',
  '09-mobile-spec-sheet.png': 'Ficha técnica',
  '10-mobile-interior.png': 'S5 — Economy',
  '11-mobile-outro.png': 'Fin del recorrido',
}
const budgets = {
  high: { drawCalls: 250, triangles: 1_500_000 },
  mid: { drawCalls: 150, triangles: 800_000 },
  low: { drawCalls: 100, triangles: 500_000 },
}

for (const capture of report.captures) {
  if (!capture.canvas) report.assertionFailures.push(`${capture.name}: no WebGL canvas found`)
  const expected = expectedPanelText[capture.name]
  const narrativePanels = capture.activePanels.filter(
    ({ className }) => className.includes('overlay__panel') || className.includes('overlay__threshold-line'),
  )
  if (expected && (narrativePanels.length !== 1 || !narrativePanels[0].text.includes(expected))) {
    report.assertionFailures.push(
      `${capture.name}: expected exactly one active narrative panel containing ${JSON.stringify(expected)}`,
    )
  }

  const budget = budgets[capture.quality]
  if (budget && capture.performance) {
    if (capture.performance.drawCalls >= budget.drawCalls) {
      report.assertionFailures.push(
        `${capture.name}: ${capture.performance.drawCalls} draw calls must stay below ${budget.drawCalls} for ${capture.quality}`,
      )
    }
    if (capture.performance.triangles >= budget.triangles) {
      report.assertionFailures.push(
        `${capture.name}: ${capture.performance.triangles} triangles must stay below ${budget.triangles} for ${capture.quality}`,
      )
    }
  }

  if (!capture.imagePipeline) {
    report.assertionFailures.push(`${capture.name}: image-pipeline diagnostics are missing`)
  } else {
    if (capture.imagePipeline.toneMappingMode !== 6 || capture.imagePipeline.toneMappingModeName !== 'ACES_FILMIC') {
      report.assertionFailures.push(
        `${capture.name}: effective tone mapping must be ACES_FILMIC/6, received ` +
          `${capture.imagePipeline.toneMappingModeName}/${capture.imagePipeline.toneMappingMode}`,
      )
    }
    if (capture.imagePipeline.antialiasing !== 'SMAA') {
      report.assertionFailures.push(`${capture.name}: SMAA must be active in the production pipeline`)
    }
    if (!capture.imagePipeline.environmentBound) {
      report.assertionFailures.push(`${capture.name}: scene.environment is null`)
    }
  }
}

if (runScreenshots) {
  const hero = report.captures.find(({ name }) => name === '01-hero.png')
  if (!hero || hero.imageMetrics.clippedWhitePct >= 2) {
    report.assertionFailures.push(
      `01-hero.png: clipped-white pixels must stay below 2% (measured ${hero?.imageMetrics.clippedWhitePct ?? 'missing'}%)`,
    )
  }

  const specSheet = report.captures.find(({ name }) => name === '03-spec-sheet.png')
  if (!specSheet || (specSheet.imageMetrics.panelContrastEstimate ?? 0) < 4.5) {
    report.assertionFailures.push(
      `03-spec-sheet.png: measured panel contrast must be at least 4.5:1 (measured ${specSheet?.imageMetrics.panelContrastEstimate ?? 'missing'})`,
    )
  }
  const specSheetProbe = report.captures.find(({ name }) => name === '03a-spec-sheet-background-probe.png')
  if (!specSheetProbe || !specSheetProbe.backgroundProbe?.deliberatelyAltered ||
      (specSheetProbe.imageMetrics.panelContrastEstimate ?? 0) < 4.5) {
    report.assertionFailures.push(
      `03a-spec-sheet-background-probe.png: S3 contrast must remain at least 4.5:1 with a deliberately altered 3D background ` +
      `(measured ${specSheetProbe?.imageMetrics.panelContrastEstimate ?? 'missing'})`,
    )
  }

  const boundary94 = report.captures.find(({ name }) => name === '06e-environment-94.png')
  const boundary96 = report.captures.find(({ name }) => name === '06f-environment-96.png')
  if (boundary94?.imagePipeline?.environmentSource !== 'sunset' ||
      boundary96?.imagePipeline?.environmentSource !== 'sunset') {
    report.assertionFailures.push(
      `S6/S7 environment boundary must retain sunset IBL at 0.94 and 0.96 ` +
        `(received ${boundary94?.imagePipeline?.environmentSource ?? 'missing'} / ` +
        `${boundary96?.imagePipeline?.environmentSource ?? 'missing'})`,
    )
  }

  const s6Grade = report.captures.find(({ name }) => name === '06b-exit-clean-86.png')
  if (!s6Grade || (s6Grade.imagePipeline?.gradingStrength ?? 0) <= 0.4 ||
      !Number.isFinite(s6Grade.imageMetrics.highlightKeyDistance)) {
    report.assertionFailures.push(
      `S6 display-space grade must expose an active strength and measurable highlight-key distance ` +
        `(received strength ${s6Grade?.imagePipeline?.gradingStrength ?? 'missing'}, distance ` +
        `${s6Grade?.imageMetrics.highlightKeyDistance ?? 'missing'})`,
    )
  }

  const mobileSilhouette = report.captures.find(({ name }) => name === '11-mobile-outro.png')
  if (!mobileSilhouette?.imageMetrics.silhouetteEdges ||
      mobileSilhouette.imageMetrics.silhouetteEdges.edgePixels < 100) {
    report.assertionFailures.push(
      `11-mobile-outro.png: deterministic A380 silhouette edge sample is missing or too small ` +
        `(received ${mobileSilhouette?.imageMetrics.silhouetteEdges?.edgePixels ?? 'missing'} edge pixels)`,
    )
  }
}

if (
  runVideo &&
  (!report.videoFinalState ||
    report.videoFinalState.progress < 0.95 ||
    !report.videoFinalState.activePanels.some((text) => text.includes('Créditos y licencias')))
) {
  report.assertionFailures.push(
    `meridian-complete-tour.webm: tour must finish on S7 with visible credits (state ${JSON.stringify(report.videoFinalState)})`,
  )
}

await writeFile(path.join(outputDir, 'visual-qa-report.json'), JSON.stringify(report, null, 2))

if (
  report.consoleErrors.length ||
  report.pageErrors.length ||
  report.requestFailures.length ||
  report.httpErrors.length ||
  report.assertionFailures.length
) {
  throw new Error(
    `Visual QA captured ${report.consoleErrors.length} console errors, ${report.pageErrors.length} page errors, ` +
      `${report.requestFailures.length} failed requests, ${report.httpErrors.length} HTTP errors and ` +
      `${report.assertionFailures.length} acceptance failures`,
  )
}
