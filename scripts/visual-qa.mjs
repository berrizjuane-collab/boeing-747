import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import sharp from 'sharp'

// Some sandboxes pre-install a Chromium build outside Playwright's own
// pinned-revision cache, under a fixed path documented by that environment
// (not something this repo controls or should assume). When the revision
// this package.json's Playwright expects isn't present — a fresh container
// whose browser cache doesn't match what got pinned — launching would fail
// asking to `npx playwright install`, which these sandboxes intentionally
// block. Falling back to that known path only when it actually exists on
// disk keeps every other environment (CI included) on Playwright's normal
// resolution, unchanged.
const SANDBOX_CHROMIUM_PATH = '/opt/pw-browsers/chromium'
const executablePath = existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined

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
  executablePath,
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

async function measureScreenshot(file, panelBounds) {
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

async function openReady(page, label) {
  watch(page, label)
  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 120_000 })
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
    }
  })
  const imageMetrics = await measureScreenshot(target, state.panelBounds)
  report.captures.push({ name, progress, ...state, imageMetrics })
  console.log(
    `[visual-qa] captured ${name}: ${state.quality ?? 'unknown'} · ` +
      `${state.performance?.drawCalls ?? 'n/a'} calls · ${state.performance?.triangles ?? 'n/a'} triangles`,
  )
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
    ['07-footer.png', 0.97],
  ]) {
    await screenshot(desktopPage, name, progress)
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
    // Fase 0 item 01 (plan3.md §4): the pre-existing mobile probes
    // (0.01/0.36/0.6/0.91) never sampled the S1/S2 window where the gear is
    // down and the draw-call count is actually highest — 0.13 sits mid-taxi
    // with the full undercarriage visible, 0.24 sits just before
    // GEAR_RETRACT_END (global ~0.245, ExteriorAsset.tsx), and 0.30 is the
    // first frame past S2 with terrain in view. Inserted right after the
    // hero probe so the scroll sequence stays monotonic; 09/10/11 keep their
    // existing names so nothing that references them by filename breaks.
    ['08b-mobile-taxi-13.png', 0.13],
    ['08c-mobile-gear-retract-24.png', 0.24],
    ['08d-mobile-terrain-30.png', 0.3],
    ['09-mobile-spec-sheet.png', 0.36],
    ['10-mobile-interior.png', 0.6],
    ['11-mobile-outro.png', 0.91],
  ]) {
    await screenshot(mobilePage, name, progress)
  }
  await mobile.close()
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
  '04-threshold.png': 'Cruzando el umbral',
  '05a-interior-cockpit.png': 'S5 — Cabina de mando',
  '05b-interior-economy.png': 'S5 — Economy',
  '05c-interior-stair.png': 'S5 — Escalera',
  '05d-interior-upper-deck.png': 'S5 — Piso superior',
  '06a-exit-frame.png': 'Fin del recorrido',
  '06b-exit-clean-86.png': 'Fin del recorrido',
  '06c-sunset-clean-88.png': 'Fin del recorrido',
  '06d-sunset-outro.png': 'Fin del recorrido',
  '07-footer.png': 'Créditos y licencias',
  '08-mobile-hero.png': 'MERIDIAN',
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
