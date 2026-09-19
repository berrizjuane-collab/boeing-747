import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'
const file = process.argv[2] ?? 'public/models/interior.glb'
const manifest = JSON.parse(await readFile('src/lib/interior-manifest.json','utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder': await draco3d.createDecoderModule()})
const doc = await io.read(file), nodes = doc.getRoot().listNodes()
let seats=0, batches=0, triangles=0, instanceBatches=0
for (const name of Object.keys(manifest.anchors)) assert(nodes.some(n=>n.getName()===`Anchor_${name}`), `Missing actual anchor ${name}`)
for (const zone of ['Cockpit','Economy','Stair','UpperDeck']) assert(nodes.some(n=>n.getMesh()&&n.getExtras().zone===zone&&n.getExtras().structural), `Missing rendered structure ${zone}`)
for (const n of nodes) {
 const mesh=n.getMesh();if(!mesh)continue
 const inst=n.getExtension('EXT_mesh_gpu_instancing'), attrs=inst?.listAttributes()??[], count=attrs[0]?.getCount()??1
 if(inst){instanceBatches++;seats+=count;assert(n.getExtras().zone);assert.equal(count,n.getExtras().seatCount);assert(count<=50,'Seat batch crosses five-row boundary');for(const a of attrs)assert.equal(a.getCount(),count)}
 for(const p of mesh.listPrimitives()){
  batches++;triangles+=(p.getIndices()?.getCount()??p.getAttribute('POSITION').getCount())/3*count
  assert(p.getAttribute('NORMAL'),'Missing normals')
  assert.equal(p.getMaterial().getAlphaMode(),'OPAQUE','Structure/seats must write depth')
 }
}
assert.equal(seats,manifest.seatInstances)
assert.equal(instanceBatches,7)
// Spatial ownership costs a few more batches but the simplified linked
// seat reduces geometry substantially. Keep the previous triangle budget.
assert(triangles<=350000,`${triangles} triangles exceeds 350000`)
assert(batches<=50,`${batches} batches exceeds 50 (spatial partitions)`)
const bytes=(await stat(file)).size;assert(bytes<=250*1024)
console.log(JSON.stringify({bytes,seats,instanceBatches,batches,triangles,anchors:'PASS',spatialOwnership:'PASS',opaque:'PASS'},null,2))
