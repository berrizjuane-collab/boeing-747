import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { SHOT_SHEET, FINISH_REFERENCES } = await server.ssrLoadModule('/src/lib/shotSheet.ts')
const { INTERIOR_MANIFEST } = await server.ssrLoadModule('/src/lib/sceneLayout.ts')
const {
  SHAFT_DROP_ANGLE,
  SHAFT_WIDTH,
  UPPER_DECK_FLOOR,
  deckFloorFor,
  shaftFloorClearance,
  shaftLength,
} = await server.ssrLoadModule('/src/lib/cabinShafts.ts')
const { createCarpetAlbedo } = await server.ssrLoadModule('/src/lib/interiorSurfaceMaps.ts')
const { createDissolveHullMaterial } = await server.ssrLoadModule('/src/lib/dissolveHullMaterial.ts')
const { MeshStandardMaterial } = await import('three')

test('5.1: every shot records what it reproduces and what it stylises', () => {
  for (const shot of SHOT_SHEET) {
    const finish = FINISH_REFERENCES[shot.id]
    assert.ok(finish, `${shot.id} has no finish reference`)
    assert.ok(finish.reference.length > 10, `${shot.id} names no lighting reference`)
    assert.ok(finish.reproduced.length > 10, `${shot.id} claims nothing as reproduced`)
    assert.ok(finish.stylised.length > 5, `${shot.id} admits nothing as stylised`)
  }
  // And nothing in the table refers to a shot that no longer exists.
  const ids = new Set(SHOT_SHEET.map((shot) => shot.id))
  for (const id of Object.keys(FINISH_REFERENCES)) {
    assert.ok(ids.has(id), `finish reference ${id} has no shot`)
  }
})

test('5.2: the hull\'s procedural surface detail does not depend on the asset\'s broken UVs', () => {
  // scripts/audit-exterior-surface.mjs measured 16.3% of the hull's 67,580
  // triangles with zero-area UVs and an 8.4x texel-density spread. A map
  // bound through TEXCOORD_0 is therefore flat across a sixth of the
  // aircraft, so the roughness detail is projected from object space.
  const source = new MeshStandardMaterial({ name: 'A380_Hull' })
  const material = createDissolveHullMaterial(source)
  assert.equal(material.roughnessMap, null, 'roughness must not be bound to the asset UVs')
  assert.ok(material.userData.aircraftSurfaceMaps.roughness, 'the tile itself is still generated')

  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader:
      '#include <common>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <opaque_fragment>',
  }
  material.onBeforeCompile(shader)

  assert.ok(shader.uniforms.meridianSurfaceRoughness, 'the tile must reach the shader as a uniform')
  assert.ok(shader.vertexShader.includes('vMeridianObjectPosition'), 'object position must be passed through')
  assert.ok(shader.fragmentShader.includes('meridianSurfaceDetail'), 'the projected sampler must be injected')
  assert.ok(
    shader.fragmentShader.includes('roughnessFactor = meridianSurfaceDetail('),
    'roughness must actually be driven by the projection',
  )
  // Three samples, one per plane — that is what makes it independent of UVs.
  assert.equal((shader.fragmentShader.match(/texture2D\(meridianSurfaceRoughness/g) ?? []).length, 3)
  material.dispose()
})

test('5.4: every light shaft stops at the floor of the deck it belongs to', () => {
  const windows = INTERIOR_MANIFEST.windows
  assert.ok(windows.length > 20, 'the manifest must carry the window inventory')

  let upperDeckWindows = 0
  for (const window of windows) {
    const clearance = shaftFloorClearance(window.y)
    assert.ok(clearance >= 0, `a beam from y=${window.y} passes ${-clearance} through its floor`)
    assert.ok(clearance < 0.6, `a beam from y=${window.y} stops ${clearance} short and hangs in the air`)
    if (deckFloorFor(window.y) === UPPER_DECK_FLOOR) upperDeckWindows += 1
  }
  assert.ok(upperDeckWindows > 0, 'the upper deck must be represented')

  // The single authored length this replaced.
  const previousLength = 4.6
  const mainDeckWindowY = windows.find((window) => deckFloorFor(window.y) === 0).y
  const overshoot = (previousLength - shaftLength(mainDeckWindowY)) * Math.sin(SHAFT_DROP_ANGLE)
  assert.ok(overshoot > 1, `the old beams went ${overshoot} through the main-deck floor`)

  // A beam is a beam, not a wall.
  assert.ok(SHAFT_WIDTH < 1, `shaft width ${SHAFT_WIDTH} is slab-scale`)
})

test('5.5: the carpet varies at tuft scale, not per texel', () => {
  const size = 128
  const carpet = createCarpetAlbedo(size, [52, 66, 88], [92, 104, 120], 0.14)
  const data = carpet.image.data

  const luma = (x, y) => {
    const offset = ((y % size) * size + (x % size)) * 4
    return 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2]
  }

  let adjacent = 0
  let total = 0
  let mean = 0
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = luma(x, y)
      adjacent += Math.abs(value - luma(x + 1, y)) + Math.abs(value - luma(x, y + 1))
      mean += value
      total += 1
    }
  }
  mean /= total
  let variance = 0
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) variance += (luma(x, y) - mean) ** 2
  const deviation = Math.sqrt(variance / total)
  const neighbourContrast = adjacent / (total * 2)

  // Still a textile: real variation across the tile.
  assert.ok(deviation > 3, `carpet is too flat: deviation ${deviation}`)
  // But adjacent texels belong to the same tuft, which is what separates a
  // pile from gravel. The previous generator produced roughly twice this.
  assert.ok(
    neighbourContrast < deviation * 0.8,
    `adjacent-texel contrast ${neighbourContrast} is high against an overall deviation of ${deviation}`,
  )
  carpet.dispose()
})
