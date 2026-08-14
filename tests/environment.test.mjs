import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile, stat } from 'node:fs/promises'
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
const { EXTERIOR_LIGHTS, SECTION_ENVIRONMENT, sampleEnvironmentTheme } =
  await server.ssrLoadModule('/src/lib/environmentTheme.ts')
const { EXIT_PORTAL, frameVisibility } = await server.ssrLoadModule('/src/lib/thresholdPortals.ts')
const { createRunwayMarkingsGeometry, RUNWAY_SURFACE_Y } = await server.ssrLoadModule('/src/lib/runwayGeometry.ts')
const { mergeLandingGearMeshes, MERGED_LANDING_GEAR_NAME, setLandingGearMergeMode } =
  await server.ssrLoadModule('/src/lib/landingGearMerge.ts')
const { BLOCKING_ASSET_WEIGHTS, BLOCKING_TOTAL_WEIGHT } =
  await server.ssrLoadModule('/src/lib/loadingWeights.ts')
const { activeHdriSectionSlot } = await server.ssrLoadModule('/src/lib/hdriTheme.ts')
const { SECTION_GRADES, sampleSectionGrade } = await server.ssrLoadModule('/src/lib/sectionGrading.ts')
const { exponentialFogMix, FOG_EVIDENCE_DISTANCES } = await server.ssrLoadModule('/src/lib/fogMetrics.ts')
const { HDRI_SUN_PRESETS, sampleSolarRig } = await server.ssrLoadModule('/src/lib/solarLighting.ts')
const {
  HDRI_GPU_WIDTH,
  HDRI_SOURCE_RESOLUTION,
  HighHdriLoader,
  MidHdriLoader,
  LowHdriLoader,
  estimatedHdriGpuBytes,
} = await server.ssrLoadModule('/src/lib/tieredHdri.ts')
const { exposureMultiplier } = await server.ssrLoadModule('/src/lib/thresholdLighting.ts')
const { qualityTierFromSearch } = await server.ssrLoadModule('/src/state/qualityStore.ts')
const { BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import('three')

test('A2/A3: exterior rig and atmosphere have complete finite section anchors', () => {
  assert.deepEqual(Object.keys(EXTERIOR_LIGHTS).sort(), ['fill', 'key', 'rim'])
  assert.equal(new Set(Object.values(EXTERIOR_LIGHTS).map((light) => light.name)).size, 3)
  assert.equal(SECTION_ENVIRONMENT.length, 7)

  for (const [sectionIndex, section] of SECTION_ENVIRONMENT.entries()) {
    assert.ok(section.fogDensity > 0 && section.fogDensity < 0.002, `fog density S${sectionIndex + 1}`)
    assert.ok(section.exposureCompensation > 0 && section.exposureCompensation <= 1.5)
    assert.ok(section.environmentIntensity > 0 && section.environmentIntensity <= 1)
    assert.match(section.fogColor, /^#[\da-f]{6}$/i)
    assert.match(section.hemisphereSky, /^#[\da-f]{6}$/i)
    assert.match(section.hemisphereGround, /^#[\da-f]{6}$/i)
    assert.ok(section.hemisphereIntensity >= 0 && section.hemisphereIntensity <= 0.5)
    assert.ok(section.ambientIntensity >= 0 && section.ambientIntensity <= 0.2)
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

test('F0-02: landing-gear merge preserves child transforms and one shared material', () => {
  const gear = new Group()
  gear.name = 'LandingGear'
  gear.position.set(7, 2, -4)
  const material = new MeshStandardMaterial()
  const left = new Mesh(new BoxGeometry(1, 1, 1), material)
  const rightCarrier = new Group()
  const right = new Mesh(new BoxGeometry(1, 1, 1), material)
  left.position.x = -2
  rightCarrier.position.x = 3
  right.position.y = 1
  gear.add(left, rightCarrier)
  rightCarrier.add(right)

  const result = mergeLandingGearMeshes(gear)
  assert.equal(result.sourceMeshCount, 2)
  assert.equal(result.sourceTriangleCount, 24)
  assert.equal(gear.getObjectByName(MERGED_LANDING_GEAR_NAME), result.mesh)
  assert.equal(result.mesh.material, material)
  let remainingMeshes = 0
  gear.traverse((object) => {
    if (object.isMesh) remainingMeshes += 1
  })
  assert.equal(remainingMeshes, 1)
  result.mesh.geometry.computeBoundingBox()
  assert.deepEqual(result.mesh.geometry.boundingBox.min.toArray(), [-2.5, -0.5, -0.5])
  assert.deepEqual(result.mesh.geometry.boundingBox.max.toArray(), [3.5, 1.5, 0.5])

  result.mesh.geometry.dispose()
  material.dispose()
})

test('F0-02: deterministic QA can alternate preserved source and merged render paths', () => {
  const gear = new Group()
  gear.name = 'LandingGear'
  const material = new MeshStandardMaterial()
  const left = new Mesh(new BoxGeometry(1, 1, 1), material)
  const right = new Mesh(new BoxGeometry(1, 1, 1), material)
  gear.add(left, right)

  const result = mergeLandingGearMeshes(gear, { preserveSourceMeshes: true })
  const bakedSources = []
  gear.traverse((object) => {
    if (object.userData.qaLandingGearSource) bakedSources.push(object)
  })
  assert.equal(bakedSources.length, 2)
  assert.equal(left.visible, false)
  assert.equal(right.visible, false)
  assert.equal(result.mesh.visible, true)
  setLandingGearMergeMode(gear, 'source')
  assert.equal(left.visible, false)
  assert.equal(right.visible, false)
  assert.ok(bakedSources.every((mesh) => mesh.visible))
  assert.equal(result.mesh.visible, false)
  setLandingGearMergeMode(gear, 'merged')
  assert.equal(left.visible, false)
  assert.equal(right.visible, false)
  assert.ok(bakedSources.every((mesh) => !mesh.visible))
  assert.equal(result.mesh.visible, true)

  left.geometry.dispose()
  right.geometry.dispose()
  for (const mesh of bakedSources) mesh.geometry.dispose()
  result.mesh.geometry.dispose()
  material.dispose()
})

test('F0-04: blocking loading weights match bytes on disk exactly', async () => {
  const expectedPaths = {
    '/models/exterior.glb': 'public/models/exterior.glb',
    '/hdri/golden-hour.hdr': 'public/hdri/golden-hour.hdr',
    '/hdri/high-altitude.hdr': 'public/hdri/high-altitude.hdr',
    '/hdri/sunset.hdr': 'public/hdri/sunset.hdr',
  }
  let measuredTotal = 0
  for (const [key, file] of Object.entries(expectedPaths)) {
    const bytes = (await stat(file)).size
    assert.equal(BLOCKING_ASSET_WEIGHTS[key], bytes, `${key} byte weight`)
    measuredTotal += bytes
  }
  assert.equal(BLOCKING_TOTAL_WEIGHT, measuredTotal)
  assert.ok(measuredTotal <= 15_000_000)
})

test('plan3 A2: grading strength is authored per section and interpolated at runtime', () => {
  assert.equal(SECTION_GRADES.length, 7)
  assert.equal(SECTION_GRADES[5].strength, 0.64)
  assert.ok(new Set(SECTION_GRADES.map(({ strength }) => strength)).size > 1)
  const startS6 = sampleSectionGrade(0.82)
  const laterS6 = sampleSectionGrade(0.9)
  assert.equal(startS6.strength, 0.64)
  assert.ok(laterS6.strength < startS6.strength)
  assert.ok(laterS6.strength > SECTION_GRADES[6].strength)
})

test('plan3 A4: every narrative section resolves to a non-null exterior HDRI fallback', () => {
  assert.deepEqual(
    Array.from({ length: 7 }, (_, index) => activeHdriSectionSlot(index)),
    ['golden', 'golden', 'high-altitude', 'high-altitude', 'high-altitude', 'sunset', 'sunset'],
  )
})

test('plan3 B1: exterior hemisphere irradiance lifts S1/S2 without replacing the authored key', () => {
  for (const progress of [0.01, 0.13, 0.24]) {
    const theme = sampleEnvironmentTheme(progress)
    assert.ok(theme.hemisphereIntensity >= 0.3, `hemisphere intensity at ${progress}`)
    assert.ok(theme.ambientIntensity >= 0.08, `ambient shadow lift at ${progress}`)
    assert.ok(theme.lights.key.intensity > theme.hemisphereIntensity * 3, `key/ambient separation at ${progress}`)
  }
  assert.ok(sampleEnvironmentTheme(0.6).ambientIntensity < 0.03, 'S5 keeps its authored darkness')
})

test('plan3 B2: key direction matches every authored HDRI sun exactly', async () => {
  const samples = [
    [0.1, 'golden', HDRI_SUN_PRESETS.golden],
    [0.36, 'high-altitude', HDRI_SUN_PRESETS['high-altitude']],
    [0.88, 'sunset', HDRI_SUN_PRESETS.sunset],
  ]
  for (const [progress, source, expected] of samples) {
    const rig = sampleSolarRig(progress)
    assert.equal(rig.source, source)
    assert.ok(Math.abs(rig.sunAzimuthDeg - expected.azimuthDeg) <= 1e-9)
    assert.ok(Math.abs(rig.sunElevationDeg - expected.elevationDeg) <= 1e-9)
    assert.ok(rig.keyAngularErrorDeg <= 1e-6)
  }

  const generator = await readFile('blender/generate_hdri.py', 'utf8')
  for (const preset of Object.values(HDRI_SUN_PRESETS)) {
    assert.ok(generator.includes(`math.radians(${preset.azimuthDeg.toFixed(1)})`), `generator azimuth ${preset.azimuthDeg}`)
    assert.ok(
      generator.includes(`math.radians(${preset.elevationDeg.toFixed(1)})`),
      `generator elevation ${preset.elevationDeg}`,
    )
  }
})

test('plan3 B5: 4K HDRI sources are mipmapped and tier-filtered before GPU upload', async () => {
  assert.deepEqual(HDRI_SOURCE_RESOLUTION, [4096, 2048])
  assert.deepEqual(HDRI_GPU_WIDTH, { high: 4096, mid: 2048, low: 1024 })
  const source = await readFile('public/hdri/golden-hour.hdr')
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  for (const [Loader, width] of [
    [HighHdriLoader, 4096],
    [MidHdriLoader, 2048],
    [LowHdriLoader, 1024],
  ]) {
    const parsed = new Loader().parse(buffer)
    assert.equal(parsed.width, width)
    assert.equal(parsed.height, width / 2)
    assert.equal(parsed.generateMipmaps, true)
  }
  assert.equal(estimatedHdriGpuBytes('high'), 268_435_456)
  assert.equal(estimatedHdriGpuBytes('mid'), 67_108_864)
  assert.equal(estimatedHdriGpuBytes('low'), 16_777_216)
})

test('plan3 B5: visual evidence locks one valid tier before HDRI loading begins', () => {
  assert.equal(qualityTierFromSearch('?quality=high'), 'high')
  assert.equal(qualityTierFromSearch('?gear-qa=1&quality=low'), 'low')
  assert.equal(qualityTierFromSearch('?quality=mid'), 'mid')
  assert.equal(qualityTierFromSearch('?quality=ultra'), null)
  assert.equal(qualityTierFromSearch(''), null)
})

test('plan3 B6/B7: S6 haze stays warm with distance and effective exposure is neutral', () => {
  for (const progress of [0.82, 0.86, 0.88, 0.92, 0.95]) {
    const theme = sampleEnvironmentTheme(progress)
    const effectiveExposure = exposureMultiplier(progress) * theme.exposureCompensation
    assert.ok(effectiveExposure >= 0.88 && effectiveExposure <= 1.1, `effective exposure at ${progress}`)
  }

  const dusk = sampleEnvironmentTheme(0.88)
  assert.ok(dusk.fogColor.r > dusk.fogColor.b, 'S6 distance haze has a warm red-over-blue bias')
  const mixes = FOG_EVIDENCE_DISTANCES.map((distance) => exponentialFogMix(dusk.fogDensity, distance))
  assert.ok(mixes[0] > 0 && mixes[0] < mixes[1] && mixes[1] < mixes[2] && mixes[2] < 1)
})
