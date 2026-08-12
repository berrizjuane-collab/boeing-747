import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
})

after(async () => {
  await server.close()
})

const { cameraTraversalProgress, getInteriorZone, KEYFRAMES, sampleCamera } =
  await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { getActiveSectionIndex } = await server.ssrLoadModule('/src/lib/sections.ts')
const { deriveScrollSnapshot, useScrollStore } = await server.ssrLoadModule('/src/state/scrollStore.ts')
const { AIRCRAFT_SURFACE_MAP_SIZE, createAircraftSurfaceMaps } =
  await server.ssrLoadModule('/src/lib/aircraftSurfaceMaps.ts')

const ZONES = ['cockpit', 'economy', 'stair', 'upperDeck']
const POSITION_STEP_LIMIT = 3
const TARGET_STEP_LIMIT = 3
const ORIENTATION_STEP_LIMIT_DEG = 3
const FOV_STEP_LIMIT_DEG = 0.25
const ROLL_STEP_LIMIT_DEG = 0.35

function expectedZone(progress) {
  if (progress >= 0.5 && progress < 0.532) return 'cockpit'
  if (progress >= 0.5896 && progress < 0.628) return 'economy'
  if (progress >= 0.7048 && progress < 0.7304) return 'stair'
  if (progress >= 0.7816 && progress < 0.82) return 'upperDeck'
  return null
}

function orientation(sample) {
  return sample.target.clone().sub(sample.position).normalize()
}

function degrees(radians) {
  return (radians * 180) / Math.PI
}

test('B1: global section/zone state is consistent at all 101 percentage samples', () => {
  for (let percentage = 0; percentage <= 100; percentage += 1) {
    const progress = percentage / 100
    const expectedIndex = getActiveSectionIndex(progress)
    const expectedInteriorZone = expectedZone(progress)
    const snapshot = deriveScrollSnapshot(progress)

    assert.equal(snapshot.progress, progress, `progress at ${percentage}%`)
    assert.equal(snapshot.activeIndex, expectedIndex, `section at ${percentage}%`)
    assert.equal(getInteriorZone(progress), expectedInteriorZone, `global zone API at ${percentage}%`)
    assert.equal(snapshot.interiorZone, expectedInteriorZone, `derived zone at ${percentage}%`)

    const activePanels = ZONES.filter((zone) => zone === snapshot.interiorZone)
    assert.deepEqual(
      activePanels,
      expectedInteriorZone ? [expectedInteriorZone] : [],
      `active interior panels at ${percentage}%`,
    )
    if (snapshot.activeIndex !== 4) {
      assert.equal(activePanels.length, 0, `no S5 panel may be active in section ${snapshot.activeIndex}`)
    }

    useScrollStore.getState().setProgress(progress)
    const state = useScrollStore.getState()
    assert.equal(state.activeIndex, snapshot.activeIndex, `stored section at ${percentage}%`)
    assert.equal(state.interiorZone, snapshot.interiorZone, `stored zone at ${percentage}%`)
  }
})

test('B1: every dwell boundary has explicit global and half-open semantics', () => {
  const boundaries = [
    [0.5, 'cockpit'],
    [0.532, null],
    [0.5896, 'economy'],
    [0.628, null],
    [0.7048, 'stair'],
    [0.7304, null],
    [0.7816, 'upperDeck'],
    [0.82, null],
  ]

  for (const [progress, zone] of boundaries) {
    assert.equal(getInteriorZone(progress), zone, `zone at exact global progress ${progress}`)
  }
  assert.equal(getInteriorZone(-1), null)
  assert.equal(getInteriorZone(0.09), null)
  assert.equal(getInteriorZone(1), null)
  assert.equal(getInteriorZone(2), null)

  useScrollStore.getState().setProgress(0.8)
  assert.equal(useScrollStore.getState().interiorZone, 'upperDeck')
  useScrollStore.getState().setProgress(0.09)
  assert.equal(useScrollStore.getState().interiorZone, null, 'backtracking out of S5 cannot leave a stale panel')
})

test('B2: the global traversal visits every keyframe in order, including a real upper-deck dwell', () => {
  const arrivals = [
    [0, 0],
    [0.12, 1],
    [0.18, 2],
    [0.28, 3],
    [0.3, 4],
    [0.378, 5],
    [0.42, 6],
    [0.46, 7],
    [0.5, 8],
    [0.5896, 9],
    [0.7048, 10],
    [0.7816, 11],
    [0.83, 12],
    [0.835, 13],
    [0.88, 14],
    [0.95, 15],
    [1, 16],
  ]

  for (const [progress, keyframeIndex] of arrivals) {
    const expected = keyframeIndex / (KEYFRAMES.length - 1)
    assert.ok(
      Math.abs(cameraTraversalProgress(progress) - expected) <= 1e-12,
      `keyframe ${keyframeIndex} at global progress ${progress}`,
    )
  }

  const upperDeckStart = sampleCamera(0.7816)
  const upperDeckMiddle = sampleCamera(0.8)
  const upperDeckEnd = sampleCamera(0.82)
  assert.ok(upperDeckStart.position.distanceTo(upperDeckMiddle.position) <= 1e-9)
  assert.ok(upperDeckMiddle.position.distanceTo(upperDeckEnd.position) <= 1e-9)
  assert.equal(getInteriorZone(0.8), 'upperDeck')
  assert.equal(getInteriorZone(0.82), null)
})

