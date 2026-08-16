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

const { generateGrassField } = await server.ssrLoadModule('/src/lib/grassField.ts')
const { createTreeClumpGeometry } = await server.ssrLoadModule('/src/lib/treeGeometry.ts')
const { generateTreeField } = await server.ssrLoadModule('/src/lib/treeField.ts')
const { createTerrainSurfaceMaps, TERRAIN_SURFACE_MAP_SIZE } = await server.ssrLoadModule('/src/lib/terrainSurfaceMaps.ts')
const { createAirportGroundPlanGeometry, TAXIWAY_RUNWAY_JUNCTION } = await server.ssrLoadModule('/src/lib/airportGroundPlan.ts')
const { createRunwayMarkingsGeometry, RUNWAY_SURFACE_Y, RUNWAY_WIDTH, RUNWAY_THRESHOLD_Z, HANGARS, APRON } =
  await server.ssrLoadModule('/src/lib/runwayGeometry.ts')

function coefficientOfVariation(values, min, max, binCount) {
  const bins = new Array(binCount).fill(0)
  for (const value of values) {
    const t = (value - min) / (max - min)
    bins[Math.min(binCount - 1, Math.max(0, Math.floor(t * binCount)))] += 1
  }
  const mean = bins.reduce((a, b) => a + b, 0) / binCount
  const variance = bins.reduce((a, b) => a + (b - mean) ** 2, 0) / binCount
  return Math.sqrt(variance) / mean
}

test('C2: grass field is clustered with density falloff, not a uniform spray', () => {
  const placements = generateGrassField(720, 0xa38026)
  assert.equal(placements.length, 720)
  for (const p of placements) {
    assert.ok(p.lateral >= 18 && p.lateral <= 90, `lateral out of declared range: ${p.lateral}`)
    assert.ok(p.z >= -255 && p.z <= 255, `z out of declared range: ${p.z}`)
  }

  const clusteredCoV = coefficientOfVariation(placements.map((p) => p.z), -255, 255, 20)

  // Same PRNG, same sample count, but the pre-C2 formula (`-255 + random()*510`,
  // no cluster centers) — the actual "before" this item replaced, not an
  // arbitrary uniform reference.
  let state = 0xa38026 >>> 0
  const uniformRandom = () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
  const uniformZ = Array.from({ length: 720 }, () => -255 + uniformRandom() * 510)
  const uniformCoV = coefficientOfVariation(uniformZ, -255, 255, 20)

  assert.ok(
    clusteredCoV > uniformCoV * 1.5,
    `clustered CoV ${clusteredCoV.toFixed(3)} should exceed the old uniform-scatter CoV ${uniformCoV.toFixed(3)} by 1.5x+`,
  )
})

test('C1: tree geometry normals lean dominantly +Y — not spikes', () => {
  const geometry = createTreeClumpGeometry()
  const normals = geometry.getAttribute('normal')
  const colors = geometry.getAttribute('color')
  assert.ok(normals.count >= 20, `expected a real tree mesh, got ${normals.count} vertices`)

  for (let i = 0; i < normals.count; i += 1) {
    const nx = normals.getX(i)
    const ny = normals.getY(i)
    const nz = normals.getZ(i)
    assert.ok(ny > 0, `normal ${i} should point upward: (${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)})`)
    assert.ok(
      ny > Math.abs(nx) && ny > Math.abs(nz),
      `normal ${i} should have a dominant +Y component: (${nx.toFixed(2)},${ny.toFixed(2)},${nz.toFixed(2)})`,
    )
  }

  const distinctColors = new Set()
  for (let i = 0; i < colors.count; i += 1) distinctColors.add(`${colors.getX(i).toFixed(2)}:${colors.getY(i).toFixed(2)}:${colors.getZ(i).toFixed(2)}`)
  assert.ok(distinctColors.size >= 2, 'expected trunk and canopy to carry distinct vertex colors')
  geometry.dispose()
})

test('C1/C4: near trees stay clear of the hangar footprints; far treeline clears every built structure', () => {
  const placements = generateTreeField(42, 96, 0x7ee5a1)
  const near = placements.filter((tree) => tree.band === 'near')
  const far = placements.filter((tree) => tree.band === 'far')
  assert.equal(near.length, 42)
  assert.equal(far.length, 96)

  for (const tree of near) assert.ok(tree.x > 0, `near-band tree should be east of the runway, got x=${tree.x}`)

  const builtMaxAbsX = Math.max(APRON.width / 2 + Math.abs(APRON.centerX), ...HANGARS.map((h) => Math.abs(h.position[0]) + h.size[0] / 2 + 6))
  for (const tree of far) assert.ok(Math.abs(tree.x) > builtMaxAbsX, `far-band tree at x=${tree.x} should clear every built footprint (max ${builtMaxAbsX})`)
})

test('C3: procedural terrain color/roughness maps are non-uniform, not a flat single color', () => {
  const maps = createTerrainSurfaceMaps()
  const colorData = maps.color.image.data
  const colorValues = new Set()
  for (let offset = 0; offset < colorData.length; offset += 4) {
    colorValues.add(`${colorData[offset]}:${colorData[offset + 1]}:${colorData[offset + 2]}`)
  }

  assert.equal(maps.color.image.width, TERRAIN_SURFACE_MAP_SIZE)
  assert.equal(maps.color.image.height, TERRAIN_SURFACE_MAP_SIZE)
  assert.ok(colorValues.size >= 20, `expected >=20 distinct ground colors, got ${colorValues.size}`)
  assert.ok(maps.roughnessRange[1] - maps.roughnessRange[0] >= 0.15, `roughness range ${maps.roughnessRange}`)
})

test('E4: airport ground plan is flat at RUNWAY_SURFACE_Y and its taxiway touches the threshold', () => {
  const geometry = createAirportGroundPlanGeometry()
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  assert.ok(positions.count > 20)
  assert.equal(positions.count, normals.count)

  let touchesRunwayEdge = false
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(Math.abs(positions.getY(i) - RUNWAY_SURFACE_Y) <= 1e-9, `ground plan y at vertex ${i}`)
    assert.equal(normals.getX(i), 0)
    assert.equal(normals.getY(i), 1)
    assert.equal(normals.getZ(i), 0)
    if (Math.abs(positions.getX(i) - -RUNWAY_WIDTH / 2) <= 1e-9) touchesRunwayEdge = true
  }
  assert.ok(touchesRunwayEdge, 'expected at least one vertex exactly on the runway west edge (x = -RUNWAY_WIDTH/2)')
  assert.equal(TAXIWAY_RUNWAY_JUNCTION.x, -RUNWAY_WIDTH / 2)
  assert.equal(TAXIWAY_RUNWAY_JUNCTION.z, RUNWAY_THRESHOLD_Z)
  geometry.dispose()
})

test('B4 regression: runway markings are untouched by the runwayGeometry.ts constant extraction', () => {
  const geometry = createRunwayMarkingsGeometry()
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  assert.ok(positions.count > 100)
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(Math.abs(positions.getY(i) - RUNWAY_SURFACE_Y) <= 1e-9, `marking y at vertex ${i}`)
    assert.equal(normals.getY(i), 1)
  }
  geometry.dispose()
})
