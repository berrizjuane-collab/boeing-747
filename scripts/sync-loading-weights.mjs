import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const TARGET = path.resolve('src/lib/loadingWeights.ts')
const ASSETS = {
  '/models/exterior.glb': 'public/models/exterior.glb',
  '/hdri/golden-hour.hdr': 'public/hdri/golden-hour.hdr',
  '/hdri/high-altitude.hdr': 'public/hdri/high-altitude.hdr',
  '/hdri/sunset.hdr': 'public/hdri/sunset.hdr',
}

const checkOnly = process.argv.includes('--check')
let source = await readFile(TARGET, 'utf8')
const report = {}

for (const [url, file] of Object.entries(ASSETS)) {
  const bytes = (await stat(file)).size
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`('${escapedUrl}'\\s*:\\s*)([\\d_]+)`, 'g')
  let replacements = 0
  source = source.replace(pattern, (_match, prefix, declared) => {
    replacements += 1
    report[url] = { file, declared: Number(declared.replaceAll('_', '')), measured: bytes }
    return `${prefix}${bytes.toLocaleString('en-US').replaceAll(',', '_')}`
  })
  if (replacements !== 1) throw new Error(`Expected one loading-weight entry for ${url}; found ${replacements}.`)
}

const mismatches = Object.entries(report).filter(([, values]) => values.declared !== values.measured)
if (checkOnly && mismatches.length > 0) {
  console.error(JSON.stringify({ ok: false, mismatches }, null, 2))
  process.exitCode = 1
} else {
  if (!checkOnly) await writeFile(TARGET, source)
  console.log(JSON.stringify({ ok: true, mode: checkOnly ? 'check' : 'write', assets: report }, null, 2))
}
