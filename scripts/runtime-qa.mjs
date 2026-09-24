import { measureScreenshot } from './qa-image-metrics.mjs'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { startQaServer } from './qa-server.mjs'
import path from 'node:path'
import { chromium } from 'playwright'

const out = path.resolve(process.env.QA_DIR ?? 'artifacts/phase6/runtime')
const tier = process.env.QA_TIER ?? 'low'
const timeout = Number(process.env.QA_TIMEOUT ?? 180000)
const budgets = { low: [100, 500_000], mid: [150, 800_000], high: [250, 1_500_000] }
const budget = budgets[tier]
if (!budget) throw new Error(`Unknown tier: ${tier}`)
const editorialCaptures = [
  ['opening', .01], ['takeoff-first', .13], ['takeoff-roll', .19], ['takeoff-end', .27],
  ['climb-entry', .30], ['spec', .36], ['threshold', .47], ['cockpit', .515],
  ['economy', .60], ['stair', .715], ['upper', .795], ['exit-opening', .83],
  ['exit-middle', .86], ['exit-end', .88], ['departure', .92], ['footer', .97],
]
const requested = process.env.QA_CAPTURES === 'none' ? []
  : (process.env.QA_CAPTURES ? process.env.QA_CAPTURES.split(',') : editorialCaptures.map(([name]) => name))
