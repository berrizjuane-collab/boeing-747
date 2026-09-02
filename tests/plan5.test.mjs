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

// All ssrLoadModule calls bunched before any test() registration — see the
// note in tests/plan4-fase-g.test.mjs.
const { createConiferGeometry, createBroadleafGeometry, createShrubGeometry, foliageNormalStats, triangleCount } =
  await server.ssrLoadModule('/src/lib/treeGeometry.ts')
const { placeForestBand, placeShrubs, HERO_ANCHOR } = await server.ssrLoadModule('/src/lib/forestPlacement.ts')
const { placeGrass, paintedGrassMaskAt } = await server.ssrLoadModule('/src/lib/grassPlacement.ts')
const { createGrassClumpGeometry } = await server.ssrLoadModule('/src/lib/grassGeometry.ts')
const { isInsideHeroSightline, HERO_SIGHTLINE } = await server.ssrLoadModule('/src/lib/heroSightline.ts')
const { isInsideAerodromeKeepOut, AERODROME_KEEP_OUT } = await server.ssrLoadModule('/src/lib/aerodromeKeepOut.ts')
const { hillHeightAt, createHillRingGeometry, HILL_INNER_RADIUS, HILL_MAX_HEIGHT } = await server.ssrLoadModule('/src/lib/hillsField.ts')
const { airportFootprints, createAirportMarkingsGeometry, airfieldLights, TERMINAL, HANGARS, CONTROL_TOWER_POSITION } =
  await server.ssrLoadModule('/src/lib/airportLayout.ts')
const { createRunwaySurfaceMaps, createConcreteSurfaceMaps, createGlazingMaps } = await server.ssrLoadModule('/src/lib/airportSurfaceMaps.ts')
const { createInteriorTextureKit } = await server.ssrLoadModule('/src/lib/interiorMaterials.ts')
const { createSkyDomeMaterial } = await server.ssrLoadModule('/src/lib/skyDomeMaterial.ts')
const { canopyMistColor, updateCanopyMistColor } = await server.ssrLoadModule('/src/lib/canopyMist.ts')
const { KEYFRAMES } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { Color, DataTexture } = await import('three')

function distinctColors(texture, quantise = 8) {
  const seen = new Set()
  const { data } = texture.image
  for (let offset = 0; offset < data.length; offset += 4) {
    seen.add(`${data[offset] >> quantise}-${data[offset + 1] >> quantise}-${data[offset + 2] >> quantise}`)
  }
  return seen.size
}

test('H1: conifer fronds carry a real sky-facing normal share at every level of detail (n.y ≥ 0.3 everywhere, mean ≥ 0.35 near)', () => {
  for (const lod of ['near', 'mid', 'far']) {
    const stats = foliageNormalStats(createConiferGeometry(lod))
    assert.ok(stats.foliageVertexCount > 0, `${lod}: has foliage vertices`)
    assert.ok(stats.minFoliageNormalY >= 0.29, `${lod}: min foliage n.y ${stats.minFoliageNormalY} must be ≥ 0.29 (was exactly 0 on the old crossed triangles)`)
  }
  const near = foliageNormalStats(createConiferGeometry('near'))
  assert.ok(near.meanFoliageNormalY >= 0.35, `near mean foliage n.y ${near.meanFoliageNormalY} must be ≥ 0.35`)
})

test('H1: tree geometry stays inside the declared per-instance triangle budget', () => {
  assert.ok(triangleCount(createConiferGeometry('near')) <= 40)
  assert.ok(triangleCount(createConiferGeometry('mid')) <= 24)
  assert.ok(triangleCount(createConiferGeometry('far')) <= 6)
  assert.ok(triangleCount(createBroadleafGeometry()) <= 170)
  assert.ok(triangleCount(createShrubGeometry()) <= 70)
})

