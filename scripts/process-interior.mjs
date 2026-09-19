// Preserve real spatial batches and anchors; never join across cabin zones.
import {NodeIO} from '@gltf-transform/core'
import {ALL_EXTENSIONS, EXTMeshGPUInstancing} from '@gltf-transform/extensions'
import {dedup, weld, prune, draco} from '@gltf-transform/functions'
import draco3d from 'draco3d'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule(),'draco3d.encoder':await draco3d.createEncoderModule()})
const doc=await io.read(process.argv[2]??'artifacts/phase6/interior-source.glb')
await doc.transform(dedup(),weld())
const root=doc.getRoot(), scene=root.getDefaultScene(), buffer=root.listBuffers()[0]
const ext=doc.createExtension(EXTMeshGPUInstancing).setRequired(true)
const groups=new Map()
for(const node of root.listNodes()){
  if(!node.getExtras().seat_instance)continue
  const {zone,block}=node.getExtras();const key=`${zone}_${block}`
  if(!groups.has(key))groups.set(key,[])
  groups.get(key).push(node)
}
for(const [key,nodes] of groups){
 const instance=ext.createInstancedMesh()
 for(const [semantic,type,length,get] of [['TRANSLATION','VEC3',3,'getWorldTranslation'],['ROTATION','VEC4',4,'getWorldRotation'],['SCALE','VEC3',3,'getWorldScale']]){
  const a=doc.createAccessor().setType(type).setBuffer(buffer).setArray(new Float32Array(nodes.length*length))
  nodes.forEach((n,i)=>a.setElement(i,n[get]()))
  instance.setAttribute(semantic,a)
 }
 const node=doc.createNode(`Seats_${key}`).setMesh(nodes[0].getMesh()).setExtras({zone:nodes[0].getExtras().zone,block:nodes[0].getExtras().block,seatCount:nodes.length}).setExtension('EXT_mesh_gpu_instancing',instance)
 scene.addChild(node)
 nodes.forEach(n=>n.dispose())
}
await doc.transform(prune({keepLeaves:true}),draco())
await io.write(process.argv[3]??'public/models/interior.glb',doc)
console.log('Spatial seat batches:',groups.size)
