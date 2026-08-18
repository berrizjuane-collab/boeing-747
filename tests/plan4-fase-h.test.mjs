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

const { createNearConiferGeometry, createMidConiferGeometry, createFarConiferGeometry } =
  await server.ssrLoadModule('/src/lib/coniferGeometry.ts')
const { createGrassClumpGeometry, GRASS_CUTOFF_RADIUS } = await server.ssrLoadModule('/src/lib/grassGeometry.ts')
const { sampleForestBand } = await server.ssrLoadModule('/src/lib/forestPlacement.ts')
const { sampleGrassInstances } = await server.ssrLoadModule('/src/lib/grassPlacement.ts')
const { isWithinCameraStandoff, isWithinAircraftSightline, CAMERA_STANDOFF_RADIUS } = await server.ssrLoadModule(
  '/src/lib/forestCameraStandoff.ts',
)
const { computeCanopyMistColor } = await server.ssrLoadModule('/src/lib/canopyMist.ts')
const { createCanopyMistMaterial, applyCanopyMistFogPatch } = await server.ssrLoadModule('/src/lib/canopyMistMaterial.ts')
const { createGrassMaterial } = await server.ssrLoadModule('/src/lib/grassMaterial.ts')
const { groundMaskAt, TREE_BAND_RADII, FOREST_DENSITY_CELL_SIZE } = await server.ssrLoadModule('/src/lib/terrainField.ts')
const { isInsideAerodromeKeepOut } = await server.ssrLoadModule('/src/lib/aerodromeKeepOut.ts')
const { seededRandom } = await server.ssrLoadModule('/src/lib/seededRandom.ts')
const { KEYFRAMES } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { Color } = await import('three')

function frondNormalStats(geometry, frondVertexStart) {
  const normal = geometry.getAttribute('normal')
  let min = Infinity
  let sum = 0
  let count = 0
  for (let index = frondVertexStart; index < normal.count; index += 1) {
    const ny = normal.getY(index)
    min = Math.min(min, ny)
    sum += ny
    count += 1
  }
  return { min, mean: sum / count, count }
}

// ---- H1: near conifer ----

test('H1: near conifer is trunk + 3 stacked cones, ~36 triangles, one merged geometry', () => {
  const { geometry, triangleCount } = createNearConiferGeometry()
  assert.equal(triangleCount, 36)
  assert.equal(geometry.getIndex().count / 3, 36)
})

test('H1: near conifer frond normals clear the plan4.md floor — n.y >= 0.3 everywhere, mean >= 0.35', () => {
  const { geometry, frondVertexStart } = createNearConiferGeometry()
  assert.ok(frondVertexStart > 0, 'near conifer must have trunk vertices preceding the frond')
  const stats = frondNormalStats(geometry, frondVertexStart)
  assert.ok(stats.count > 0)
  assert.ok(stats.min >= 0.3, `frond n.y minimum ${stats.min} must be >= 0.3`)
  assert.ok(stats.mean >= 0.35, `frond n.y mean ${stats.mean} must be >= 0.35`)
})

test('H1: near conifer trunk normals are near-horizontal (n.y ~ 0), outside the frond contract', () => {
  const { geometry, frondVertexStart } = createNearConiferGeometry()
  const normal = geometry.getAttribute('normal')
  for (let index = 0; index < frondVertexStart; index += 1) {
    assert.ok(Math.abs(normal.getY(index)) < 1e-6, `trunk vertex ${index} should be ~horizontal, got n.y=${normal.getY(index)}`)
    const horizontalLength = Math.hypot(normal.getX(index), normal.getZ(index))
    assert.ok(Math.abs(horizontalLength - 1) < 1e-6, `trunk vertex ${index} should be unit-horizontal, got ${horizontalLength}`)
  }
})

