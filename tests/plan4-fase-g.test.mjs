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

const { createTerrainDiscGeometry, updateTerrainDiscForCenter, TERRAIN_DISC_SIZE, TERRAIN_TEXTURE_TILE_SIZE } =
  await server.ssrLoadModule('/src/lib/terrainGeometry.ts')
const { AERODROME_KEEP_OUT, isInsideAerodromeKeepOut } = await server.ssrLoadModule('/src/lib/aerodromeKeepOut.ts')
// All ssrLoadModule calls stay bunched here, before any test() registration
// — node:test's `after()` hook fired (and closed the vite server) between
// two top-level awaits once, when this import was interleaved between the
// G1 and G2 test() blocks instead ("Vite module runner has been closed").
const { createTerrainSurfaceMaps, TERRAIN_SURFACE_MAP_SIZE } = await server.ssrLoadModule('/src/lib/terrainSurfaceMaps.ts')
const { undercastOpacity, aerodromeDetailVisible, UNDERCAST_FADE_END } =
  await server.ssrLoadModule('/src/lib/worldPersistence.ts')
const { groundTintMix, applyGroundTint, GROUND_TINT_RAMP_START, GROUND_TINT_RAMP_END } =
  await server.ssrLoadModule('/src/lib/terrainGroundCurves.ts')
const { Color } = await import('three')

// BufferAttribute stores its values in a Float32Array (GPU-consumable, same
// as every other geometry in this codebase — e.g. runwayGeometry.ts's
// Float32BufferAttribute). Comparing a value read back from one against a
// fresh float64 computation with exact equality fails on rounding alone
// (float32 has ~7 significant decimal digits); this tolerance matches that
// precision rather than the CPU math's own.
const FLOAT32_EPSILON = 1e-4
function assertCloseFloat32(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= FLOAT32_EPSILON, `${message}: expected ${expected}, got ${actual}`)
}

test('G1: every vertex inside the aerodrome keep-out is exactly flat (y === 0), mirroring B4 for the runway markings', () => {
  const geometry = createTerrainDiscGeometry()
  updateTerrainDiscForCenter(geometry, 0, 0)
  const position = geometry.getAttribute('position')

  let checkedInsideKeepOut = 0
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = position.getZ(index)
    if (!isInsideAerodromeKeepOut(x, z)) continue
    checkedInsideKeepOut += 1
    assert.equal(position.getY(index), 0, `vertex at (${x},${z}) inside the keep-out must be exactly flat`)
  }
  // The keep-out (§04-03) is well within the disc's ±1500 local extent at
  // this centre, so this must have actually exercised real vertices, not
  // vacuously passed over an empty set.
  assert.ok(checkedInsideKeepOut > 0, 'expected at least one geometry vertex to fall inside the keep-out at centre (0,0)')

  geometry.dispose()
})

test('G1: relief stays within its declared low amplitude outside the keep-out', () => {
  const geometry = createTerrainDiscGeometry()
  updateTerrainDiscForCenter(geometry, 0, 0)
  const position = geometry.getAttribute('position')

  let checkedOutside = 0
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index)
    const z = position.getZ(index)
    if (isInsideAerodromeKeepOut(x, z)) continue
    checkedOutside += 1
    assert.ok(Math.abs(position.getY(index)) <= 1.4 + FLOAT32_EPSILON, `relief at (${x},${z}) exceeds the declared amplitude: ${position.getY(index)}`)
  }
  assert.ok(checkedOutside > 0)
  geometry.dispose()
})

test('G1: recentring is deterministic — two identical rebuilds at the same centre produce byte-identical geometry', () => {
  const geometryA = createTerrainDiscGeometry()
  updateTerrainDiscForCenter(geometryA, 340, -820)
  const positionA = Array.from(geometryA.getAttribute('position').array)
  const uvA = Array.from(geometryA.getAttribute('uv').array)

  const geometryB = createTerrainDiscGeometry()
  updateTerrainDiscForCenter(geometryB, 340, -820)
  const positionB = Array.from(geometryB.getAttribute('position').array)
  const uvB = Array.from(geometryB.getAttribute('uv').array)

  assert.deepEqual(positionA, positionB)
  assert.deepEqual(uvA, uvB)
  geometryA.dispose()
  geometryB.dispose()
})

