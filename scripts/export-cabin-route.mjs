import {createServer} from 'vite'
import {writeFile} from 'node:fs/promises'
const s=await createServer({appType:'custom',logLevel:'silent',server:{middlewareMode:true}})
try {
 const {sampleCamera}=await s.ssrLoadModule('/src/lib/cameraPath.ts')
 const {worldToInterior}=await s.ssrLoadModule('/src/lib/sceneLayout.ts')
 const route=[]
 for(let i=0;i<=3750;i++){const p=.46+i*.0001;const c=sampleCamera(p);route.push({p,position:worldToInterior(c.position.toArray())})}
 await writeFile('artifacts/phase6/cabin-route.json',JSON.stringify(route))
}finally{await s.close()}
