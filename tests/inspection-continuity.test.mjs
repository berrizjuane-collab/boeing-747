import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { Vector3 } from 'three'

// Regressions found by the frame-by-frame inspection of 3117af2
// (docs/evidence/round6/inspeccion). Each case failed on that SHA.
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { sampleCamera } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { HULL_SILHOUETTE, projectToScreen } = await server.ssrLoadModule('/src/lib/shotFraming.ts')
const { DETAIL_CULL_OPACITY } = await server.ssrLoadModule('/src/lib/worldPersistence.ts')
const { deckDissolveAmount } = await server.ssrLoadModule('/src/lib/deckDissolve.ts')

const SILHOUETTE = HULL_SILHOUETTE.map((point) => new Vector3(...point))

test('the aircraft stays in shot while the camera turns back onto it after the door', () => {
  // On 3117af2 fewer than four silhouette samples were on screen from 0.855
  // to 0.885 at 16:10, and the rendered frames showed empty cloud under the
  // copy about "una silueta inconfundible".
  for (let sample = 835; sample <= 950; sample += 1) {
    const progress = sample / 1000
    const camera = sampleCamera(progress)
    const inFrame = SILHOUETTE.filter((point) => projectToScreen(point, camera, 1.6).onScreen).length
    assert.ok(inFrame >= 4, `only ${inFrame} silhouette samples in frame at ${progress}`)
  }
})

test('the aerodrome has dissolved completely before it is culled, and not at all in the hero', () => {
  // The cull at DETAIL_CULL_OPACITY used to remove the horizon forest, the
  // terminal roofs and the tower in a single frame (0.261 → 0.262).
  assert.equal(deckDissolveAmount(0), 0)
  assert.equal(deckDissolveAmount(DETAIL_CULL_OPACITY), 1)
  let previous = deckDissolveAmount(0)
  for (let sample = 1; sample <= 10000; sample += 1) {
    const value = deckDissolveAmount(sample / 10000)
    assert.ok(value >= previous, 'the dissolve must not reverse as the deck closes')
    assert.ok(value - previous < 0.01, `the dissolve stepped by ${value - previous} at deck opacity ${sample / 10000}`)
    previous = value
  }
})