test('G1: world-space UV — every vertex maps to worldXZ / TERRAIN_TEXTURE_TILE_SIZE, regardless of where the disc is centred', () => {
  // The actual guarantee UV baking has to hold: a texel tiles by the
  // vertex's *world* position, not by its position in whichever local
  // lattice offset the disc happens to be centred at right now — otherwise
  // the ground texture would visibly slide as the disc follows the camera
  // (the same swimming bug the module comment documents for relief, but for
  // the visible texture instead). Checked directly per vertex, not via
  // "nearest vertex to an arbitrary target point" — different centrings
  // land the 31.25-unit local lattice at different, non-aligned world
  // offsets, so no single world point is generally hit exactly by more than
  // one centring's vertices; the per-vertex formula is what has to hold.
  for (const [centerX, centerZ] of [
    [0, 0],
    [200, 200],
    [-1340, 860],
  ]) {
    const geometry = createTerrainDiscGeometry()
    updateTerrainDiscForCenter(geometry, centerX, centerZ)
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    for (let index = 0; index < position.count; index += 8) {
      const worldX = centerX + position.getX(index)
      const worldZ = centerZ + position.getZ(index)
      assertCloseFloat32(uv.getX(index), worldX / TERRAIN_TEXTURE_TILE_SIZE, `centre (${centerX},${centerZ}) vertex ${index} U`)
      assertCloseFloat32(uv.getY(index), worldZ / TERRAIN_TEXTURE_TILE_SIZE, `centre (${centerX},${centerZ}) vertex ${index} V`)
    }
    geometry.dispose()
  }
})

test('G1: disc size clears the fog-transmittance table plan4.md §1.3 derives (edge always far past near-total fog)', () => {
  // Half the disc size is the worst-case distance from the camera to the
  // nearest point of the edge (camera sits at the exact centre right after
  // a recentre). §1.3's own table reads 0.988 transmittance at 1400u.
  assert.ok(TERRAIN_DISC_SIZE / 2 >= 1400)
})

test('G2: terrain surface maps are deterministic — two generations at the same size are byte-identical', () => {
  const mapsA = createTerrainSurfaceMaps(128)
  const mapsB = createTerrainSurfaceMaps(128)
  assert.deepEqual(Array.from(mapsA.albedo.image.data), Array.from(mapsB.albedo.image.data))
  assert.deepEqual(Array.from(mapsA.normal.image.data), Array.from(mapsB.normal.image.data))
  assert.deepEqual(Array.from(mapsA.roughness.image.data), Array.from(mapsB.roughness.image.data))
  mapsA.albedo.dispose()
  mapsA.normal.dispose()
  mapsA.roughness.dispose()
  mapsB.albedo.dispose()
  mapsB.normal.dispose()
  mapsB.roughness.dispose()
})

test('G2: terrain albedo is not a single flat colour (plan4.md — "el color del suelo deja de ser un valor único")', () => {
  const size = 128
  const maps = createTerrainSurfaceMaps(size)
  const albedoData = maps.albedo.image.data
  const distinctColors = new Set()
  for (let offset = 0; offset < albedoData.length; offset += 4) {
    distinctColors.add(`${albedoData[offset]}:${albedoData[offset + 1]}:${albedoData[offset + 2]}`)
  }
  // Old ground plane: exactly 1 colour, uniform across the whole surface.
  assert.ok(distinctColors.size >= 50, `expected substantial colour variety, got ${distinctColors.size} distinct RGB values`)

  // Both the terracotta (dirt) and olive (grass) families must actually be
  // present, not just noise dithering of a single hue — sample the R and G
  // channel spread as a coarse check that both palettes occur.
  let minRed = 255
  let maxRed = 0
  let minGreen = 255
  let maxGreen = 0
  for (let offset = 0; offset < albedoData.length; offset += 4) {
    minRed = Math.min(minRed, albedoData[offset])
    maxRed = Math.max(maxRed, albedoData[offset])
    minGreen = Math.min(minGreen, albedoData[offset + 1])
    maxGreen = Math.max(maxGreen, albedoData[offset + 1])
  }
  assert.ok(maxRed - minRed >= 40, `expected a wide red-channel spread across dirt/grass patches, got ${maxRed - minRed}`)
  assert.ok(maxGreen - minGreen >= 20, `expected a green-channel spread, got ${maxGreen - minGreen}`)

  maps.albedo.dispose()
  maps.normal.dispose()
  maps.roughness.dispose()
})