test('B2: 1001 samples stay monotonic and continuous in pose and scalar channels', (context) => {
  const maxima = {
    position: { value: 0, progress: 0 },
    target: { value: 0, progress: 0 },
    orientationDeg: { value: 0, progress: 0 },
    fovDeg: { value: 0, progress: 0 },
    rollDeg: { value: 0, progress: 0 },
  }
  let previousProgress = cameraTraversalProgress(0)
  let previous = sampleCamera(0)

  for (let sampleIndex = 1; sampleIndex <= 1000; sampleIndex += 1) {
    const progress = sampleIndex / 1000
    const traversalProgress = cameraTraversalProgress(progress)
    const current = sampleCamera(progress)
    const deltas = {
      position: current.position.distanceTo(previous.position),
      target: current.target.distanceTo(previous.target),
      orientationDeg: degrees(orientation(current).angleTo(orientation(previous))),
      fovDeg: Math.abs(current.fov - previous.fov),
      rollDeg: degrees(Math.abs(current.rollRad - previous.rollRad)),
    }

    assert.ok(Number.isFinite(traversalProgress), `finite traversal at ${progress}`)
    assert.ok(traversalProgress + 1e-12 >= previousProgress, `monotonic traversal at ${progress}`)
    assert.ok(deltas.position <= POSITION_STEP_LIMIT, `position ${deltas.position} at ${progress}`)
    assert.ok(deltas.target <= TARGET_STEP_LIMIT, `target ${deltas.target} at ${progress}`)
    assert.ok(
      deltas.orientationDeg <= ORIENTATION_STEP_LIMIT_DEG,
      `orientation ${deltas.orientationDeg}deg at ${progress}`,
    )
    assert.ok(deltas.fovDeg <= FOV_STEP_LIMIT_DEG, `FOV ${deltas.fovDeg}deg at ${progress}`)
    assert.ok(deltas.rollDeg <= ROLL_STEP_LIMIT_DEG, `roll ${deltas.rollDeg}deg at ${progress}`)

    for (const [metric, delta] of Object.entries(deltas)) {
      if (delta > maxima[metric].value) maxima[metric] = { value: delta, progress }
    }
    previousProgress = traversalProgress
    previous = current
  }

  assert.equal(cameraTraversalProgress(0), 0)
  assert.equal(cameraTraversalProgress(1), 1)
  context.diagnostic(`max deltas: ${JSON.stringify(maxima)}`)
})

test('B2: all six narrative boundaries pass the same continuity contract', () => {
  for (const boundary of [0.12, 0.28, 0.42, 0.5, 0.82, 0.95]) {
    const before = sampleCamera(boundary - 0.001)
    const at = sampleCamera(boundary)
    const after = sampleCamera(boundary + 0.001)

    for (const [label, from, to] of [
      ['before', before, at],
      ['after', at, after],
    ]) {
      assert.ok(from.position.distanceTo(to.position) <= POSITION_STEP_LIMIT, `${boundary} ${label} position`)
      assert.ok(from.target.distanceTo(to.target) <= TARGET_STEP_LIMIT, `${boundary} ${label} target`)
      assert.ok(
        degrees(orientation(from).angleTo(orientation(to))) <= ORIENTATION_STEP_LIMIT_DEG,
        `${boundary} ${label} orientation`,
      )
      assert.ok(Math.abs(from.fov - to.fov) <= FOV_STEP_LIMIT_DEG, `${boundary} ${label} FOV`)
      assert.ok(degrees(Math.abs(from.rollRad - to.rollRad)) <= ROLL_STEP_LIMIT_DEG, `${boundary} ${label} roll`)
    }
  }
})

test('C1: authored exterior normal and roughness maps are present and non-uniform', () => {
  const maps = createAircraftSurfaceMaps()
  const roughnessData = maps.roughness.image.data
  const normalData = maps.normal.image.data
  const roughnessValues = new Set()
  const normalValues = new Set()

  for (let offset = 0; offset < roughnessData.length; offset += 4) {
    roughnessValues.add(roughnessData[offset + 1])
    normalValues.add(`${normalData[offset]}:${normalData[offset + 1]}:${normalData[offset + 2]}`)
  }

  assert.equal(maps.roughness.image.width, AIRCRAFT_SURFACE_MAP_SIZE)
  assert.equal(maps.roughness.image.height, AIRCRAFT_SURFACE_MAP_SIZE)
  assert.ok(roughnessValues.size >= 20, `expected >=20 roughness levels, received ${roughnessValues.size}`)
  assert.ok(normalValues.size >= 20, `expected >=20 normal vectors, received ${normalValues.size}`)
  assert.ok(maps.roughnessRange[1] - maps.roughnessRange[0] >= 0.2, `roughness range ${maps.roughnessRange}`)
  assert.equal(maps.normal.name, 'MERIDIAN_A380_panel_normal')
  assert.equal(maps.roughness.name, 'MERIDIAN_A380_surface_roughness')

  maps.normal.dispose()
  maps.roughness.dispose()
})
