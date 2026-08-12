import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'

const input = path.resolve(process.argv[2] ?? 'public/models/interior.glb')
const MAX_BYTES = 250 * 1024
// Leaves ~150k of Mobile Low's 500k scene budget for the exterior, portal
// and environment while S5 keeps both assets mounted for the transition.
const MAX_RENDER_TRIANGLES = 350_000
const MAX_RENDER_BATCHES = 45
const REQUIRED_NODES = [
  'Cockpit_MainPanel',
  'Cockpit_Ceiling',
  'Economy_Aisle',
  'Economy_Ceiling',
  'Stair_Main',
  'Stair_Wall_Left',
  'Stair_Wall_Right',
  'Stair_Ceiling',
  'Stair_UpperLanding',
  'UpperDeck_Aisle',
  'UpperDeck_Ceiling',
  'UpperDeck_ExitFrame',
  'UpperDeck_AftBulkhead',
]
const REQUIRED_MATERIALS = [
  'Mat_Shell',
  'Mat_Seat',
  'Mat_Emissive',
  'Mat_Display',
  'Mat_Metal',
  'Mat_Glass',
]

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const document = await io.read(input)
const root = document.getRoot()
const nodes = root.listNodes()
const materials = root.listMaterials()
const nodeNames = new Set(nodes.map((node) => node.getName()))
const batchedSourceNodeNames = new Set(
  root.listScenes().flatMap((scene) => scene.getExtras().geometryBatchedSourceNodes ?? []),
)
const materialNames = new Set(materials.map((material) => material.getName()))

for (const name of REQUIRED_NODES) {
  assert.ok(nodeNames.has(name) || batchedSourceNodeNames.has(name), `published interior is missing node ${name}`)
  const node = nodes.find((candidate) => candidate.getName() === name)
  assert.ok(
    node?.getMesh() || batchedSourceNodeNames.has(name),
    `published interior node ${name} is neither rendered nor declared in the source inventory`,
  )
}
for (const name of REQUIRED_MATERIALS) assert.ok(materialNames.has(name), `published interior is missing material ${name}`)

let instanceBatches = 0
let seatInstances = 0
let renderTriangles = 0
let renderBatches = 0
for (const node of nodes) {
  const mesh = node.getMesh()
  if (!mesh) continue
  const instancing = node.getExtension('EXT_mesh_gpu_instancing')
  const attributes = instancing?.listAttributes() ?? []
  const instanceCount = attributes[0]?.getCount() ?? 1
  if (instancing) {
    instanceBatches += 1
    for (const attribute of attributes) {
      assert.equal(attribute.getCount(), instanceCount, `instance attribute count mismatch on ${mesh.getName()}`)
    }
  }
  if (mesh.getName() === 'Seat_Base_Mesh' && instancing) seatInstances += instanceCount

  renderBatches += mesh.listPrimitives().length
  for (const primitive of mesh.listPrimitives()) {
    const elementCount = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0
    renderTriangles += (elementCount / 3) * instanceCount
  }
}

assert.equal(seatInstances, 240, `expected 240 GPU-instanced seats, received ${seatInstances}`)
assert.ok(instanceBatches >= 7, `expected at least 7 GPU instance batches, received ${instanceBatches}`)
assert.ok(
  renderTriangles <= MAX_RENDER_TRIANGLES,
  `interior render workload ${renderTriangles} triangles exceeds ${MAX_RENDER_TRIANGLES}`,
)
assert.ok(renderBatches <= MAX_RENDER_BATCHES, `interior ${renderBatches} render batches exceeds ${MAX_RENDER_BATCHES}`)

const glass = materials.find((material) => material.getName() === 'Mat_Glass')
const metal = materials.find((material) => material.getName() === 'Mat_Metal')
const emissive = materials.find((material) => material.getName() === 'Mat_Emissive')
assert.ok(glass?.getExtension('KHR_materials_transmission'), 'Mat_Glass must retain physical transmission')
assert.ok((metal?.getMetallicFactor() ?? 0) >= 0.8, 'Mat_Metal must remain physically metallic')
assert.ok(
  Math.max(...(emissive?.getEmissiveFactor() ?? [0, 0, 0])) > 0,
  'Mat_Emissive must retain a non-zero emissive factor',
)

const fileSize = (await stat(input)).size
assert.ok(fileSize <= MAX_BYTES, `interior GLB ${fileSize} bytes exceeds ${MAX_BYTES}`)

console.log(
  JSON.stringify(
    {
      input,
      fileSize,
      nodes: nodes.length,
      meshes: root.listMeshes().length,
      materials: materials.length,
      instanceBatches,
      seatInstances,
      renderBatches,
      renderTriangles,
      requiredStructure: 'PASS',
      pbrMaterials: 'PASS',
    },
    null,
    2,
  ),
)
