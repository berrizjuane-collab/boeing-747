import { qaSource } from './qa-source.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
const out=process.env.QA_DIR??'artifacts/f5-f6/finish'
await mkdir(out,{recursive:true})
const report={source:await qaSource(),base:'6a8ef56bbaece739876b052025b9958f41e79ba8',tier:'high',time:12,captures:[],errors:[]}
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']})
await new Promise(resolve=>server.stdout.on('data',d=>{if(d.toString().includes('Local:'))resolve()}))
let browser
try{
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--no-zygote','--single-process','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
 report.browser=browser.version()
 const page=await browser.newPage({viewport:{width:960,height:640},deviceScaleFactor:1,reducedMotion:'reduce'})
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
 for(const finish of (process.env.QA_FINISHES?.split(',') ?? ['base','bloom','dof','shafts','full'])){
  await page.goto(`http://127.0.0.1:4173/boeing-747/?qa=1&quality=high&time=12&motion=3d&finish=${finish}`)
  await page.waitForFunction(()=>window.__MERIDIAN_FRAME__?.assets.interior.stage==='ready'&&!document.querySelector('.loading-screen'),null,{timeout:240000})
  const shots = finish === 'base' || finish === 'full' ? [['hero',.06],['cockpit',.526],['economy',.608],['sunset',.92]] : [['economy',.608]]
  for(const [name,p] of shots){
   await page.evaluate(p=>scrollTo(0,p*(document.documentElement.scrollHeight-innerHeight)),p)
   await page.waitForFunction(p=>Math.abs(window.__MERIDIAN_FRAME__?.progress-p)<.0003,p,{timeout:120000})
   const style=await page.addStyleTag({content:'.overlay,.site-nav,.debug-hud{visibility:hidden!important} .overlay *{visibility:hidden!important}'})
   const file=`${out}/${finish}-${name}.png`;await page.screenshot({timeout:180000,path:file});await style.evaluate(e=>e.remove())
   const frame=await page.evaluate(()=>window.__MERIDIAN_FRAME__)
   const rois=name==='hero'?{fuselage:{left:350,top:280,width:220,height:55},sky:{left:560,top:75,width:300,height:90}}:{}
   const regions={}
   for(const [key,roi] of Object.entries(rois)){
    const {data,info}=await sharp(file).extract(roi).removeAlpha().raw().toBuffer({resolveWithObject:true});let clipped=0,sum=0,min=255,max=0
    for(let i=0;i<data.length;i+=info.channels){const lum=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=lum;min=Math.min(min,lum);max=Math.max(max,lum);if(data[i]>=250&&data[i+1]>=250&&data[i+2]>=250)clipped++}
    regions[key]={roi,mean:sum/(info.width*info.height),min,max,clippedWhitePct:100*clipped/(info.width*info.height)}
   }
   report.captures.push({finish,name,frame,regions});await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(finish,name,frame.perf)
   if(frame.tier!=='high'||frame.perf.drawCalls>=250||frame.perf.triangles>=1500000)throw Error('High tier/budget gate failed')
  }
 }
 if(report.errors.length)throw Error(JSON.stringify(report.errors))
 report.pass=true
}catch(e){report.failure=String(e);throw e}finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await Promise.race([browser?.close(),new Promise(resolve=>setTimeout(resolve,5000))]);server.kill()}
