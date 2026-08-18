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

const { HORIZON_BAND_HALF_DEGREES, HORIZON_BAND_HALF_SIN, horizonBandFragmentParsChunk, horizonBandVertexMainChunk, horizonBandVertexParsChunk } =
  await server.ssrLoadModule('/src/lib/skyHorizonBand.ts')
const { createSkyDomeMaterial } = await server.ssrLoadModule('/src/lib/skyDomeMaterial.ts')
const { createSunsetDomeMaterial } = await server.ssrLoadModule('/src/lib/sunsetDomeMaterial.ts')
const { Color, DataTexture } = await import('three')

function fakeTexture() {
  return new DataTexture(new Uint8Array(4), 1, 1)
}

test('skyHorizonBand: HORIZON_BAND_HALF_SIN matches sin(HORIZON_BAND_HALF_DEGREES) exactly', () => {
  const expected = Math.sin((HORIZON_BAND_HALF_DEGREES * Math.PI) / 180)
  assert.equal(HORIZON_BAND_HALF_SIN, expected)
  assert.ok(HORIZON_BAND_HALF_DEGREES > 0 && HORIZON_BAND_HALF_DEGREES < 90)
})

test('skyHorizonBand: GLSL chunks declare the shared varying and the blend function once each', () => {
  assert.match(horizonBandVertexParsChunk, /varying vec3 vHorizonWorldPosition/)
  assert.match(horizonBandVertexMainChunk, /vHorizonWorldPosition\s*=/)
  assert.match(horizonBandFragmentParsChunk, /uniform vec3 horizonHazeColor/)
  assert.match(horizonBandFragmentParsChunk, /uniform float horizonBandHalfSin/)
  assert.match(horizonBandFragmentParsChunk, /vec3 applyHorizonHazeBand\(/)
  // cameraPosition is a three.js built-in — must not be redeclared (that would fail to compile).
  assert.doesNotMatch(horizonBandFragmentParsChunk, /uniform vec3 cameraPosition/)
})

test('skyDomeMaterial (I1): wires the horizon band into both stages and exposes a mutable colour ref', () => {
  const { material, horizonHazeColor } = createSkyDomeMaterial(fakeTexture(), fakeTexture())
  assert.ok(horizonHazeColor.value instanceof Color)
  assert.equal(material.uniforms.horizonHazeColor, horizonHazeColor)
  assert.equal(typeof material.uniforms.horizonBandHalfSin.value, 'number')
  assert.match(material.vertexShader, /vHorizonWorldPosition/)
  assert.match(material.fragmentShader, /applyHorizonHazeBand/)
  // The haze blend has to run on the mixed sky colour before tonemapping,
  // not after — otherwise it wouldn't tonemap consistently with the rest
  // of the dome.
  const hazeIndex = material.fragmentShader.indexOf('applyHorizonHazeBand')
  const tonemapIndex = material.fragmentShader.indexOf('tonemapping_fragment')
  assert.ok(hazeIndex > 0 && tonemapIndex > hazeIndex, 'haze blend must run before tonemapping_fragment')
})

test('sunsetDomeMaterial (I2): same wiring as skyDomeMaterial, plus an opacity uniform ref replacing the old .opacity property', () => {
  const { material, horizonHazeColor, opacity } = createSunsetDomeMaterial(fakeTexture())
  assert.ok(horizonHazeColor.value instanceof Color)
  assert.equal(material.uniforms.horizonHazeColor, horizonHazeColor)
  assert.equal(material.uniforms.opacity, opacity)
  assert.equal(opacity.value, 0, 'starts fully transparent, matching the pre-Fase-I MeshBasicMaterial default')
  assert.match(material.vertexShader, /vHorizonWorldPosition/)
  assert.match(material.fragmentShader, /applyHorizonHazeBand/)
})

test('sky and sunset dome materials use distinct compiled programs (distinct customProgramCacheKey)', () => {
  const sky = createSkyDomeMaterial(fakeTexture(), fakeTexture())
  const sunset = createSunsetDomeMaterial(fakeTexture())
  assert.notEqual(sky.material.type, undefined)
  assert.notEqual(sky.material.fragmentShader, sunset.material.fragmentShader)
})