test('H2: forest placement is deterministic, clustered (non-uniform) and never inside the keep-out or the hero sightline', () => {
  for (const band of ['near', 'mid', 'far']) {
    const a = placeForestBand(band)
    const b = placeForestBand(band)
    assert.deepEqual(a, b, `${band} band must be byte-identical between calls`)
    assert.ok(a.length > 200, `${band}: expected a real forest, got ${a.length} trees`)
    for (const tree of a) {
      assert.ok(!isInsideAerodromeKeepOut(tree.x, tree.z), `${band} tree at (${tree.x},${tree.z}) is inside the aerodrome keep-out`)
      assert.ok(!isInsideHeroSightline(tree.x, tree.z), `${band} tree at (${tree.x},${tree.z}) is inside the hero sightline`)
    }
    // Sorted nearest-to-hero first so a tier's `count` prefix keeps the trees that matter.
    for (let index = 1; index < a.length; index += 1) assert.ok(a[index].distanceToHero >= a[index - 1].distanceToHero)
  }

  // Non-uniformity: nearest-neighbour distance variance vs. a uniform
  // Poisson process of the same density (whose NN distances are tightly
  // Rayleigh-distributed). Clustered fields have a fatter spread.
  const trees = placeForestBand('mid')
  const cell = 40
  const buckets = new Map()
  // Every plantable cell of the mid annulus starts at 0 — leaving empty
  // cells out of the tally would hide exactly the clearings being measured.
  for (let cx = -900; cx < 900; cx += cell) {
    for (let cz = -900; cz < 900; cz += cell) {
      const x = cx + cell / 2
      const z = cz + cell / 2
      const radius = Math.hypot(x, z)
      if (radius < 400 + cell || radius > 900 - cell) continue
      if (isInsideAerodromeKeepOut(x, z) || isInsideHeroSightline(x, z)) continue
      buckets.set(`${Math.floor(x / cell)}:${Math.floor(z / cell)}`, 0)
    }
  }
  for (const tree of trees) {
    const key = `${Math.floor(tree.x / cell)}:${Math.floor(tree.z / cell)}`
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1)
  }
  const counts = [...buckets.values()]
  const mean = counts.reduce((sum, value) => sum + value, 0) / counts.length
  const variance = counts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / counts.length
  // A uniform Poisson field has variance ≈ mean (index of dispersion 1); the
  // clustered field must be over-dispersed by a clear margin.
  assert.ok(variance / mean > 1.6, `mid band index of dispersion ${(variance / mean).toFixed(2)} must exceed 1.6 (uniform ≈ 1)`)
})

test('H5: the hero sightline box covers the S1/S2 camera positions and the aircraft at rest', () => {
  for (const keyframe of KEYFRAMES.filter((k) => k.sectionIndex <= 1)) {
    const [x, , z] = keyframe.camPos
    assert.ok(isInsideHeroSightline(x, z), `S1/S2 camera at (${x},${z}) must be inside the sightline box`)
  }
  assert.ok(isInsideHeroSightline(0, -35) && isInsideHeroSightline(0, 38), 'nose and tail at RUNWAY_POSE are inside')
  assert.ok(HERO_SIGHTLINE.maxX > HERO_ANCHOR.x)
  const shrubs = placeShrubs()
  for (const shrub of shrubs) assert.ok(!isInsideHeroSightline(shrub.x, shrub.z) && !isInsideAerodromeKeepOut(shrub.x, shrub.z))
})

test('H3: grass clumps have n.y > 0 on every vertex and only land where the painted terrain mask is green', () => {
  const geometry = createGrassClumpGeometry()
  const normal = geometry.getAttribute('normal')
  const height = geometry.getAttribute('aHeight')
  assert.ok(normal.count > 0)
  for (let index = 0; index < normal.count; index += 1) {
    assert.ok(normal.getY(index) > 0.5, `grass vertex ${index} n.y ${normal.getY(index)} must be > 0.5`)
    assert.ok(height.getX(index) >= 0 && height.getX(index) <= 1)
  }
  const clumps = placeGrass()
  assert.deepEqual(clumps, placeGrass(), 'grass placement must be deterministic')
  assert.ok(clumps.length > 2000, `expected thousands of clumps, got ${clumps.length}`)
  for (const clump of clumps) {
    assert.ok(paintedGrassMaskAt(clump.x, clump.z) > 0.05, `clump at (${clump.x},${clump.z}) stands on bare painted dirt`)
    assert.ok(!isInsideAerodromeKeepOut(clump.x, clump.z))
  }
  for (let index = 1; index < clumps.length; index += 1) assert.ok(clumps[index].distanceToHero >= clumps[index - 1].distanceToHero)
})

test('Hills: zero inside the aerodrome basin, bounded, and the ring geometry is finite with a jagged crest', () => {
  for (const [x, z] of [[0, 0], [300, 200], [-400, 100], [HILL_INNER_RADIUS - 1, 0]]) {
    assert.equal(hillHeightAt(x, z), 0, `hill height at (${x},${z}) must be 0 inside the basin`)
  }
  let max = 0
  let min = Number.POSITIVE_INFINITY
  const crest = []
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    const h = hillHeightAt(Math.cos(angle) * 900, Math.sin(angle) * 900)
    crest.push(h)
    max = Math.max(max, h)
    min = Math.min(min, h)
  }
  assert.ok(max <= HILL_MAX_HEIGHT + 1e-9 && max > 20, `crest peaks ${max} must be real hills`)
  assert.ok(max - min > 20, 'the crest line must rise and fall, not sit at one height')
  const geometry = createHillRingGeometry()
  const position = geometry.getAttribute('position')
  for (let index = 0; index < position.count; index += 1) assert.ok(Number.isFinite(position.getY(index)))
  assert.equal(geometry.getAttribute('aFoliage').count, position.count)
})

