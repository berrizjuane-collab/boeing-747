import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import { Vector3 } from 'three'

// Regressions found by the frame-by-frame inspection of 3117af2
// (docs/evidence/round6/inspeccion). Each case failed on that SHA.
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { sampleCamera } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { HULL_SILHOUETTE, projectToScreen, framingShift } = await server.ssrLoadModule('/src/lib/shotFraming.ts')
const { getAircraftPose } = await server.ssrLoadModule('/src/lib/aircraftPose.ts')
const { FLYING_POSE } = await server.ssrLoadModule('/src/lib/sceneLayout.ts')
const { getActiveSectionIndex } = await server.ssrLoadModule('/src/lib/sections.ts')
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

test('the takeoff and climb copy no longer covers the aircraft it describes', () => {
  // On 3117af2 the S2 panel (right) covered the nose from 0.22 to 0.28 and
  // the S3 spec panel (left) the tail from 0.32 to 0.36. A lens shift now
  // composes the aircraft into the free side of a landscape frame.
  const PANEL_EDGE = 0.43
  const sides = ['left', 'right', 'left', null, 'left', 'left', 'left']
  let before = 0
  let after = 0
  let previousShift = framingShift(0, 1.6)
  for (let sample = 0; sample <= 425; sample += 1) {
    const progress = sample / 1000
    const shift = framingShift(progress, 1.6)
    assert.ok(Math.abs(shift - previousShift) < 0.03, `the composition jumps by ${shift - previousShift} at ${progress}`)
    previousShift = shift
    const camera = sampleCamera(progress)
    const offset = new Vector3(...getAircraftPose(progress).position).sub(new Vector3(...FLYING_POSE.position))
    const side = sides[getActiveSectionIndex(progress)]
    const covered = (x) => (side === 'left' ? x < -PANEL_EDGE : side === 'right' ? x > PANEL_EDGE : false)
    for (const point of SILHOUETTE) {
      const screen = projectToScreen(point.clone().add(offset), camera, 1.6)
      if (!screen.onScreen) continue
      if (covered(screen.x)) before += 1
      if (covered(screen.x + shift)) after += 1
    }
  }
  assert.ok(after < before * 0.4, `panels still cover ${after} of ${before} silhouette samples`)
  // Portrait puts the copy under the picture, and the cabin and exit are
  // composed on their own axes: no shift there.
  assert.equal(framingShift(0.3, 390 / 844), 0)
  for (const progress of [0.45, 0.6, 0.85, 0.95, 1]) assert.equal(framingShift(progress, 1.6), 0)
})
