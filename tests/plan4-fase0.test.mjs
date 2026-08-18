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

const { seededRandom } = await server.ssrLoadModule('/src/lib/seededRandom.ts')
const {
  groundMaskAt,
  terrainHeightAt,
  forestDensityAt,
  sampleGrassField,
  sampleForestField,
  treeBandForRadius,
  TREE_BAND_RADII,
} = await server.ssrLoadModule('/src/lib/terrainField.ts')
const { AERODROME_KEEP_OUT, isInsideAerodromeKeepOut, keepOutFlattenFactor } = await server.ssrLoadModule(
  '/src/lib/aerodromeKeepOut.ts',
)
const { RUNWAY_LENGTH, RUNWAY_WIDTH } = await server.ssrLoadModule('/src/lib/runwayGeometry.ts')
const { HANGARS, APRON, CONTROL_TOWER_POSITION, CONTROL_TOWER_ROOF_RADIUS } = await server.ssrLoadModule(
  '/src/components/RunwayEnvironment.tsx',
)

// Captured once from the pre-refactor private seededRandom in
// RunwayEnvironment.tsx (same algorithm, same two seeds it actually calls
// with — grass 0xa38026, dust 0xd057) before it was deleted in favour of
// this shared module. plan4.md 04-02: proves the extraction is bit-for-bit
// the same generator, not just "looks similar".
const REFERENCE_SEQUENCES = {
  0xa38026: [
    0.5408345311880112, 0.9430749281309545, 0.3838887398596853, 0.9184606643393636,
    0.3886328674852848, 0.7505325863603503, 0.8624655078165233, 0.5450431047938764,
  ],
  0xd057: [
    0.6816201601177454, 0.5462011622730643, 0.7168558198027313, 0.998647742671892,
    0.8955591262783855, 0.5023257376160473, 0.8043074617162347, 0.3306052493862808,
  ],
}

test('04-02: seededRandom extracted verbatim — identical sequence to the pre-refactor private generator', () => {
  for (const [seed, expected] of Object.entries(REFERENCE_SEQUENCES)) {
    const random = seededRandom(Number(seed))
    const actual = Array.from({ length: expected.length }, () => random())
    assert.deepEqual(actual, expected, `seed ${seed} sequence must match byte for byte`)
  }
})

test('04-02: terrainField scalar functions are pure — repeated calls at the same point are byte-identical', () => {
  const samplePoints = [
    [0, 0],
    [123.5, -87.25],
    [-500, 500],
    [1000.125, -1000.875],
    [37, 211],
  ]
  for (const [x, z] of samplePoints) {
    assert.equal(groundMaskAt(x, z), groundMaskAt(x, z), `groundMaskAt(${x},${z}) must be deterministic`)
    assert.equal(terrainHeightAt(x, z), terrainHeightAt(x, z), `terrainHeightAt(${x},${z}) must be deterministic`)
    assert.equal(forestDensityAt(x, z), forestDensityAt(x, z), `forestDensityAt(${x},${z}) must be deterministic`)
  }
})

test('04-02: terrainField scalar functions stay within their declared [0, 1] / bounded ranges', () => {
  const random = seededRandom(0x51de7e)
  for (let i = 0; i < 500; i += 1) {
    const x = (random() - 0.5) * 3000
    const z = (random() - 0.5) * 3000
    const mask = groundMaskAt(x, z)
    const forest = forestDensityAt(x, z)
    const height = terrainHeightAt(x, z)
    assert.ok(mask >= 0 && mask <= 1, `groundMaskAt out of [0,1] at (${x},${z}): ${mask}`)
    assert.ok(forest >= 0 && forest <= 1, `forestDensityAt out of [0,1] at (${x},${z}): ${forest}`)
    assert.ok(Number.isFinite(height) && Math.abs(height) <= 1.4 + 1e-9, `terrainHeightAt out of amplitude at (${x},${z}): ${height}`)
  }
})

test('04-02: sampleGrassField / sampleForestField are deterministic — two calls over the same bounds produce identical arrays', () => {
  const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }
  const grassA = sampleGrassField(bounds)
  const grassB = sampleGrassField(bounds)
  assert.deepEqual(grassA, grassB)
  assert.ok(grassA.length > 0, 'grass field must place at least some instances over a 400x400 area')

  for (const band of ['near', 'mid', 'far']) {
    const forestA = sampleForestField(band, bounds)
    const forestB = sampleForestField(band, bounds)
    assert.deepEqual(forestA, forestB, `forest band ${band} must be deterministic`)
  }
})

