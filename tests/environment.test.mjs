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

const { sampleCamera } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { EXTERIOR_LIGHTS, SECTION_ENVIRONMENT } = await server.ssrLoadModule('/src/lib/environmentTheme.ts')
const { EXIT_PORTAL, frameVisibility } = await server.ssrLoadModule('/src/lib/thresholdPortals.ts')
const { addRunwayHeadingNumber, createRunwayMarkingsGeometry, RUNWAY_SURFACE_Y } =
  await server.ssrLoadModule('/src/lib/runwayGeometry.ts')
const { createAirportGroundPlanGeometry, TAXIWAY_TOUCH_X, TAXIWAY_TOUCH_Z_RANGE } =
  await server.ssrLoadModule('/src/lib/airportGroundPlan.ts')
const { createControlTowerBodyGeometry } = await server.ssrLoadModule('/src/lib/controlTowerGeometry.ts')

test('A2/A3: exterior rig and atmosphere have complete finite section anchors', () => {
  assert.deepEqual(Object.keys(EXTERIOR_LIGHTS).sort(), ['fill', 'key', 'rim'])
  assert.equal(new Set(Object.values(EXTERIOR_LIGHTS).map((light) => light.name)).size, 3)
  assert.equal(SECTION_ENVIRONMENT.length, 7)

  for (const [sectionIndex, section] of SECTION_ENVIRONMENT.entries()) {
    assert.ok(section.fogDensity > 0 && section.fogDensity < 0.002, `fog density S${sectionIndex + 1}`)
    assert.ok(section.exposureCompensation > 0 && section.exposureCompensation <= 1.1)
    assert.ok(section.environmentIntensity > 0 && section.environmentIntensity <= 1)
    for (const role of ['key', 'fill', 'rim']) {
      const light = section.lights[role]
      assert.ok(light.temperatureKelvin >= 2500 && light.temperatureKelvin <= 9000, `${role} CCT S${sectionIndex + 1}`)
      assert.match(light.color, /^#[\da-f]{6}$/i)
      assert.ok(Number.isFinite(light.intensity) && light.intensity >= 0)
    }
  }
})

test('B3: exit frame is present at crossing and absent after crossing', () => {
  for (const [progress, expectedVisible] of [[0.83, true], [0.86, false], [0.88, false], [0.92, false]]) {
    const sample = sampleCamera(progress)
    const forward = sample.target.clone().sub(sample.position).normalize()
    const visibility = frameVisibility(progress, EXIT_PORTAL, sample.position, forward)
    if (expectedVisible) assert.ok(visibility >= 0.75, `frame visible at ${progress}: ${visibility}`)
    else assert.equal(visibility, 0, `frame absent at ${progress}`)
  }
})

test('B4: every runway marking vertex and normal lies on the horizontal XZ plane', () => {
  const geometry = createRunwayMarkingsGeometry()
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  assert.ok(positions.count > 100)
  assert.equal(positions.count, normals.count)

  for (let index = 0; index < positions.count; index += 1) {
    assert.ok(Math.abs(positions.getY(index) - RUNWAY_SURFACE_Y) <= 1e-9, `marking y at vertex ${index}`)
    assert.equal(normals.getX(index), 0)
    assert.equal(normals.getY(index), 1)
    assert.equal(normals.getZ(index), 0)
  }
  geometry.dispose()
})

test('E4: airport ground plan lies flat on the runway surface and touches its edge', () => {
  const geometry = createAirportGroundPlanGeometry()
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  const colors = geometry.getAttribute('color')
  assert.ok(positions.count > 8)
  assert.equal(positions.count, normals.count)
  assert.equal(positions.count, colors.count)

  let touchesRunwayEdge = false
  const [zMin, zMax] = TAXIWAY_TOUCH_Z_RANGE
  const distinctColors = new Set()
  for (let index = 0; index < positions.count; index += 1) {
    assert.ok(Math.abs(positions.getY(index) - RUNWAY_SURFACE_Y) <= 1e-9, `ground plan y at vertex ${index}`)
    assert.equal(normals.getX(index), 0)
    assert.equal(normals.getY(index), 1)
    assert.equal(normals.getZ(index), 0)
    distinctColors.add(`${colors.getX(index).toFixed(3)}:${colors.getY(index).toFixed(3)}:${colors.getZ(index).toFixed(3)}`)
    if (positions.getX(index) === TAXIWAY_TOUCH_X && positions.getZ(index) >= zMin && positions.getZ(index) <= zMax) {
      touchesRunwayEdge = true
    }
  }

  assert.ok(touchesRunwayEdge, 'taxiway must share a vertex with the runway edge (x = TAXIWAY_TOUCH_X)')
  // Pavement + solid centerline paint, at minimum — vertex colors actually vary.
  assert.ok(distinctColors.size >= 2, `expected pavement and marking colors, received ${distinctColors.size}`)
  geometry.dispose()
})

test('D3: runway heading numbers use the expected seven-segment counts and stay on the marking plane', () => {
  const buffers = { positions: [], normals: [], indices: [] }
  addRunwayHeadingNumber(buffers, [8, 8], 0, 0, 5, 9, 1.2)
  assert.equal(buffers.positions.length / 3, 2 * 7 * 4, 'digit 8 lights all seven segments, twice')

  const vertexCount = buffers.positions.length / 3
  for (let index = 0; index < vertexCount; index += 1) {
    assert.ok(Math.abs(buffers.positions[index * 3 + 1] - RUNWAY_SURFACE_Y) <= 1e-9, `heading number y at vertex ${index}`)
    assert.deepEqual(
      [buffers.normals[index * 3], buffers.normals[index * 3 + 1], buffers.normals[index * 3 + 2]],
      [0, 1, 0],
      `heading number normal at vertex ${index}`,
    )
  }

  // B4's own test already re-walks every vertex of the full geometry
  // (heading numbers included, since they're appended into the same
  // buffer), so this only needs to confirm integration actually happened.
  const geometry = createRunwayMarkingsGeometry()
  assert.ok(
    geometry.getAttribute('position').count > 236,
    `expected heading numbers to add vertices beyond the pre-D3 baseline (236), received ${geometry.getAttribute('position').count}`,
  )
  geometry.dispose()
})

test('D2: control tower body merges four parts into one geometry with distinct vertex colors', () => {
  const geometry = createControlTowerBodyGeometry()
  const colors = geometry.getAttribute('color')
  assert.ok(colors, 'merged tower geometry must carry vertex colors')
  const distinctColors = new Set()
  for (let index = 0; index < colors.count; index += 1) {
    distinctColors.add(`${colors.getX(index).toFixed(3)}:${colors.getY(index).toFixed(3)}:${colors.getZ(index).toFixed(3)}`)
  }
  assert.ok(distinctColors.size >= 4, `expected >=4 distinct part colors (shaft/cab/window band/roof), received ${distinctColors.size}`)
  geometry.dispose()
})
