import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { shouldDowngradeTier } = await server.ssrLoadModule('/src/lib/qualityAssessment.ts')
const { TIER_SETTINGS, useQualityStore } = await server.ssrLoadModule('/src/state/qualityStore.ts')
const {
  TERRAIN_SURFACE_MAP_SIZE,
  disposeTerrainSurfaceMapCache,
  getTerrainSurfaceMaps,
  hasCachedTerrainSurfaceMaps,
} = await server.ssrLoadModule('/src/lib/terrainSurfaceMaps.ts')

test('7.2: terrain cache keys use texture parameters, not tier labels', async () => {
  assert.equal(TERRAIN_SURFACE_MAP_SIZE.high, TERRAIN_SURFACE_MAP_SIZE.mid)
  assert.notEqual(TERRAIN_SURFACE_MAP_SIZE.low, TERRAIN_SURFACE_MAP_SIZE.high)

  await disposeTerrainSurfaceMapCache()
  assert.equal(hasCachedTerrainSurfaceMaps(16), false)
  const first = await getTerrainSurfaceMaps(16)
  const sameTierResolution = await getTerrainSurfaceMaps(16)
  const lowerResolution = await getTerrainSurfaceMaps(8)
  assert.equal(first, sameTierResolution, 'High↔Mid must share one generated map set')
  assert.notEqual(first, lowerResolution, 'Low has a distinct resolution and cache entry')
  await disposeTerrainSurfaceMapCache()
  assert.equal(hasCachedTerrainSurfaceMaps(16), false)
})

test('7.4: every tier has real antialiasing, with FXAA on the floor tier', () => {
  assert.equal(TIER_SETTINGS.low.antialiasing, 'fxaa')
  assert.equal(TIER_SETTINGS.mid.antialiasing, 'smaa')
  assert.equal(TIER_SETTINGS.high.antialiasing, 'smaa')
})

test('7.6: auto quality reacts to sustained p95 pressure, not one startup spike', () => {
  assert.equal(shouldDowngradeTier(Array(10).fill(40)), false, 'too few representative frames')
  assert.equal(shouldDowngradeTier([...Array(48).fill(16.7), 120]), false, 'one shader hitch must not downgrade')
  assert.equal(shouldDowngradeTier([...Array(48).fill(16.7), ...Array(5).fill(33)]), true)
  assert.equal(shouldDowngradeTier(Array(48).fill(0)), false, 'invalid samples are ignored')
})

test('7.6: an explicit user tier survives later automatic measurements', () => {
  useQualityStore.getState().setTier('high', 'manual')
  useQualityStore.getState().setTier('low', 'auto')
  assert.equal(useQualityStore.getState().tier, 'high')
  assert.equal(useQualityStore.getState().auto, false)
})
