#!/usr/bin/env node
// Fase 3 §6.3 asset pipeline: prune, dedup, weld, instance -> Draco -> KTX2/BasisU -> final .glb.
// Reproducible and scriptable on purpose: re-run this on any source .glb (the
// procedural interior blockout today, the real exterior once its source file
// is available) instead of hand-processing assets one-off in the Blender UI.
//
// `instance` matters more than it looks like it should for the interior
// blockout specifically: its 250 repeated seat meshes share one geometry
// buffer in Blender, but glTF export still emits 250 separate mesh nodes —
// without this step they stay 250 separate draw calls at runtime. This is
// exactly the InstancedMesh requirement from PLAN.md §6.1 ("400 asientos
// modelados individualmente no es shippable"), applied via glTF's
// EXT_mesh_gpu_instancing (which three.js's GLTFLoader reads natively)
// instead of hand-building an InstancedMesh in the app.
//
// Usage:
//   node scripts/process-glb.mjs <input.glb> <output.glb> [--ktx-mode etc1s|uastc]
//
// KTX2/Basis compression is skipped automatically (with a clear log line, not
// a silent no-op) when the source has no textures — the interior blockout is
// solid-color materials only, so this stage has nothing to do for it today.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'

const [, , inputArg, outputArg, ...rest] = process.argv

if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/process-glb.mjs <input.glb> <output.glb> [--ktx-mode etc1s|uastc]')
  process.exit(1)
}

const input = resolve(inputArg)
const output = resolve(outputArg)
const ktxModeFlagIndex = rest.indexOf('--ktx-mode')
const ktxMode = ktxModeFlagIndex >= 0 ? rest[ktxModeFlagIndex + 1] : 'etc1s'

if (!existsSync(input)) {
  console.error(`Input not found: ${input}`)
  process.exit(1)
}
if (!['etc1s', 'uastc'].includes(ktxMode)) {
  console.error(`--ktx-mode must be "etc1s" or "uastc", got "${ktxMode}"`)
  process.exit(1)
}

const CLI_BIN = resolve('node_modules/.bin/gltf-transform')

function sizeOf(path) {
  return statSync(path).size
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function run(label, args) {
  console.log(`  -> ${label}`)
  execFileSync(CLI_BIN, args, { stdio: 'inherit' })
}

async function textureCount(path) {
  // Reading a Draco-compressed intermediate file back in requires the
  // decoder registered, or NodeIO refuses to open it at all.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
  const doc = await io.read(path)
  return doc.getRoot().listTextures().length
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'glb-pipeline-'))
  const startSize = sizeOf(input)
  console.log(`Fase 3 asset pipeline: ${input}`)
  console.log(`  input size: ${fmtKb(startSize)}`)

  try {
    const pruned = join(workDir, '1-pruned.glb')
    const deduped = join(workDir, '2-deduped.glb')
    const welded = join(workDir, '3-welded.glb')
    const instanced = join(workDir, '4-instanced.glb')
    const dracoOut = join(workDir, '5-draco.glb')

    run('prune (remove unreferenced properties)', ['prune', input, pruned])
    run('dedup (deduplicate accessors and textures)', ['dedup', pruned, deduped])
    run('weld (merge equivalent vertices)', ['weld', deduped, welded])
    run('instance (GPU-instance repeated meshes, EXT_mesh_gpu_instancing)', ['instance', welded, instanced])
    run('draco (compress geometry)', ['draco', instanced, dracoOut])

    const nTextures = await textureCount(dracoOut)
    let finalFile = dracoOut

    if (nTextures === 0) {
      console.log('  -> KTX2/Basis skipped: source has no textures (nothing to compress)')
    } else {
      const ktxOut = join(workDir, '5-ktx2.glb')
      run(`${ktxMode} (KTX2/Basis texture compression, ${nTextures} texture(s))`, [ktxMode, dracoOut, ktxOut])
      finalFile = ktxOut
    }

    copyFileSync(finalFile, output)

    const endSize = sizeOf(output)
    const ratio = (startSize / endSize).toFixed(1)
    console.log(`  output: ${output}`)
    console.log(`  ${fmtKb(startSize)} -> ${fmtKb(endSize)} (${ratio}x smaller)`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