test('H1/H2: mid and far conifers have no trunk (frondVertexStart 0) and their own declared triangle counts', () => {
  const mid = createMidConiferGeometry()
  const far = createFarConiferGeometry()
  assert.equal(mid.frondVertexStart, 0)
  assert.equal(far.frondVertexStart, 0)
  assert.equal(mid.triangleCount, 12)
  assert.equal(far.triangleCount, 5)
  // Coarser segment counts still clear a real (if lower) floor — same
  // r/h=0.44 ratio as the near band, just fewer segments discretising it.
  assert.ok(frondNormalStats(mid.geometry, 0).min >= 0.3)
  assert.ok(frondNormalStats(far.geometry, 0).min >= 0.3)
})

test('H1: conifer geometries are deterministic — two calls are byte-identical', () => {
  const a = createNearConiferGeometry()
  const b = createNearConiferGeometry()
  assert.deepEqual(Array.from(a.geometry.getAttribute('position').array), Array.from(b.geometry.getAttribute('position').array))
  assert.deepEqual(Array.from(a.geometry.getAttribute('normal').array), Array.from(b.geometry.getAttribute('normal').array))
})

// ---- forestCameraStandoff ----

test('forestCameraStandoff: S1/S2 camera keyframes measurably closer to the keep-out edge than plan4.md §3.8 claimed — standoff exists to cover that gap', () => {
  const s1s2Keyframes = KEYFRAMES.filter((keyframe) => keyframe.sectionIndex <= 1)
  assert.ok(s1s2Keyframes.length > 0)
  for (const keyframe of s1s2Keyframes) {
    const [x, , z] = keyframe.camPos
    assert.ok(isWithinCameraStandoff(x, z), `camera keyframe (${x},${z}) must be inside its own standoff radius`)
  }
  // A point safely beyond every keyframe's radius must not be excluded.
  assert.ok(!isWithinCameraStandoff(1000, 1000))
  assert.ok(CAMERA_STANDOFF_RADIUS > 0)
})

// ---- H2: forest bands, clustering, budget ----

test('H2: near/mid/far forest bands only contain instances inside their own annulus and outside the near-band exclusions', () => {
  for (const [band, innerRadius, outerRadius] of [
    ['near', 0, TREE_BAND_RADII.near],
    ['mid', TREE_BAND_RADII.near, TREE_BAND_RADII.mid],
    ['far', TREE_BAND_RADII.mid, TREE_BAND_RADII.far],
  ]) {
    const instances = sampleForestBand(band)
    assert.ok(instances.length > 0, `expected ${band} band to place at least one tree`)
    for (const instance of instances) {
      const radius = Math.hypot(instance.x, instance.z)
      assert.ok(radius > innerRadius && radius <= outerRadius + 1e-6, `${band} instance at radius ${radius} escaped its band`)
      assert.ok(!isInsideAerodromeKeepOut(instance.x, instance.z), `${band} instance at (${instance.x},${instance.z}) is inside the keep-out`)
      if (band === 'near') {
        assert.ok(!isWithinCameraStandoff(instance.x, instance.z), `near instance at (${instance.x},${instance.z}) is inside the camera standoff`)
        for (const height of [1, 5, 9]) {
          assert.ok(
            !isWithinAircraftSightline(instance.x, instance.z, height),
            `near instance at (${instance.x},${instance.z}) height ${height} is inside the aircraft's on-screen rectangle (H5)`,
          )
        }
      }
    }
  }
})

// H5 regression: a real captured 01-hero.png (progress4.md H5 evidence)
// showed a near-band conifer standing in front of the wing/engine nacelle
// at approximately this position — the near-band exclusion above should
// never let anything spawn here again. See forestCameraStandoff.ts's
// module comment for why two earlier depth-aware versions of this check
// both missed it.
test('H5: the aircraft on-screen rectangle actually excludes the specific position that once occluded the wing', () => {
  assert.ok(isWithinAircraftSightline(30, 8, 5), 'position that previously occluded the wing must read as within the aircraft sightline')
})

test('H5: a point well outside the aircraft on-screen rectangle is NOT excluded (the check is not just camera-standoff again)', () => {
  assert.ok(!isWithinAircraftSightline(300, 300, 5))
})