test('D: every airport footprint is inside the keep-out, markings are flat, airfield lights are on the ground plan', () => {
  for (const rect of airportFootprints()) {
    for (const [x, z] of [[rect.minX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ], [rect.maxX, rect.minZ]]) {
      assert.ok(isInsideAerodromeKeepOut(x, z), `footprint corner (${x},${z}) must be inside the keep-out`)
    }
  }
  assert.ok(isInsideAerodromeKeepOut(TERMINAL.position[0], TERMINAL.position[2]))
  assert.ok(isInsideAerodromeKeepOut(CONTROL_TOWER_POSITION[0], CONTROL_TOWER_POSITION[2]))
  for (const hangar of HANGARS) assert.ok(isInsideAerodromeKeepOut(hangar.position[0], hangar.position[2]))
  assert.ok(AERODROME_KEEP_OUT.minX < TERMINAL.position[0] - TERMINAL.size[0] / 2)

  const markings = createAirportMarkingsGeometry()
  const positions = markings.getAttribute('position')
  const normals = markings.getAttribute('normal')
  let y = null
  for (let index = 0; index < positions.count; index += 1) {
    if (y === null) y = positions.getY(index)
    assert.ok(Math.abs(positions.getY(index) - y) <= 1e-9, 'all marking vertices share one height')
    assert.equal(normals.getY(index), 1)
  }
  const lights = airfieldLights()
  assert.ok(lights.length > 40)
  for (const light of lights) assert.ok(isInsideAerodromeKeepOut(light.x, light.z))
})

test('D3/G2-mirror: procedural airport and cabin maps are deterministic, non-uniform and tile where they must', () => {
  const runwayA = createRunwaySurfaceMaps(64, 256)
  const runwayB = createRunwaySurfaceMaps(64, 256)
  assert.deepEqual(Array.from(runwayA.albedo.image.data), Array.from(runwayB.albedo.image.data))
  assert.ok(distinctColors(runwayA.albedo, 2) >= 8, 'runway asphalt must not be one flat colour')

  const concrete = createConcreteSurfaceMaps(64, 2)
  const { data, width } = concrete.albedo.image
  // Tileability: a slab joint sits on the tile edge by construction, so the
  // wrap-around column step must look like the interior joint's step (at
  // x = 31 → 32), not like a torn noise seam on top of it.
  let seamJump = 0
  let jointJump = 0
  for (let row = 0; row < width; row += 1) {
    const left = row * width * 4
    const right = (row * width + width - 1) * 4
    const beforeJoint = (row * width + width / 2 - 1) * 4
    const atJoint = (row * width + width / 2) * 4
    seamJump += Math.abs(data[left] - data[right])
    jointJump += Math.abs(data[atJoint] - data[beforeJoint])
  }
  assert.ok(Math.abs(seamJump - jointJump) <= Math.max(seamJump, jointJump) * 0.35 + width * 3, `concrete seam jump ${seamJump} vs interior joint ${jointJump}`)

  const glazing = createGlazingMaps(64, 4, 2, 0.5)
  assert.ok(distinctColors(glazing.emissive, 5) >= 3, 'glazing emissive must have lit and unlit panes')

  const kit = createInteriorTextureKit()
  for (const texture of [kit.cockpitAtlas, kit.ife, kit.windowView, kit.carpetAisle.albedo, kit.fabric.albedo]) {
    assert.ok(texture instanceof DataTexture)
    assert.ok(distinctColors(texture, 5) >= 6, 'cabin content maps must carry real content')
  }
  kit.dispose()
})

test('I1: both sky domes share one haze-band shader bound to the canopy mist uniform', () => {
  const material = createSkyDomeMaterial({}, {})
  assert.ok(material.uniforms.mistColor === canopyMistColor, 'default dome binds the shared canopy mist by reference')
  assert.ok(material.fragmentShader.includes('hazeFalloff') && material.fragmentShader.includes('mistColor'))
  const own = { value: new Color('#000000') }
  const sunset = createSkyDomeMaterial({}, {}, { mistColor: own, hazeFalloff: 16, hazeStrength: 0.9 })
  assert.equal(sunset.uniforms.mistColor, own)
  assert.equal(sunset.uniforms.hazeFalloff.value, 16)

  // The mist is warmer and brighter than the background it derives from (plan4.md §3.1 property 5).
  const background = new Color('#9f6246')
  const mist = updateCanopyMistColor(background)
  const hslBackground = {}
  const hslMist = {}
  background.getHSL(hslBackground)
  mist.getHSL(hslMist)
  assert.ok(hslMist.l > hslBackground.l + 0.15, 'mist must be brighter than the background')
})
