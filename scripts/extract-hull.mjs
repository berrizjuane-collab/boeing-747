// Extract actual exterior triangles into cabin-author coordinates.
import {NodeIO} from '@gltf-transform/core'
import {ALL_EXTENSIONS} from '@gltf-transform/extensions'
import draco3d from 'draco3d'
import {Matrix4,Vector3} from 'three'
import {mkdir,writeFile} from 'node:fs/promises'
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'draco3d.decoder':await draco3d.createDecoderModule()})
const doc=await io.read('public/models/exterior.glb'),vertices=[],faces=[]
const correction=new Matrix4().makeRotationX(Math.PI/2)
for(const node of doc.getRoot().listNodes()){
 const mesh=node.getMesh();if(!mesh)continue
 const matrix=correction.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix()))
 for(const primitive of mesh.listPrimitives()){
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),start=vertices.length
  for(let i=0;i<positions.getCount();i++){
   const v=new Vector3().fromArray(positions.getElement(i,[])).applyMatrix4(matrix)
   vertices.push([v.x,v.y-5.5,v.z-5])
  }
  for(let i=0;i<(indices?.getCount()??positions.getCount());i+=3)faces.push([0,1,2].map(j=>start+(indices?indices.getScalar(i+j):i+j)))
 }
}
await mkdir('artifacts/phase6',{recursive:true})
await writeFile('artifacts/phase6/hull.json',JSON.stringify({vertices,faces}))
// Geometry-only inspection copy: Blender cannot decode this asset's KTX2.
const neutral=doc.createMaterial('Inspection neutral').setBaseColorFactor([.6,.65,.7,1])
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives())p.setMaterial(neutral)
for(const m of doc.getRoot().listMaterials())if(m!==neutral)m.dispose()
for(const t of doc.getRoot().listTextures())t.dispose()
for(const e of doc.getRoot().listExtensionsUsed())e.dispose()
await io.write('artifacts/phase6/exterior-geometry.glb',doc)
console.log({vertices:vertices.length,triangles:faces.length})
