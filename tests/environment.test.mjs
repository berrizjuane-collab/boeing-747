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
const { createRunwayMarkingsGeometry, RUNWAY_SURFACE_Y } = await server.ssrLoadModule('/src/lib/runwayGeometry.ts')

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
