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
const { TERRAIN_SURFACE_MAP_SIZE, createTerrainSurfaceMaps } =
  await server.ssrLoadModule('/src/lib/terrainSurfaceMaps.ts')
const { createGrassClumpGeometry } = await server.ssrLoadModule('/src/lib/vegetationGeometry.ts')
const { VEGETATION_MAX, buildVegetationInstances } = await server.ssrLoadModule('/src/lib/vegetationLayout.ts')
const { createTreeBillboardGeometry } = await server.ssrLoadModule('/src/lib/treeGeometry.ts')
const { FOREST_INSTANCE_COUNT, buildForestInstances } = await server.ssrLoadModule('/src/lib/forestLayout.ts')

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

test('C3: terrain surface maps are non-uniform and deterministic byte-for-byte', () => {
  const first = createTerrainSurfaceMaps()
  const second = createTerrainSurfaceMaps()
  const albedoValues = new Set()
  const roughnessValues = new Set()

  assert.equal(first.albedo.image.width, TERRAIN_SURFACE_MAP_SIZE)
  assert.equal(first.albedo.image.height, TERRAIN_SURFACE_MAP_SIZE)
  assert.equal(first.albedo.image.data.length, second.albedo.image.data.length)
  assert.equal(first.roughness.image.data.length, second.roughness.image.data.length)

  for (let offset = 0; offset < first.albedo.image.data.length; offset += 1) {
    // Byte-for-byte determinism (visual QA's screenshot diffing depends on
    // it, same reasoning C3's own plan3.md verification column states).
    assert.equal(first.albedo.image.data[offset], second.albedo.image.data[offset], `albedo byte ${offset}`)
    assert.equal(first.roughness.image.data[offset], second.roughness.image.data[offset], `roughness byte ${offset}`)
  }

  for (let offset = 0; offset < first.albedo.image.data.length; offset += 4) {
    albedoValues.add(`${first.albedo.image.data[offset]}:${first.albedo.image.data[offset + 1]}:${first.albedo.image.data[offset + 2]}`)
    roughnessValues.add(first.roughness.image.data[offset])
  }

  assert.ok(albedoValues.size >= 20, `expected >=20 distinct albedo colors, received ${albedoValues.size}`)
  assert.ok(roughnessValues.size >= 20, `expected >=20 distinct roughness levels, received ${roughnessValues.size}`)

  first.albedo.dispose()
  first.roughness.dispose()
  second.albedo.dispose()
  second.roughness.dispose()
})

test('C2: grass blade normals have a dominant +Y component', () => {
  const geometry = createGrassClumpGeometry()
  const normals = geometry.getAttribute('normal')
  assert.ok(normals.count > 0)
  for (let index = 0; index < normals.count; index += 1) {
    const nx = normals.getX(index)
    const ny = normals.getY(index)
    const nz = normals.getZ(index)
    assert.ok(ny > Math.abs(nx) && ny > Math.abs(nz), `normal ${index} not +Y dominant: (${nx.toFixed(3)}, ${ny.toFixed(3)}, ${nz.toFixed(3)})`)
    assert.ok(ny > 0.85, `normal ${index} Y component too small: ${ny.toFixed(3)}`)
  }
  geometry.dispose()
})

test('C1: tree billboard normals have a dominant +Y component', () => {
  const geometry = createTreeBillboardGeometry()
  const normals = geometry.getAttribute('normal')
  assert.ok(normals.count > 0)
  for (let index = 0; index < normals.count; index += 1) {
    const nx = normals.getX(index)
    const ny = normals.getY(index)
    const nz = normals.getZ(index)
    assert.ok(ny > Math.abs(nx) && ny > Math.abs(nz), `normal ${index} not +Y dominant: (${nx.toFixed(3)}, ${ny.toFixed(3)}, ${nz.toFixed(3)})`)
    assert.ok(ny > 0.85, `normal ${index} Y component too small: ${ny.toFixed(3)}`)
  }
  geometry.dispose()
})

test('C1/C4: forest instances stay clear of the S1/S2 camera path and cover the expected count', () => {
  const instances = buildForestInstances()
  assert.equal(instances.length, FOREST_INSTANCE_COUNT)
  for (const instance of instances) {
    const radius = Math.hypot(instance.x, instance.z)
    // Regression guard for the "giant blob" bug (forestLayout.ts's own
    // placeNear comment): a first cut placed near-band trees from x=45,
    // close enough to the S1/S2 camera (x in [58,100]) that one rendered
    // as an oversized silhouette a few meters from the lens. Every
    // instance must clear either the near band's own minimum |x| (150,
    // with a small margin) or the far band's minimum radius (300).
    assert.ok(
      Math.abs(instance.x) >= 140 || radius >= 300,
      `instance too close to the camera path: x=${instance.x.toFixed(1)} z=${instance.z.toFixed(1)} radius=${radius.toFixed(1)}`,
    )
  }
})

test('C2: vegetation instances are clustered, not uniformly scattered', () => {
  const instances = buildVegetationInstances()
  assert.equal(instances.length, VEGETATION_MAX)

  const xs = instances.map((instance) => instance.x)
  const zs = instances.map((instance) => instance.z)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)
  const gridSize = 24
  const cellCounts = new Array(gridSize * gridSize).fill(0)
  for (const instance of instances) {
    const cx = Math.min(gridSize - 1, Math.floor(((instance.x - minX) / (maxX - minX || 1)) * gridSize))
    const cz = Math.min(gridSize - 1, Math.floor(((instance.z - minZ) / (maxZ - minZ || 1)) * gridSize))
    cellCounts[cz * gridSize + cx] += 1
  }
  const mean = cellCounts.reduce((sum, count) => sum + count, 0) / cellCounts.length
  const variance = cellCounts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / cellCounts.length
  const coefficientOfVariation = Math.sqrt(variance) / mean
  const emptyCellFraction = cellCounts.filter((count) => count === 0).length / cellCounts.length

  // A uniform scatter over this many cells would have a low coefficient of
  // variation and few empty cells; clustering concentrates instances into a
  // minority of cells and leaves the rest empty — the "distribución no
  // uniforme" plan3.md's C2 verification column asks for.
  assert.ok(coefficientOfVariation > 1.0, `expected clustered CoV > 1.0, received ${coefficientOfVariation.toFixed(3)}`)
  assert.ok(emptyCellFraction > 0.3, `expected a clustered field to leave empty cells, received ${(emptyCellFraction * 100).toFixed(1)}%`)
})
