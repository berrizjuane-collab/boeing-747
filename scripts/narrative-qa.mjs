import { qaSource } from './qa-source.mjs'
import { chromium } from 'playwright'
import { startQaServer } from './qa-server.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const out=process.env.QA_DIR ?? 'artifacts/f5-f6/narrative'
await mkdir(out,{recursive:true})
const server=await startQaServer({extraArgs:['--outDir',process.env.QA_DIST??'dist']})
const report={source:await qaSource(),viewports:[],errors:[],checks:[]};let browser
try {
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--no-zygote','--single-process','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 report.browser=browser.version()
 const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1,reducedMotion:'reduce'})
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
 await page.goto('http://127.0.0.1:4173/boeing-747/?qa=1&quality=low&time=12&motion=3d')
 await page.waitForFunction(()=>window.__MERIDIAN_FRAME__?.assets.interior.stage==='ready'&&!document.querySelector('.loading-screen'),null,{timeout:240000})
 async function move(p){await page.evaluate(p=>scrollTo(0,p*(document.documentElement.scrollHeight-innerHeight)),p);await page.waitForFunction(p=>Math.abs(window.__MERIDIAN_FRAME__?.progress-p)<.0003,p,{timeout:120000})}
 for(const [width,height] of [[390,844],[844,390],[768,1024],[1440,900],[960,640]]) {
  await page.setViewportSize({width,height})
  for(const [name,p] of [['cockpit',.526],['economy',.608],['spec',.355]]){
   await move(p)
   const layout=await page.evaluate(()=>{
    const panels=[...document.querySelectorAll('.overlay__panel')];const visible=panels.filter(e=>getComputedStyle(e).visibility==='visible'&&+getComputedStyle(e).opacity>.01)
    const e=visible[0],r=e?.getBoundingClientRect()
    return {count:visible.length,zone:e?.dataset.zone,rect:r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom}:null,overflow:e?e.scrollWidth-e.clientWidth:0,inactiveInert:panels.filter(x=>x!==e).every(x=>x.inert),pageOverflow:document.documentElement.scrollWidth-innerWidth}
   })
   assert.equal(layout.count,1);assert.equal(layout.inactiveInert,true);assert.ok(layout.overflow<=1,JSON.stringify(layout));assert.ok(layout.pageOverflow<=1)
   assert.ok(layout.rect.x>=0&&layout.rect.y>=60&&layout.rect.right<=width+1&&layout.rect.bottom<=height+1,JSON.stringify(layout))
   report.viewports.push({width,height,name,...layout})
   if(name==='economy')await page.screenshot({timeout:180000,path:`${out}/${width}x${height}.png`})
  }
 }
 // Text zoom, not a smaller screenshot: actual rem sizes doubled.
 await page.setViewportSize({width:390,height:844});await move(.608)
 await page.addStyleTag({content:'html{font-size:200% !important}'})
 const zoom=await page.evaluate(()=>{const e=document.querySelector('.overlay__panel[data-active="true"]');e.focus();const before=e.scrollTop;e.scrollTop=e.scrollHeight;const items=[...e.querySelectorAll('.overlay__data-list > li')].map(x=>x.getBoundingClientRect()); const overlap=items.some((a,i)=>items.some((b,j)=>i!==j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));return {overflow:e.scrollWidth-e.clientWidth,scrollable:e.scrollTop>before,focused:document.activeElement===e,overlap,pageOverflow:document.documentElement.scrollWidth-innerWidth}})
 assert.ok(zoom.overflow<=1,JSON.stringify(zoom));assert.ok(zoom.scrollable&&zoom.focused);assert.equal(zoom.overlap,false);assert.ok(zoom.pageOverflow<=1);report.checks.push({textZoom200:zoom})
 await page.screenshot({timeout:180000,path:`${out}/text-200.png`})
 // Moving away from a focused panel restores focus to a persistent control.
 await move(.718);assert.equal(await page.locator('.site-nav__reading').evaluate(e=>e===document.activeElement),true)
 report.checks.push('focus restored on zone change')
 // Every invisible panel is inert; inspect actual tab destinations.
 for(let i=0;i<12;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('[inert],[aria-hidden="true"]')),false)}
 report.checks.push('12 keyboard tabs never enter an inactive panel')
 await page.goto('http://127.0.0.1:4173/boeing-747/?static=1')
 assert.equal(await page.locator('canvas').count(),0);assert.equal(await page.locator('.fallback__zone').count(),4)
 report.checks.push('reading mode includes all four cabin zones and no canvas')
 await page.goto('http://127.0.0.1:4173/boeing-747/?qa=1&quality=low')
 assert.equal(await page.locator('canvas').count(),0);await page.getByText('Movimiento reducido:',{exact:false}).waitFor()
 report.checks.push('reduced motion starts in complete static narrative')
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('canvas').waitFor()
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.fallback').waitFor();assert.equal(await page.locator('canvas').count(),0)
 report.checks.push('live preference changes mount/unmount the moving scene')
 assert.deepEqual(report.errors,[])
 report.pass=true
}catch(e){report.failure=String(e);throw e}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();server.kill()}
