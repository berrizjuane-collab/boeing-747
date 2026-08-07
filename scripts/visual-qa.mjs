import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = process.env.VISUAL_QA_URL ?? 'http://127.0.0.1:4173'
const outputDir = path.resolve(process.env.VISUAL_QA_DIR ?? 'artifacts/final-visuals')
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
  generatedAt: new Date().toISOString(),
  consoleErrors: [],
  pageErrors: [],
  captures: [],
}

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push({ label, text: message.text() })
  })
  page.on('pageerror', (error) => report.pageErrors.push({ label, text: error.message }))
}

async function openReady(page, label) {
  watch(page, label)
  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 120_000 })
  await page.locator('.loading-screen').waitFor({ state: 'detached', timeout: 120_000 })
  await page.waitForTimeout(1_200)
}

async function setProgress(page, progress) {
  await page.evaluate((value) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: max * value, behavior: 'instant' })
  }, progress)
  await page.waitForTimeout(1_600)
}

async function screenshot(page, name, progress) {
  await setProgress(page, progress)
  const target = path.join(outputDir, name)
  await page.screenshot({ path: target, fullPage: false, animations: 'disabled', timeout: 120_000 })
  report.captures.push({ name, progress })
}

const desktop = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: outputDir, size: { width: 1280, height: 800 } },
})
const desktopPage = await desktop.newPage()
await openReady(desktopPage, 'desktop')

const desktopShots = [
  ['01-hero.png', 0.01],
  ['02-takeoff.png', 0.19],
  ['03-spec-sheet.png', 0.36],
  ['04-threshold.png', 0.47],
  ['05-interior.png', 0.66],
  ['06-sunset-outro.png', 0.91],
]
for (const [name, progress] of desktopShots) await screenshot(desktopPage, name, progress)

await desktopPage.evaluate(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const max = document.documentElement.scrollHeight - window.innerHeight
  const ranges = [
    [0.01, 0.30, 5200],
    [0.38, 0.56, 5200],
    [0.58, 0.96, 7200],
  ]
  for (const [start, end, duration] of ranges) {
    window.scrollTo({ top: max * start, behavior: 'instant' })
    await delay(900)
    const began = performance.now()
    while (performance.now() - began < duration) {
      const t = Math.min(1, (performance.now() - began) / duration)
      const eased = t * t * (3 - 2 * t)
      window.scrollTo({ top: max * (start + (end - start) * eased), behavior: 'instant' })
      await delay(33)
    }
    await delay(700)
  }
})
const recordedVideo = desktopPage.video()
await desktopPage.close()
if (recordedVideo) await recordedVideo.saveAs(path.join(outputDir, 'meridian-complete-tour.webm'))
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
for (const [name, progress] of [
  ['07-mobile-hero.png', 0.01],
  ['08-mobile-spec-sheet.png', 0.36],
  ['09-mobile-interior.png', 0.66],
  ['10-mobile-outro.png', 0.91],
]) {
  await screenshot(mobilePage, name, progress)
}
await mobile.close()

await browser.close()
await writeFile(path.join(outputDir, 'visual-qa-report.json'), JSON.stringify(report, null, 2))

if (report.consoleErrors.length || report.pageErrors.length) {
  throw new Error(
    `Visual QA captured ${report.consoleErrors.length} console errors and ${report.pageErrors.length} page errors`,
  )
}