test('04-02: grass instances only land where the shared mask says grass (bug #16 — no phantom grass off the shared field)', () => {
  const bounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 }
  const instances = sampleGrassField(bounds)
  assert.ok(instances.length > 50, 'expected a non-trivial number of grass instances to check')
  for (const instance of instances) {
    const mask = groundMaskAt(instance.x, instance.z)
    // The jittered-grid sampler keeps a candidate when densityAt(x,z) beats
    // an independent per-cell threshold draw in [0,1) — so a kept instance
    // only proves mask > 0, not mask > GRASS_COVERAGE_TARGET. The
    // structural guarantee under test is that nothing lands on pure-zero
    // (fully-dirt) ground.
    assert.ok(mask > 0, `grass instance at (${instance.x},${instance.z}) has zero ground mask`)
  }
})

test('04-02: forest bands classify by the same radii the field exports', () => {
  assert.equal(treeBandForRadius(0), 'near')
  assert.equal(treeBandForRadius(TREE_BAND_RADII.near), 'near')
  assert.equal(treeBandForRadius(TREE_BAND_RADII.near + 0.01), 'mid')
  assert.equal(treeBandForRadius(TREE_BAND_RADII.mid), 'mid')
  assert.equal(treeBandForRadius(TREE_BAND_RADII.far), 'far')
  assert.equal(treeBandForRadius(TREE_BAND_RADII.far + 0.01), null)
})

test('04-03: aerodrome keep-out contains the full runway footprint', () => {
  assert.ok(AERODROME_KEEP_OUT.minX <= -RUNWAY_WIDTH / 2)
  assert.ok(AERODROME_KEEP_OUT.maxX >= RUNWAY_WIDTH / 2)
  assert.ok(AERODROME_KEEP_OUT.minZ <= -RUNWAY_LENGTH / 2)
  assert.ok(AERODROME_KEEP_OUT.maxZ >= RUNWAY_LENGTH / 2)
  // corners, not just the centreline
  for (const x of [-RUNWAY_WIDTH / 2, RUNWAY_WIDTH / 2]) {
    for (const z of [-RUNWAY_LENGTH / 2, RUNWAY_LENGTH / 2]) {
      assert.ok(isInsideAerodromeKeepOut(x, z), `runway corner (${x},${z}) must be inside the keep-out`)
    }
  }
})

test('04-03: aerodrome keep-out contains the apron and every hangar', () => {
  const [apronX, , apronZ] = APRON.position
  const [apronWidth, apronDepth] = APRON.size
  for (const [dx, dz] of [
    [-apronWidth / 2, -apronDepth / 2],
    [apronWidth / 2, apronDepth / 2],
  ]) {
    assert.ok(isInsideAerodromeKeepOut(apronX + dx, apronZ + dz), 'apron corner must be inside the keep-out')
  }

  for (const hangar of HANGARS) {
    const [width, , depth] = hangar.size
    const [x, , z] = hangar.position
    for (const [dx, dz] of [
      [-width / 2, -depth / 2],
      [width / 2, depth / 2],
    ]) {
      assert.ok(isInsideAerodromeKeepOut(x + dx, z + dz), `hangar at (${x},${z}) corner must be inside the keep-out`)
    }
  }

  const [towerX, , towerZ] = CONTROL_TOWER_POSITION
  assert.ok(isInsideAerodromeKeepOut(towerX + CONTROL_TOWER_ROOF_RADIUS, towerZ))
  assert.ok(isInsideAerodromeKeepOut(towerX - CONTROL_TOWER_ROOF_RADIUS, towerZ))
})

test('04-03: no grass or forest instance falls inside the aerodrome keep-out when it is passed as the exclusion', () => {
  // Bounds deliberately straddle the keep-out on every side so the
  // exclusion actually has candidates to reject, not just an empty area.
  const bounds = {
    minX: AERODROME_KEEP_OUT.minX - 40,
    maxX: AERODROME_KEEP_OUT.maxX + 40,
    minZ: AERODROME_KEEP_OUT.minZ - 40,
    maxZ: AERODROME_KEEP_OUT.maxZ + 40,
  }
  const grass = sampleGrassField(bounds, isInsideAerodromeKeepOut)
  for (const instance of grass) {
    assert.ok(!isInsideAerodromeKeepOut(instance.x, instance.z), `grass instance at (${instance.x},${instance.z}) is inside the keep-out`)
  }

  const forestNear = sampleForestField('near', bounds, isInsideAerodromeKeepOut)
  for (const instance of forestNear) {
    assert.ok(!isInsideAerodromeKeepOut(instance.x, instance.z), `tree instance at (${instance.x},${instance.z}) is inside the keep-out`)
  }
})

test('04-03/G1: keepOutFlattenFactor is exactly 0 inside the keep-out and reaches 1 well outside it', () => {
  assert.equal(keepOutFlattenFactor(0, 0), 0, 'runway centre must be fully flattened')
  assert.equal(keepOutFlattenFactor(AERODROME_KEEP_OUT.minX, AERODROME_KEEP_OUT.minZ), 0)
  assert.equal(keepOutFlattenFactor(AERODROME_KEEP_OUT.maxX + 1000, AERODROME_KEEP_OUT.maxZ + 1000), 1)
})
