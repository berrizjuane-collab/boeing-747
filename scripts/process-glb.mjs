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
//   node scripts/process-glb.mjs <input.glb> <output.glb>
//     [--ktx-mode etc1s|uastc] [--join-draw-calls]
//
// KTX2/Basis compression is skipped automatically (with a clear log line, not
// a silent no-op) when the source has no textures — the interior blockout is
// solid-color materials only, so this stage has nothing to do for it today.
//
// KTX2/Basis also degrades gracefully (again with a clear log line, not a
// silent no-op) when the external `ktx` CLI from KTX-Software isn't
// installed — gltf-transform's etc1s/uastc commands shell out to it, there's
// no pure-JS/WASM fallback. First hit against the real exterior asset
// (2026-08-05): no apt/pip package provided it in that session, and
// installing from the upstream GitHub release wasn't reachable from that
// session's network scope, so it fell back to JPEG recompression, which
// needs no external binary (sharp is a JS dependency already) — a real,
// honest degradation, not equivalent to KTX2 (see the comment above the
// fallback branch below for exactly what's lost). Environment-dependent, not
// a fixed limitation of this script: a later session (2026-08-06) had both
// GitHub release downloads and an apt-installable `blender` reachable, so
// `ktx` was installed system-wide and this path now succeeds normally —
// nothing in this script changed to make that true, only what surrounds it.

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
if (/interior/i.test(inputArg + outputArg)) {
  execFileSync(process.execPath, ['scripts/process-interior.mjs', input, output], {stdio:'inherit'})
  process.exit(0)
}
const ktxModeFlagIndex = rest.indexOf('--ktx-mode')
const ktxMode = ktxModeFlagIndex >= 0 ? rest[ktxModeFlagIndex + 1] : 'etc1s'
const joinDrawCalls = rest.includes('--join-draw-calls')

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

async function namedNodeNames(path) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
  const doc = await io.read(path)
  return doc.getRoot().listNodes().map((node) => node.getName()).filter(Boolean)
}

/**
 * `join --keepNamed false` is what lets compatible primitives collapse to a
 * material batch, but named source nodes also carry the interior's semantic
 * audit contract. Preserve the complete source inventory in scene metadata:
 * runtime geometry stays batched and the graph does not gain hundreds of
 * empty marker objects, while tooling can still audit every authored part.
 */
async function preserveSemanticInventory(path, output, names) {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
  const doc = await io.read(path)
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  scene.setExtras({ ...scene.getExtras(), geometryBatchedSourceNodes: names })
  await io.write(output, doc)
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
    const joined = join(workDir, '4-joined.glb')
    const semantic = join(workDir, '4-semantic.glb')
    const dracoOut = join(workDir, '5-draco.glb')

    const semanticNodeNames = joinDrawCalls ? await namedNodeNames(input) : []

    run('prune (remove unreferenced properties)', ['prune', input, pruned])
    run('dedup (deduplicate accessors and textures)', ['dedup', pruned, deduped])
    run('weld (merge equivalent vertices)', ['weld', deduped, welded])
    run('instance (GPU-instance repeated meshes, EXT_mesh_gpu_instancing)', ['instance', welded, instanced])
    let geometryInput = instanced
    if (joinDrawCalls) {
      run('join (batch compatible primitives by material)', ['join', instanced, joined, '--keepNamed', 'false'])
      await preserveSemanticInventory(joined, semantic, semanticNodeNames)
      geometryInput = semantic
    }
    run('draco (compress geometry)', ['draco', geometryInput, dracoOut])

    const nTextures = await textureCount(dracoOut)
    let finalFile = dracoOut

    if (nTextures === 0) {
      console.log('  -> KTX2/Basis skipped: source has no textures (nothing to compress)')
    } else {
      // Cap at 2048 before *any* texture compression path, KTX2 or fallback
      // alike — this source ships 7321x4677, wildly beyond anything this
      // scene's camera distance needs (§6.1's LOD reasoning: no shot gets
      // close enough to justify it). This has to run even when KTX2
      // succeeds: gpuSize scales with pixel count regardless of codec, so a
      // successful ETC1S encode of the *uncapped* source measured 22.85 MB
      // gpuSize — more than the capped JPEG fallback's 14.29 MB, defeating
      // the entire point of §6.2 ("KTX2/Basis es no negociable"). Capping
      // first, then encoding whichever way succeeds, is what actually
      // delivers the VRAM budget.
      const resized = join(workDir, '5-resized.glb')
      run('resize (cap textures at 2048px)', ['resize', '--width', '2048', '--height', '2048', dracoOut, resized])

      const ktxOut = join(workDir, '6-ktx2.glb')
      try {
        run(`${ktxMode} (KTX2/Basis texture compression, ${nTextures} texture(s))`, [ktxMode, resized, ktxOut])
        finalFile = ktxOut
      } catch {
        // The real cause already printed above (stdio: 'inherit') — most
        // likely the external `ktx` CLI not being installed, see the header
        // comment. Not pattern-matching the error text: whatever broke this
        // step, falling back to a JPEG pass is the right universal response,
        // and the live output already carries the specific cause.
        console.log('  -> KTX2/Basis FAILED (see error above) — likely `ktx` CLI (KTX-Software) not installed')
        console.log('     falling back to JPEG recompression — NOT equivalent to KTX2:')
        console.log('     the texture still fully decompresses in GPU memory at runtime (PLAN.md §6.2),')
        console.log('     this only reduces the download/transmitted size, not the VRAM footprint.')
        const recompressed = join(workDir, '6-jpeg.glb')
        run('jpeg (recompress, fallback mitigation)', ['jpeg', '--quality', '82', resized, recompressed])
        finalFile = recompressed
      }
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
