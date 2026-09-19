import assert from 'node:assert/strict'
import {after,test} from 'node:test'
import {createServer} from 'vite'
const server=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
after(()=>server.close())
const {advanceProgress,INTERIOR_HOLD}=await server.ssrLoadModule('/src/lib/presentedProgress.ts')
const {interiorToWorld,worldToInterior,INTERIOR_MANIFEST}=await server.ssrLoadModule('/src/lib/sceneLayout.ts')
const {sampleCamera}=await server.ssrLoadModule('/src/lib/cameraPath.ts')

test('F1: a late interior clamps every presented frame while retaining the requested destination',()=>{
 for(const reduced of [false,true]){
  const target=.8;let p=0
  for(let i=0;i<600;i++){p=advanceProgress(p,target,1/60,false,reduced);assert(p<=INTERIOR_HOLD)}
  for(let i=0;i<600;i++)p=advanceProgress(p,target,1/60,true,reduced)
  assert.equal(p,target)
  assert(advanceProgress(p,.1,1/60,false,reduced)<p,'Return remains available during asset failure')
 }
})
test('F1: one smoother has equivalent 30/60/120 Hz response and limits background-tab delta',()=>{
 const end=[]
 for(const hz of [30,60,120]){let p=0;for(let i=0;i<hz;i++)p=advanceProgress(p,.8,1/hz,true,false);end.push(p)}
 assert(Math.max(...end)-Math.min(...end)<1e-9)
 assert.equal(advanceProgress(0,1,30,true,false),advanceProgress(0,1,.05,true,false))
})
test('F2: anchors round-trip through the same pitched aircraft basis',()=>{
 for(const point of Object.values(INTERIOR_MANIFEST.anchors)){
  const actual=worldToInterior(interiorToWorld(point));actual.forEach((v,i)=>assert(Math.abs(v-point[i])<1e-10))
 }
})
test('F2: both passenger decks have two clear aisles wider than the camera envelope',()=>{
 for(const deck of [INTERIOR_MANIFEST.main,INTERIOR_MANIFEST.upper]){
  assert.equal(deck.layout.length,3)
  assert.equal(deck.centers.length,deck.layout.reduce((a,b)=>a+b))
  for(const aisle of INTERIOR_MANIFEST.aisles) for(const x of deck.centers) assert(Math.abs(aisle-x)-.46/2>=.23)
 }
})
test('F2: bounded cabin route joins the external curve without a pose or FOV cut',()=>{
 for(const p of [.46,.5,.532,.56,.568,.576,.5896,.628,.674,.7048,.7304,.752,.7816,.795,.82,.827,.83,.835]){
  const a=sampleCamera(p-1e-9),b=sampleCamera(p+1e-9)
  assert(a.position.distanceTo(b.position)<1e-4,`position at ${p}`)
  const da=a.target.clone().sub(a.position).normalize(),db=b.target.clone().sub(b.position).normalize()
  assert(da.angleTo(db)<1e-5,`orientation at ${p}`)
  assert(Math.abs(a.fov-b.fov)<.01,`fov at ${p}`)
 }
})