const report = { source: process.env.QA_SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirty: !!execFileSync('git', ['status', '--porcelain']).length, tier, captures: [], trace: [], errors: [], longTasks: [], timings: {}, lastAction: 'start', thresholds: {drawCalls: budget[0], visibleTriangles: budget[1], longTaskMs: 50} }
await mkdir(out, { recursive: true })
const sourceFiles = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','public/models','scripts','tests','.github/workflows','package.json','package-lock.json']).toString().trim().split('\n')
report.sourceFiles = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file,createHash('sha256').update(await readFile(file)).digest('hex')])))
report.sourceDigest = createHash('sha256').update(JSON.stringify(report.sourceFiles)).digest('hex')
const percentile = (values, fraction) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}
const frameSummary = (frames) => {
  const times = frames.map(frame => frame.delta * 1000).filter(Number.isFinite)
  return {frames: frames.length, frameTimeMs: {p50: percentile(times, .5), p95: percentile(times, .95), p99: percentile(times, .99), max: times.length ? Math.max(...times) : null}}
}
const compactFrame = (frame) => ({
  frameId: frame.frameId, timestamp: frame.timestamp, delta: frame.delta, progress: frame.progress,
  targetProgress: frame.targetProgress, section: frame.section, zone: frame.zone, domZone: frame.domZone,
  tier: frame.tier, dpr: frame.dpr, camera: frame.camera, perf: frame.perf, memory: frame.memory,
  assets: Object.fromEntries(Object.entries(frame.assets).map(([name, asset]) => [name, asset.stage])),
})
let browser, page, server, releaseInterior
let navigationStartedAt = 0
try {
  if (!process.env.QA_URL) {
    server = await startQaServer({ port: Number(process.env.QA_PORT ?? 4173), dev: process.env.QA_DEV === '1' })
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
  report.browser = browser.version()
  // The tour video is recorded at half size: at full size it reached ~85 MB
  // per run and exhausted the account's artifact storage quota.
  page = await browser.newPage({ viewport: { width: Number(process.env.QA_WIDTH ?? 960), height: Number(process.env.QA_HEIGHT ?? 640) }, deviceScaleFactor: 1, ...(process.env.QA_RECORD_VIDEO === '1' ? {recordVideo:{dir:out,size:{width:Math.round(Number(process.env.QA_WIDTH ?? 960)/2),height:Math.round(Number(process.env.QA_HEIGHT ?? 640)/2)}}} : {}) })
  // Lifecycle stress uses reduced motion to revisit mounts without spending
  // hundreds of software-rendered frames integrating each identical stop.
  // Real-clock movement is covered separately by QA_VIDEO.
  // QA_REDUCED_MOTION lets editorial captures skip integrating presented
  // progress at software-rendered frame rates: with time frozen (?time=12)
  // the settled frame is the same, and QA_VIDEO covers real-clock movement.
  const reduceMotion = process.env.QA_CYCLES==='1' || process.env.QA_SWEEP==='1' || process.env.QA_REDUCED_MOTION==='1'
  if(reduceMotion){await page.emulateMedia({reducedMotion:'reduce'});report.reducedMotion=true}
  page.on('response', r => { if(r.status() >= 400)report.errors.push({type:'http',url:r.url(),status:r.status()}) })
  page.on('console', m => { if(m.type()==='error')report.errors.push({type:'console',message:m.text()}) })
  page.on('pageerror', e => report.errors.push({ type: 'page', message: e.message }))
  page.on('requestfailed', r => report.errors.push({ type: 'request', url: r.url(), message: r.failure()?.errorText }))
  await page.addInitScript(() => {
    window.__QA_LONG_TASKS__ = []
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__QA_LONG_TASKS__.push({ start: e.startTime, duration: e.duration }) }).observe({ type: 'longtask', buffered: true })
  })
  if (process.env.QA_INTERIOR_ERROR === '1') await page.route('**/models/interior.glb', route => route.abort())
  if (process.env.QA_SLOW_INTERIOR === '1') await page.route('**/models/interior.glb', async route => { await new Promise(resolve => {releaseInterior=resolve}); await route.continue() })
  const url = new URL(process.env.QA_URL ?? `http://127.0.0.1:${process.env.QA_PORT ?? 4173}/boeing-747/`)
  if (reduceMotion) url.searchParams.set('motion', '3d')
  url.searchParams.set('qa', '1'); url.searchParams.set('quality', tier)
  if (process.env.QA_VIDEO !== '1') url.searchParams.set('time', '12')
  if (process.env.QA_VIEW) url.searchParams.set('view', process.env.QA_VIEW)
  if (process.env.QA_WIREFRAME) url.searchParams.set('wireframe', '1')
  report.url = url.toString()
  report.lastAction = 'load'
  navigationStartedAt = Date.now()
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout })
  await page.waitForFunction(() => { const f = window.__MERIDIAN_FRAME__; return f && f.assets.exterior.stage === 'ready' && f.assets.environment.stage === 'ready' && !document.querySelector('.loading-screen') }, null, { timeout })
  report.timings.coldStartMs = Date.now() - navigationStartedAt
  report.browserProfile = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const context = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
    const debug = context?.getExtension('WEBGL_debug_renderer_info')
    const renderer = debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null
    return {userAgent: navigator.userAgent, deviceMemoryGb: navigator.deviceMemory ?? null, logicalCores: navigator.hardwareConcurrency ?? null, viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio}, webglRenderer: renderer, softwareRenderer: /swiftshader|llvmpipe|software/i.test(renderer ?? '')}
  })
  console.log('runtime-ready', JSON.stringify({tier, browser:report.browser, renderer:report.browserProfile.webglRenderer, coldStartMs:report.timings.coldStartMs}))
  if (process.env.QA_SLOW_INTERIOR === '1') {
    await page.evaluate(() => window.scrollTo(0,.7*(document.documentElement.scrollHeight-innerHeight)))
    await page.waitForFunction(() => {const f=window.__MERIDIAN_FRAME__;return f && f.progress>.409 && f.progress<=.41 && f.targetProgress>.69 && f.assets.interior.stage!=='ready'},null,{timeout})
    report.slowHold=await page.evaluate(()=>window.__MERIDIAN_FRAME__)
    releaseInterior()
    await page.waitForFunction(() => {const f=window.__MERIDIAN_FRAME__;return f?.assets.interior.stage==='ready' && f.progress>.699},null,{timeout})
    report.slowResume=await page.evaluate(()=>window.__MERIDIAN_FRAME__)
  }
  async function move(progress, captureName, expectedTier = tier) {
    report.lastAction = `progress ${progress}`
    const moveStartedAt = Date.now()
    const before = await page.evaluate(() => window.__MERIDIAN_FRAME__?.frameId ?? 0)
    await page.evaluate(p => window.scrollTo({ top: p * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), progress)
    await page.waitForFunction(({p,before}) => { const f = window.__MERIDIAN_FRAME__; return f && f.frameId > before+2 && Math.abs(f.progress-f.targetProgress)<1e-6 && Math.abs(f.progress - p) < 0.0002 && f.zone === f.domZone && f.assets.interior.stage === 'ready' }, {p:progress,before}, { timeout })
    const state = await page.evaluate(() => window.__MERIDIAN_FRAME__)
    const expectedBudget = budgets[expectedTier]
    if (progress >= .5 && !report.timings.firstInteriorEntry) {
      report.timings.firstInteriorEntry = { elapsedSinceNavigationMs: Date.now() - navigationStartedAt, moveWaitMs: Date.now() - moveStartedAt, requested: progress, frameId: state.frameId }
    }
    if (state.tier !== expectedTier) throw new Error(`Requested ${expectedTier}, rendered ${state.tier}`)
    if (!state.perf || !Number.isFinite(state.perf.drawCalls) || !Number.isFinite(state.perf.triangles) || !Number.isFinite(state.perf.submittedTriangles) || !Number.isFinite(state.perf.fps)) throw new Error(`Missing performance counters at ${progress}`)
    if (!state.memory || !['geometries', 'textures', 'programs'].every(key => Number.isFinite(state.memory[key]))) throw new Error(`Missing renderer memory counters at ${progress}`)
    if (state.perf.drawCalls >= expectedBudget[0] || state.perf.triangles >= expectedBudget[1]) throw new Error(`Scene budget exceeded at ${progress}: ${state.perf.drawCalls} calls, ${state.perf.triangles} visible triangles`)
    report.trace.push(compactFrame(state))
    if (captureName) {
      if (captureName === 'takeoff-first') {
        await page.waitForFunction(() => {
          const first = document.querySelector('.overlay__panel--takeoff .overlay__data-item[data-revealed="true"]')
          return !!first && Number.parseFloat(getComputedStyle(first).opacity) >= .98
        }, null, { timeout })
      }
      const bounds=await page.evaluate(()=>{const rect=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null};return {panel:rect(document.querySelector('.overlay__panel[data-active="true"]')),chrome:[rect(document.querySelector('.site-nav')),rect(document.querySelector('.debug-hud'))].filter(Boolean)}})
      await page.screenshot({ path: path.join(out, `${captureName}.png`), timeout })
      const imageMetrics=await measureScreenshot(path.join(out,`${captureName}.png`),bounds.panel,bounds.chrome,1)
      const hideStyle = await page.addStyleTag({ content: '.overlay,.overlay *,.site-nav,.debug-hud{visibility:hidden!important}' })
      await page.screenshot({ path: path.join(out, `${captureName}-canvas.png`), timeout })
      await hideStyle.evaluate(el => el.remove())
      const contentCheck = await page.evaluate(name => {
        const active = document.querySelector('.overlay__panel[data-active="true"]')
        const rows = [...(active?.querySelectorAll('.overlay__data-list > li') ?? [])]
        const rowVisible = row => Number.parseFloat(getComputedStyle(row).opacity) >= .98
        return {
          activeSection: active?.getAttribute('data-section') ?? null,
          panelText: active?.innerText ?? null,
          takeoffRows: name === 'takeoff-first' ? rows.map(row => ({text: row.innerText, revealed: row.dataset.revealed === 'true', visible: rowVisible(row)})) : undefined,
          specRowCount: name === 'spec' ? rows.length : undefined,
        }
      }, captureName)
      report.captures.push({ name: captureName, requested: progress, frame: state, imageMetrics, contentCheck })
      if (captureName === 'threshold') {
        // The caption must stay a caption: its backdrop once covered the
        // whole viewport and blacked out the entire nose crossing.
        const line = await page.evaluate(() => { const el = document.querySelector('.overlay__threshold-line[data-active="true"]'); const r = el?.getBoundingClientRect(); return r ? { area: r.width * r.height / (innerWidth * innerHeight), bg: getComputedStyle(el).backgroundColor } : null })
        report.thresholdLine = line
        if (line && line.area > .05) throw new Error(`Threshold caption backdrop covers ${(line.area * 100).toFixed(1)}% of the viewport`)
      }
      if(captureName==='opening' && imageMetrics.clippedWhitePct>=2)throw new Error('Opening clipped whites >=2%')
      if(captureName==='spec' && imageMetrics.panelContrastEstimate<4.5)throw new Error('Spec contrast <4.5')
      if (captureName === 'takeoff-first' && (contentCheck.activeSection !== 'takeoff' || contentCheck.takeoffRows.filter(row => row.visible).length !== 1)) throw new Error('The 13% editorial stop must show exactly the first takeoff datum')
      if (captureName === 'spec' && (contentCheck.activeSection !== 'climb' || contentCheck.specRowCount !== 6 || !/envergadura/i.test(contentCheck.panelText))) throw new Error('The spec editorial stop must render all six data rows')
      console.log(captureName, state.progress, state.zone, state.memory)
    }
  }
  if (process.env.QA_INTERIOR_ERROR === '1') {
    await page.evaluate(() => window.scrollTo(0, .7 * (document.documentElement.scrollHeight-innerHeight)))
    await page.waitForFunction(() => {const f=window.__MERIDIAN_FRAME__;return f?.assets.interior.stage==='error' && f.targetProgress>.69 && f.progress>.409 && document.querySelector('.interior-guardrail')?.getAttribute('data-active')==='true'}, null, {timeout})
    const frame = await page.evaluate(() => window.__MERIDIAN_FRAME__)
    if (frame.progress > .41001) throw new Error('Cabin error crossed safe threshold')
    report.errorGuard = frame
    await page.getByRole('button', {name:'Volver al inicio'}).click()
    await page.waitForFunction(() => window.__MERIDIAN_FRAME__?.progress < .001, null, {timeout})
  } else {
    for (const [name, p] of editorialCaptures) if (requested.includes(name)) await move(p, name)
    if (!report.timings.firstInteriorEntry) await move(.515)
    await move(.06)
    const hotInteriorStartedAt = Date.now()
    await move(.515)
    report.timings.hotInteriorRepeatMs = Date.now() - hotInteriorStartedAt
    if (process.env.QA_SWEEP === '1') {
      const step = Number(process.env.QA_SWEEP_STEP ?? 0.01)
      if (!(step > 0 && step <= 0.05)) throw new Error(`QA_SWEEP_STEP must be in (0, .05], received ${step}`)
      const count = Math.round(1 / step)
      const points = Array.from({length: count + 1}, (_, index) => index / count)
      report.sweep = {step: 1 / count, forward: [], backward: []}
      for (const progress of points) { await move(progress); report.sweep.forward.push(report.trace.at(-1)) }
      for (const progress of [...points].reverse()) { await move(progress); report.sweep.backward.push(report.trace.at(-1)) }
      for (const [direction, frames] of Object.entries(report.sweep)) {
        if (direction === 'step') continue
        const expectedSign = direction === 'forward' ? 1 : -1
        const movement = frames.slice(1).map((frame, index) => (frame.progress - frames[index].progress) * expectedSign)
        if (frames.length !== count + 1 || frames.some(frame => !Number.isFinite(frame.progress) || frame.tier !== tier)) throw new Error(`Incomplete ${direction} sweep`)
        if (movement.some(delta => delta < -1e-6)) throw new Error(`Progress reversed during ${direction} sweep`)
        if (frames.at(-1).perf.drawCalls >= budget[0] || frames.at(-1).perf.triangles >= budget[1]) throw new Error(`Missing ${direction} route counters`)
      }
      report.sweep.resourceRange = Object.fromEntries(['geometries','textures','programs'].map(key => [key, {
        overall: [Math.min(...[...report.sweep.forward,...report.sweep.backward].map(frame=>frame.memory[key])), Math.max(...[...report.sweep.forward,...report.sweep.backward].map(frame=>frame.memory[key]))],
        forward: [Math.min(...report.sweep.forward.map(frame=>frame.memory[key])), Math.max(...report.sweep.forward.map(frame=>frame.memory[key]))],
        backward: [Math.min(...report.sweep.backward.map(frame=>frame.memory[key])), Math.max(...report.sweep.backward.map(frame=>frame.memory[key]))],
      }]))
    }
    if (process.env.QA_CYCLES === '1') {
      for (const p of [.06,.3,.45,.526,.608,.718,.8,.833,.90,.98,.8,.608,.06]) await move(p)
      report.cycleMemory = []
      for (let i=0;i<10;i++) {
        for (const p of [.06,.608,.98,.8,.06]) await move(p)
        report.cycleMemory.push(report.trace.at(-1).memory)
        console.log('cycle',i+1,report.cycleMemory.at(-1))
      }
      for (const key of ['geometries','textures','programs']) {
        const values=report.cycleMemory.slice(2).map(m=>m[key])
        if (Math.max(...values)-Math.min(...values)>2) throw new Error(`Resource growth: ${key}: ${values}`)
      }
    }
    if (process.env.QA_TIER_CACHE === '1') {
      const snapshot = () => page.evaluate(() => window.__MERIDIAN_FRAME__)
      const tiers = [{tier:'low',size:512},{tier:'high',size:1024},{tier:'mid',size:1024},{tier:'low',size:512}]
      const first = await snapshot()
      if (first.tier !== 'low' || first.perf.terrainMapSize !== 512 || first.autoQuality !== false) throw new Error('Tier-cache QA must start with a ready, manually selected Low tier')
      report.tierCache = { start: compactFrame(first), transitions: [] }
      for (const expected of tiers.slice(1)) {
        const before = await snapshot()
        const expectedCacheHits = before.perf.terrainCacheHitCount + (expected.tier === 'low' ? 1 : 0)
        report.lastAction = `manual tier ${expected.tier}`
        await page.locator('.site-nav__quality').click()
        await page.waitForFunction(({tier,size,cacheHits}) => {
          const frame = window.__MERIDIAN_FRAME__
          return frame?.tier === tier && frame.perf?.terrainMapSize === size && frame.perf?.terrainCacheHitCount >= cacheHits
        }, {tier:expected.tier,size:expected.size,cacheHits:expectedCacheHits}, {timeout})
        await move(.515, undefined, expected.tier)
        const frame = await snapshot()
        if (frame.autoQuality !== false) throw new Error(`Automatic quality overwrote manual ${expected.tier} selection`)
        const previous = expected.tier === 'high' ? first : report.tierCache.transitions.at(-1).frame
        if (expected.tier === 'high' && (frame.perf.terrainGeneratedMapCount !== previous.perf.terrainGeneratedMapCount + 1 || !(frame.perf.terrainGenerationMs > 0))) throw new Error('Low→High did not generate exactly one 1024px terrain map set')
        if (expected.tier === 'mid' && (frame.perf.terrainMapSize !== previous.perf.terrainMapSize || frame.perf.terrainGeneratedMapCount !== previous.perf.terrainGeneratedMapCount || frame.perf.terrainGenerationMs !== previous.perf.terrainGenerationMs)) throw new Error('High→Mid regenerated or replaced the active 1024px terrain maps')
        if (expected.tier === 'low' && (frame.perf.terrainGeneratedMapCount !== previous.perf.terrainGeneratedMapCount || frame.perf.terrainGenerationMs !== 0)) throw new Error('Returning to Low regenerated its cached 512px terrain maps')
        report.tierCache.transitions.push({tier:expected.tier,frame:compactFrame(frame)})
        console.log('tier-cache', expected.tier, frame.perf.terrainMapSize, frame.perf.terrainGenerationMs, frame.perf.terrainGeneratedMapCount, frame.perf.terrainCacheHitCount)
      }
    }
    if (process.env.QA_VIDEO === '1') {
      await move(0)
      const warmup = await page.evaluate(async () => {
        const stops = Array.from({length:18},(_,index)=>index/17)
        const route = [...stops,...stops.slice(0,-1).reverse()]
        const samples=[]
        for (const target of route) {
          const before=window.__MERIDIAN_FRAME__?.frameId ?? 0
          const started=performance.now()
          window.scrollTo({top:target*(document.documentElement.scrollHeight-innerHeight),behavior:'instant'})
          await new Promise((resolve,reject)=>{
            const tick=now=>{
              const frame=window.__MERIDIAN_FRAME__
              if(frame && frame.frameId>before+2 && Math.abs(frame.progress-target)<.001 && Math.abs(frame.targetProgress-target)<.001){samples.push(frame);resolve();return}
              // Generous on purpose: on a two-core software renderer a stop that
              // crosses a probe blend convolves a new environment per frame.
              if(now-started>180000){reject(new Error(`Warm-up did not settle at ${target}`));return}
              requestAnimationFrame(tick)
            };requestAnimationFrame(tick)
          })
        }
        window.__QA_LONG_TASKS__=[]
        return {route,trace:samples,ended:performance.now()}
      })
      report.warmup = {stops:warmup.route, ...frameSummary(warmup.trace.map(frame=>({delta:frame.delta}))), elapsedMs:warmup.ended-warmup.trace[0]?.timestamp, startProgress:warmup.trace[0]?.progress, endProgress:warmup.trace.at(-1)?.progress}
      console.log('dynamic-warmup', JSON.stringify({frames:warmup.trace.length,elapsedMs:report.warmup.elapsedMs,start:report.warmup.startProgress,end:report.warmup.endProgress}))
      const dynamic = await page.evaluate(async () => {
        const trace=[];let goal=0,direction=1,lastFrame=-1
        const started=performance.now()
        await new Promise((resolve,reject) => {
          const tick=now => {
            const f=window.__MERIDIAN_FRAME__
            if(f && f.frameId!==lastFrame){
              lastFrame=f.frameId;trace.push(f)
              if(goal===1 && f.progress>.999)direction=-1
              if(direction===-1 && goal===0 && f.progress<.001){resolve();return}
              if(Math.abs(f.progress-goal)<.03)goal=Math.max(0,Math.min(1,goal+direction*.0125))
              window.scrollTo({top:goal*(document.documentElement.scrollHeight-innerHeight),behavior:'instant'})
            }
            if(now-started>1200000){reject(new Error('Dynamic tour exceeded 20 minutes'));return}
            requestAnimationFrame(tick)
          };requestAnimationFrame(tick)
        });return {trace,started,ended:performance.now(),longTasks:window.__QA_LONG_TASKS__.filter(task=>task.start>=started&&task.start<=performance.now())}
      })
      report.dynamicTrace = dynamic.trace.map(compactFrame)
      const maxIndex = report.dynamicTrace.reduce((max, frame, index, frames) => frame.progress > frames[max].progress ? index : max, 0)
      const forward = report.dynamicTrace.slice(0, maxIndex + 1)
      const backward = report.dynamicTrace.slice(maxIndex)
      const maxGap = frames => Math.max(0, ...frames.slice(1).map((frame,index)=>Math.abs(frame.progress-frames[index].progress)))
      const softwareRenderer = report.browserProfile.softwareRenderer
      const longTaskExceedances = dynamic.longTasks.filter(task=>task.duration>50)
      report.tour = {
        ...frameSummary(report.dynamicTrace), elapsedMs:dynamic.ended-dynamic.started,
        forwardFrames:forward.length, backwardFrames:backward.length,
        forwardFrameTime:frameSummary(forward), backwardFrameTime:frameSummary(backward),
        maxForwardProgressGap:maxGap(forward), maxBackwardProgressGap:maxGap(backward), longTasks:dynamic.longTasks,
        longTaskGate:{limitMs:50,status:softwareRenderer?'not-applicable':longTaskExceedances.length?'fail':'pass',reason:softwareRenderer?`Skipped for software renderer ${report.browserProfile.webglRenderer}`:longTaskExceedances.length?`${longTaskExceedances.length} task(s) exceeded 50 ms`:'No task exceeded 50 ms',exceedances:longTaskExceedances.length},
      }
      if(Math.min(...report.dynamicTrace.map(f=>f.progress))>.001 || Math.max(...report.dynamicTrace.map(f=>f.progress))<.999)throw new Error('Dynamic tour did not cover 0–100% in both directions')
      if(forward.length<20 || backward.length<20)throw new Error('Dynamic tour did not produce enough presented frames in both directions')
      if(report.dynamicTrace.some(f=>f.zone!==f.domZone))throw new Error('DOM zone trails presented frame')
      if(report.tour.maxForwardProgressGap>.04 || report.tour.maxBackwardProgressGap>.04)throw new Error('Dynamic tour skipped a visible progress interval')
      for (const frame of report.dynamicTrace) {
        if (!frame.perf || ![frame.perf.fps,frame.perf.drawCalls,frame.perf.triangles,frame.perf.submittedTriangles].every(Number.isFinite) || !frame.memory || !['geometries','textures','programs'].every(key=>Number.isFinite(frame.memory[key])) || frame.perf.drawCalls >= budget[0] || frame.perf.triangles >= budget[1]) throw new Error(`Dynamic route budget/counters failed at ${frame.progress}`)
      }
      if(report.tour.longTaskGate.status==='fail')throw new Error('A long task exceeded 50 ms during the warmed tour')
      await move(0)
    }
    if (process.env.QA_BUTTON === '1') {
      report.lastAction = 'quality button'
      const start = Date.now()
      await page.locator('.site-nav__quality').click({timeout:30000})
      await page.waitForFunction(t => window.__MERIDIAN_FRAME__?.tier !== t, tier, {timeout})
      report.qualityButton = {duration:Date.now()-start, frame:await page.evaluate(()=>window.__MERIDIAN_FRAME__)}
    }
    report.expectedCaptures = requested.length
    if (report.captures.length !== report.expectedCaptures) throw new Error('Incomplete capture set')
    report.traceSummary = frameSummary(report.trace)
    if(report.errors.length)throw new Error('Runtime errors recorded; see report')
  }
} catch (error) {
  report.failure = error.stack
  console.error(`Runtime QA failed during ${report.lastAction}:`, error.stack ?? error.message)
  process.exitCode = 1
  if (page) { try { await page.screenshot({ path:path.join(out,'failure.png'), timeout:15000 }) } catch {} }
} finally {
  if (page) { try { report.finalFrame = await page.evaluate(() => window.__MERIDIAN_FRAME__); report.longTasks = await page.evaluate(() => window.__QA_LONG_TASKS__) } catch {} }
  const video = page?.video() ?? null
  await browser?.close()
  if (video) report.videoFile = await video.path()
  report.longTaskSummary = {count:report.longTasks.length, maxMs:report.longTasks.length?Math.max(...report.longTasks.map(task=>task.duration)):0, over50ms:report.longTasks.filter(task=>task.duration>50).length}
  await writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2))
  server?.kill()
}