test('H2: forest sampling is deterministic — two calls over the same band are identical', () => {
  const a = sampleForestBand('mid')
  const b = sampleForestBand('mid')
  assert.deepEqual(a, b)
})

// Index of Dispersion / variance-to-mean ratio (VMR) of counts-per-quadrat —
// the standard spatial-statistics clustering test: VMR ~= 1 for a uniform
// Poisson process, VMR > 1 for an overdispersed/clustered one (some
// quadrats empty, some crowded), VMR < 1 for an evenly-spaced one.
//
// A first attempt at this test used nearest-neighbor distance variance
// instead (closer to plan4.md H2's literal wording, "la varianza de la
// distancia al vecino más cercano"), and it failed in the *opposite*
// direction the criterion expects: measured clustered-band variance was
// ~15x *lower* than a same-density Poisson draw, not higher. Root cause,
// confirmed by testing both metrics side by side: sampleJitteredGrid
// (terrainField.ts) places at most one candidate per grid cell (near band
// cellSize=9, mid=16) before density-thinning — that alone makes the
// *fine*-scale spacing among survivors more regular than Poisson (no two
// points ever land closer than roughly one cell width apart), which
// dominates a pairwise nearest-neighbor metric regardless of any coarser
// clustering layered on top. The patch-scale clustering plan4.md §3.1
// actually wants comes from forestDensityAt's own correlation length
// (FOREST_DENSITY_CELL_SIZE=130) — invisible to nearest-neighbor pairs, but
// exactly what a quadrat sized to that same 130u shows: real, positive,
// reproducible overdispersion vs. a same-density Poisson process.
function quadratVarianceToMeanRatio(points, quadratSize, extent) {
  const counts = new Map()
  for (const point of points) {
    const column = Math.floor((point.x + extent) / quadratSize)
    const row = Math.floor((point.z + extent) / quadratSize)
    const key = `${column}:${row}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  // Quadrats with zero survivors are the whole point (a "hueco de suelo
  // desnudo entre grupos") and must be counted, not omitted.
  const totalQuadrats = Math.ceil((2 * extent) / quadratSize) ** 2
  const allCounts = Array.from(counts.values())
  while (allCounts.length < totalQuadrats) allCounts.push(0)
  const mean = allCounts.reduce((sum, value) => sum + value, 0) / allCounts.length
  const variance = allCounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / allCounts.length
  return variance / mean
}

test('H2: mid-band forest distribution is measurably non-uniform — quadrat variance-to-mean ratio exceeds a same-density Poisson process', () => {
  const forestInstances = sampleForestBand('mid')
  const minR = TREE_BAND_RADII.near
  const maxR = TREE_BAND_RADII.mid

  const random = seededRandom(0x9002de)
  const poissonPoints = []
  while (poissonPoints.length < forestInstances.length) {
    const x = (random() * 2 - 1) * maxR
    const z = (random() * 2 - 1) * maxR
    const radius = Math.hypot(x, z)
    if (radius > minR && radius <= maxR) poissonPoints.push({ x, z })
  }

  const clusteredVmr = quadratVarianceToMeanRatio(forestInstances, FOREST_DENSITY_CELL_SIZE, maxR)
  const poissonVmr = quadratVarianceToMeanRatio(poissonPoints, FOREST_DENSITY_CELL_SIZE, maxR)

  assert.ok(clusteredVmr > 1, `clustered VMR ${clusteredVmr} should itself be > 1 (overdispersed)`)
  assert.ok(
    clusteredVmr > poissonVmr * 1.05,
    `clustered VMR ${clusteredVmr} should exceed the same-density Poisson VMR ${poissonVmr} by a real margin`,
  )
})

// ---- H3: grass ----

test('H3: grass blade normals are explicitly bent toward +Y (n.y > 0 everywhere), unlike computeVertexNormals() on a vertical triangle', () => {
  const geometry = createGrassClumpGeometry()
  const normal = geometry.getAttribute('normal')
  assert.ok(normal.count > 0)
  for (let index = 0; index < normal.count; index += 1) {
    assert.ok(normal.getY(index) > 0, `grass vertex ${index} has n.y=${normal.getY(index)}, expected > 0`)
    const length = Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))
    assert.ok(Math.abs(length - 1) < 1e-5, `grass normal ${index} should be unit length, got ${length}`)
  }
})

test('H3: every placed grass instance is within the declared cutoff radius and lands on grass-positive ground', () => {
  const instances = sampleGrassInstances()
  assert.ok(instances.length > 0, 'expected at least one grass instance within the cutoff radius')
  for (const instance of instances) {
    assert.ok(Math.hypot(instance.x, instance.z) <= GRASS_CUTOFF_RADIUS + 1e-6)
    assert.ok(groundMaskAt(instance.x, instance.z) > 0, `grass at (${instance.x},${instance.z}) has zero ground mask`)
    assert.ok(!isInsideAerodromeKeepOut(instance.x, instance.z), `grass at (${instance.x},${instance.z}) is inside the keep-out`)
  }
})

test('H3: grass placement is deterministic — two calls are identical', () => {
  assert.deepEqual(sampleGrassInstances(), sampleGrassInstances())
})

test('H3: grass material patches wind sway into the vertex shader and canopy mist into the fragment shader (bug #19: no residual emissive uniform)', () => {
  const { material, canopyMistColor, windTime } = createGrassMaterial()
  // Every MeshStandardMaterial carries an `emissive` Color field (default
  // black) whether or not the constructor params mention one — bug #19 is
  // about not *setting* it to a non-black tint (RunwayEnvironment.tsx's old
  // grass material passed emissive="#314431" emissiveIntensity={0.42}),
  // not about the property being absent.
  assert.equal(material.emissive.getHex(), 0, 'grass material must not carry a non-black emissive tint (bug #19)')
  assert.equal(material.emissiveIntensity, 1, 'default emissiveIntensity, not the old 0.42 override')
  const fakeShader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n#include <fog_fragment>\n}',
  }
  material.onBeforeCompile(fakeShader, {})
  assert.equal(fakeShader.uniforms.windTime, windTime)
  assert.equal(fakeShader.uniforms.canopyMistColor, canopyMistColor)
  assert.match(fakeShader.vertexShader, /USE_INSTANCING/)
  assert.match(fakeShader.vertexShader, /windTime/)
  assert.match(fakeShader.vertexShader, /transformed\.x \+=/)
  assert.match(fakeShader.fragmentShader, /canopyMistColor/)
  assert.match(fakeShader.fragmentShader, /terrainFogFactor/)
})

// ---- canopyMist / canopyMistMaterial shared plumbing ----

test('canopyMist: computeCanopyMistColor matches the exact G4 formula TerrainGround.tsx used inline before this extraction', () => {
  const background = new Color('#9f6246')
  const target = new Color()
  computeCanopyMistColor(background, target)
  const hsl = { h: 0, s: 0, l: 0 }
  background.getHSL(hsl)
  const expected = new Color().setHSL((hsl.h + 0.02) % 1, Math.max(hsl.s, 0.4), Math.min(1, hsl.l + 0.22))
  assert.ok(Math.abs(target.r - expected.r) < 1e-9)
  assert.ok(Math.abs(target.g - expected.g) < 1e-9)
  assert.ok(Math.abs(target.b - expected.b) < 1e-9)
})

test('canopyMistMaterial: createCanopyMistMaterial and applyCanopyMistFogPatch produce the same fragment patch, with distinct cache keys per caller', () => {
  const forest = createCanopyMistMaterial('forest', { vertexColors: true })
  const grass = createCanopyMistMaterial('grass', { vertexColors: true })
  assert.notEqual(forest.material.customProgramCacheKey(), grass.material.customProgramCacheKey())

  const shader = { uniforms: {}, fragmentShader: '#include <common>\n#include <fog_fragment>' }
  applyCanopyMistFogPatch(shader, forest.canopyMistColor)
  assert.equal(shader.uniforms.canopyMistColor, forest.canopyMistColor)
  assert.match(shader.fragmentShader, /canopyMistColor/)
})
