import { measureScreenshot } from './qa-image-metrics.mjs'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { execFileSync, spawn } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'

const out = path.resolve(process.env.QA_DIR ?? 'artifacts/phase6/runtime')
const tier = process.env.QA_TIER ?? 'low'
const timeout = Number(process.env.QA_TIMEOUT ?? 180000)
const report = { source: process.env.QA_SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirty: !!execFileSync('git', ['status', '--porcelain']).length, tier, captures: [], trace: [], errors: [], longTasks: [], lastAction: 'start' }
await mkdir(out, { recursive: true })
const sourceFiles = execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','public/models','scripts','package.json','package-lock.json']).toString().trim().split('\n')
report.sourceFiles = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file,createHash('sha256').update(await readFile(file)).digest('hex')])))
report.sourceDigest = createHash('sha256').update(JSON.stringify(report.sourceFiles)).digest('hex')
let browser, page, server, releaseInterior
try {
  if (!process.env.QA_URL) {
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', ...(process.env.QA_DEV === '1' ? [] : ['preview']), '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] })
    await new Promise((resolve, reject) => { server.stdout.on('data', d => { if (d.toString().includes('Local:')) resolve() }); server.on('error', reject); server.on('exit', code => reject(new Error(`server exited ${code}`))) })
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] })
  report.browser = browser.version()
  page = await browser.newPage({ viewport: { width: Number(process.env.QA_WIDTH ?? 960), height: Number(process.env.QA_HEIGHT ?? 640) }, deviceScaleFactor: 1, ...(process.env.QA_VIDEO === '1' ? {recordVideo:{dir:out}} : {}) })
  // Lifecycle stress uses reduced motion to revisit mounts without spending
  // hundreds of software-rendered frames integrating each identical stop.
  // Real-clock movement is covered separately by QA_VIDEO.
  if(process.env.QA_CYCLES==='1'){await page.emulateMedia({reducedMotion:'reduce'});report.reducedMotion=true}
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
  const url = new URL(process.env.QA_URL ?? 'http://127.0.0.1:4173/boeing-747/')
  if (process.env.QA_CYCLES === '1') url.searchParams.set('motion', '3d')
  url.searchParams.set('qa', '1'); url.searchParams.set('quality', tier)
  if (process.env.QA_VIDEO !== '1') url.searchParams.set('time', '12')
  if (process.env.QA_VIEW) url.searchParams.set('view', process.env.QA_VIEW)
  if (process.env.QA_WIREFRAME) url.searchParams.set('wireframe', '1')
  report.url = url.toString()
  report.lastAction = 'load'
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout })
  await page.waitForFunction(() => { const f = window.__MERIDIAN_FRAME__; return f && f.assets.exterior.stage === 'ready' && f.assets.environment.stage === 'ready' && !document.querySelector('.loading-screen') }, null, { timeout })
  if (process.env.QA_SLOW_INTERIOR === '1') {
    await page.evaluate(() => window.scrollTo(0,.7*(document.documentElement.scrollHeight-innerHeight)))
    await page.waitForFunction(() => {const f=window.__MERIDIAN_FRAME__;return f && f.progress>.409 && f.progress<=.41 && f.targetProgress>.69 && f.assets.interior.stage!=='ready'},null,{timeout})
    report.slowHold=await page.evaluate(()=>window.__MERIDIAN_FRAME__)
    releaseInterior()
    await page.waitForFunction(() => {const f=window.__MERIDIAN_FRAME__;return f?.assets.interior.stage==='ready' && f.progress>.699},null,{timeout})
    report.slowResume=await page.evaluate(()=>window.__MERIDIAN_FRAME__)
  }
  async function move(progress, captureName) {
    report.lastAction = `progress ${progress}`
    const before = await page.evaluate(() => window.__MERIDIAN_FRAME__?.frameId ?? 0)
    await page.evaluate(p => window.scrollTo({ top: p * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' }), progress)
    await page.waitForFunction(({p,before}) => { const f = window.__MERIDIAN_FRAME__; return f && f.frameId > before+2 && Math.abs(f.progress-f.targetProgress)<1e-6 && Math.abs(f.progress - p) < 0.0002 && f.zone === f.domZone && f.assets.interior.stage === 'ready' }, {p:progress,before}, { timeout })
    const state = await page.evaluate(() => window.__MERIDIAN_FRAME__)
    if (state.tier !== tier) throw new Error(`Requested ${tier}, rendered ${state.tier}`)
    report.trace.push(state)
    if (captureName) {
      const bounds=await page.evaluate(()=>{const r=document.querySelector('.overlay__panel[data-active="true"]')?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null})
      await page.screenshot({ path: path.join(out, `${captureName}.png`), timeout })
      const imageMetrics=await measureScreenshot(path.join(out,`${captureName}.png`),bounds)
      const hideStyle = await page.addStyleTag({ content: '.overlay,.overlay *,.site-nav,.debug-hud{visibility:hidden!important}' })
      await page.screenshot({ path: path.join(out, `${captureName}-canvas.png`), timeout })
      await hideStyle.evaluate(el => el.remove())
      report.captures.push({ name: captureName, requested: progress, frame: state, imageMetrics })
      const budget={low:[100,500000],mid:[150,800000],high:[250,1500000]}[tier]
      if(state.perf.drawCalls>=budget[0] || state.perf.triangles>=budget[1])throw new Error(`Scene budget exceeded at ${captureName}`)
      if(captureName==='hero' && imageMetrics.clippedWhitePct>=2)throw new Error('Hero clipped whites >=2%')
      if(captureName==='spec' && imageMetrics.panelContrastEstimate<4.5)throw new Error('Spec contrast <4.5')
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
    const captures = [['hero', .06], ['spec', .355], ['cockpit', .526], ['economy', .608], ['stair', .718], ['upper', .8], ['exit', .833]]
    const requested = process.env.QA_CAPTURES === 'none' ? [] : process.env.QA_CAPTURES?.split(',')
    for (const [name, p] of captures) if (!requested || requested.includes(name)) await move(p, name)
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
    if (process.env.QA_VIDEO === '1') {
      await move(0)
      report.dynamicTrace = await page.evaluate(async () => {
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
        });return trace
      })
      if(Math.max(...report.dynamicTrace.map(f=>f.progress))<.999)throw new Error('Dynamic tour never reached S7')
      if(report.dynamicTrace.some(f=>f.zone!==f.domZone))throw new Error('DOM zone trails presented frame')
      await move(0)
    }
    if (process.env.QA_BUTTON === '1') {
      report.lastAction = 'quality button'
      const start = Date.now()
      await page.locator('.site-nav__quality').click({timeout:30000})
      await page.waitForFunction(t => window.__MERIDIAN_FRAME__?.tier !== t, tier, {timeout})
      report.qualityButton = {duration:Date.now()-start, frame:await page.evaluate(()=>window.__MERIDIAN_FRAME__)}
    }
    report.expectedCaptures = requested?.length ?? 7
    if (report.captures.length !== report.expectedCaptures) throw new Error('Incomplete capture set')
    if(report.errors.length)throw new Error('Runtime errors recorded; see report')
  }
} catch (error) {
  report.failure = error.stack
  process.exitCode = 1
  if (page) { try { await page.screenshot({ path:path.join(out,'failure.png'), timeout:15000 }) } catch {} }
} finally {
  if (page) { try { report.finalFrame = await page.evaluate(() => window.__MERIDIAN_FRAME__); report.longTasks = await page.evaluate(() => window.__QA_LONG_TASKS__) } catch {} }
  await writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2))
  await browser?.close()
  server?.kill()
}