test('G2: terrain normal/roughness maps are non-uniform — mirrors C1 (aircraftSurfaceMaps.ts) for the terrain', () => {
  const size = 128
  const maps = createTerrainSurfaceMaps(size)
  const roughnessData = maps.roughness.image.data
  const normalData = maps.normal.image.data
  const roughnessValues = new Set()
  const normalValues = new Set()

  for (let offset = 0; offset < roughnessData.length; offset += 4) {
    roughnessValues.add(roughnessData[offset])
    normalValues.add(`${normalData[offset]}:${normalData[offset + 1]}:${normalData[offset + 2]}`)
  }

  assert.equal(maps.albedo.image.width, size)
  assert.equal(maps.normal.image.width, size)
  assert.equal(maps.roughness.image.width, size)
  assert.ok(roughnessValues.size >= 20, `expected >=20 roughness levels, received ${roughnessValues.size}`)
  assert.ok(normalValues.size >= 20, `expected >=20 normal vectors, received ${normalValues.size}`)
  assert.ok(maps.roughnessRange[1] - maps.roughnessRange[0] >= 0.2, `roughness range ${maps.roughnessRange}`)
  assert.equal(maps.albedo.colorSpace, 'srgb')

  maps.albedo.dispose()
  maps.normal.dispose()
  maps.roughness.dispose()
})

test('G2: terrain texture tiles seamlessly — the mask at u=0 matches the mask that RepeatWrapping would sample at u=1', () => {
  const size = 256
  const maps = createTerrainSurfaceMaps(size)
  const albedoData = maps.albedo.image.data
  // Column 0 must match column (size-1)'s *neighbour*, i.e. wrapping around:
  // RepeatWrapping samples column 0 immediately after column (size-1), so
  // consecutive texels across that seam should be no more different than
  // consecutive texels anywhere else in the (smoothly varying) field.
  let seamJump = 0
  let interiorJumpSum = 0
  let interiorJumpCount = 0
  for (let y = 0; y < size; y += 1) {
    const leftEdgeOffset = (y * size + 0) * 4
    const rightEdgeOffset = (y * size + (size - 1)) * 4
    seamJump += Math.abs(albedoData[leftEdgeOffset] - albedoData[rightEdgeOffset])
    const midOffset = (y * size + Math.floor(size / 2)) * 4
    const midNextOffset = (y * size + Math.floor(size / 2) + 1) * 4
    interiorJumpSum += Math.abs(albedoData[midOffset] - albedoData[midNextOffset])
    interiorJumpCount += 1
  }
  const meanSeamJump = seamJump / size
  const meanInteriorJump = interiorJumpSum / interiorJumpCount
  // The seam is allowed to be a *typical* step, not a discontinuity many
  // times larger than any interior step (which is what an unwrapped,
  // non-periodic noise field would produce here).
  assert.ok(meanSeamJump <= meanInteriorJump * 8 + 5, `seam jump ${meanSeamJump} looks like a real discontinuity vs interior ${meanInteriorJump}`)
  maps.albedo.dispose()
  maps.normal.dispose()
  maps.roughness.dispose()
})

test('G2: tier texture sizes match the budget declared in progress4.md 04-04', () => {
  assert.equal(TERRAIN_SURFACE_MAP_SIZE.high, 1024)
  assert.equal(TERRAIN_SURFACE_MAP_SIZE.mid, 1024)
  assert.equal(TERRAIN_SURFACE_MAP_SIZE.low, 512)
})

