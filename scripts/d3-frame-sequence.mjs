import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

// See scripts/visual-qa.mjs's identical constant for why: some sandboxes
// pre-install Chromium outside Playwright's pinned-revision cache, under
// this fixed path. Falls back to normal resolution everywhere it doesn't exist.
const SANDBOX_CHROMIUM_PATH = '/opt/pw-browsers/chromium'
const executablePath = existsSync(SANDBOX_CHROMIUM_PATH) ? SANDBOX_CHROMIUM_PATH : undefined

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

if (!(start >= 0 && end <= 1 && start <= end && step > 0)) {
  throw new Error('D3 frame range must satisfy 0 <= start <= end <= 1 and step > 0')
}
if (explicitPoints?.some((value) => value < 0 || value > 1)) {
  throw new Error('Every D3_QA_POINTS value must be within [0, 1]')
}

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
  await qualityControl.click()
  await page.waitForTimeout(400)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const label = (await qualityControl.textContent())?.toLowerCase() ?? ''
    if (label.includes(qualityTarget)) break
    await qualityControl.click()
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
  await page.screenshot({
    path: path.join(outputDir, name),
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
  }))
  frames.push({ name, progress, ...state })
}

await browser.close()
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
      frames,
    },
    null,
    2,
  ),
)

if (errors.length > 0) {
  throw new Error(`D3 frame sequence captured ${errors.length} runtime/network errors`)
}
