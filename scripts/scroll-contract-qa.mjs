import {createServer} from 'vite'
import {chromium} from 'playwright'
import {mkdir,writeFile} from 'node:fs/promises'
import assert from 'node:assert/strict'
const server=await createServer({server:{host:'127.0.0.1',port:4173,strictPort:true},logLevel:'error'})
await server.listen()
let browser
try {
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']})
 const page=await browser.newPage({viewport:{width:800,height:600}})
 await page.goto('http://127.0.0.1:4173/boeing-747/?static=1')
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="track" style="height:6000px"></div>'
  document.body.style.overflowX='hidden'
  const {initScrollController}=await import('/boeing-747/src/lib/scrollController.ts')
  const {useScrollStore}=await import('/boeing-747/src/state/scrollStore.ts')
  window.fixture={controller:initScrollController(document.querySelector('#track')),store:useScrollStore}
  fixture.controller.scrollToFraction(.7);fixture.controller.stop('loading');fixture.controller.stop('interior')
 })
 await page.mouse.wheel(0,500);await page.keyboard.press('PageDown')
 await page.evaluate(()=>window.scrollTo(0,0))
 await page.waitForFunction(()=>Math.abs(fixture.store.getState().targetProgress-.7)<.001 && scrollY>3000)
 await page.evaluate(()=>fixture.controller.start('interior'))
 await page.mouse.wheel(0,500)
 assert.equal(await page.evaluate(()=>fixture.store.getState().targetProgress),.7)
 await page.evaluate(()=>fixture.controller.scrollToFraction(0))
 await page.waitForFunction(()=>fixture.store.getState().targetProgress===0)
 await page.evaluate(()=>fixture.controller.start('loading'))
 await page.mouse.wheel(0,500)
 await page.waitForFunction(()=>fixture.store.getState().targetProgress>0)
 await page.evaluate(()=>fixture.controller.destroy())
 await mkdir('artifacts/phase6',{recursive:true})
 await writeFile('artifacts/phase6/scroll-contract.json',JSON.stringify({result:'PASS',checks:['wheel/key/scrollbar preserve target','locks independent','programmatic navigation while locked','last release restores input']},null,2))
 console.log('scroll contract PASS')
}finally{await browser?.close();await server.close()}