test('G3: ground tint mix is 0 through the hero and ramps smoothly to 1 by the end of S3', () => {
  assert.equal(groundTintMix(0), 0)
  assert.equal(groundTintMix(0.01), 0, 'hero (S1) must be fully texture-authored')
  assert.equal(groundTintMix(0.19), 0, 'S2 must still be fully texture-authored')
  assert.equal(groundTintMix(GROUND_TINT_RAMP_START), 0)
  assert.equal(groundTintMix(GROUND_TINT_RAMP_END), 1)
  assert.equal(groundTintMix(1), 1)

  // Monotonic across the ramp — no reversal that would read as a flicker.
  let previous = -1
  for (let p = GROUND_TINT_RAMP_START; p <= GROUND_TINT_RAMP_END; p += 0.01) {
    const value = groundTintMix(p)
    assert.ok(value >= previous - 1e-9, `tint mix must not decrease: ${previous} -> ${value} at ${p}`)
    previous = value
  }
})

test('G3: fully tinted ground reads near-black in S5/S7, not a lit green field — mirrors plan4.md §3.5\'s literal claim', () => {
  // theme.ground values SECTION_ENVIRONMENT actually declares for S5/S7
  // (environmentTheme.ts) — not re-picked, so this test breaks if that
  // table changes without this file being revisited.
  const s5Ground = new Color('#151311')
  const s7Ground = new Color('#090b0e')
  const white = new Color(1, 1, 1)

  const s5Result = applyGroundTint(new Color(), s5Ground, 0.6)
  const s7Result = applyGroundTint(new Color(), s7Ground, 0.97)

  assert.equal(groundTintMix(0.6), 1, 'S5 (0.60) must be past the ramp — fully tinted')
  assert.equal(groundTintMix(0.97), 1, 'S7 (0.97) must be past the ramp — fully tinted')

  const luma = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
  // "Near-black": darker than a 15% grey, not literally 0 (GROUND_TINT_GAIN
  // amplifies theme.ground rather than reproducing it exactly).
  assert.ok(luma(s5Result) < 0.15, `S5 tinted colour too bright: luma ${luma(s5Result)}`)
  assert.ok(luma(s7Result) < 0.15, `S7 tinted colour too bright: luma ${luma(s7Result)}`)
  // And it must actually be a *mix*, not still the untouched white default —
  // the regression this test exists to catch (bug-class: tint silently not
  // applied) would otherwise pass the luma check by coincidence.
  assert.ok(luma(white) - luma(s5Result) > 0.5, 'S5 result must be measurably darker than the untinted white base')
})

test('G3: the ground is hidden by an occluder, not by a scroll gate (supersedes the 30.5% fade)', () => {
  // Round 6 phase 4 (plan6 4.1, A13) removes `groundFade` outright. The
  // requirement that replaces it: the world is only ever culled while the
  // cloud deck above it is closed, and how closed that deck is depends on
  // how far the aircraft has actually climbed — not on a scroll number. The
  // consequence the old test recorded (the tint ramp outliving the mesh) no
  // longer applies, because the ramp now runs on ground that is still drawn.
  assert.equal(undercastOpacity(0), 0, 'the deck must be open with the aircraft on the runway')
  assert.ok(aerodromeDetailVisible(undercastOpacity(0)), 'the aerodrome is visible at rest')
  assert.equal(undercastOpacity(UNDERCAST_FADE_END), 1, 'the deck must close once the aircraft is above it')
  assert.ok(!aerodromeDetailVisible(1), 'a closed deck is what allows the aerodrome to be culled')

  // Monotone in altitude, so scrolling back down reopens it exactly as it closed.
  let previous = -1
  for (let sample = 0; sample <= 200; sample += 1) {
    const opacity = undercastOpacity((sample / 200) * (UNDERCAST_FADE_END + 6))
    assert.ok(opacity >= previous - 1e-9, 'the deck must not flicker as the aircraft climbs')
    previous = opacity
  }

  // The tint ramp is still authored past the old gate, and now has ground to act on.
  assert.ok(GROUND_TINT_RAMP_END > 0.305)
})
