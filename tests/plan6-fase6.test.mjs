import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())
const { PAPI_BANKS, papiSignal } = await server.ssrLoadModule('/src/lib/approachLights.ts')
const { HANGARS, TAXIWAY, TERMINAL } = await server.ssrLoadModule('/src/lib/airportLayout.ts')
const { RUNWAY_WIDTH } = await server.ssrLoadModule('/src/lib/runwayGeometry.ts')
const { SECTION_DESTINATIONS, TAKEOFF_REVEAL_AT } = await server.ssrLoadModule('/src/lib/narrativeLayout.ts')
const { SECTIONS, localProgress } = await server.ssrLoadModule('/src/lib/sections.ts')
const { deriveScrollSnapshot } = await server.ssrLoadModule('/src/state/scrollStore.ts')

test('F5: hangar footprints clear the runway, taxiway, terminal and each other', () => {
  const rect = (pos, size) => [pos[0]-size[0]/2, pos[0]+size[0]/2, pos[2]-size[2]/2, pos[2]+size[2]/2]
  const overlaps = (a,b) => a[0]<b[1] && a[1]>b[0] && a[2]<b[3] && a[3]>b[2]
  const obstacles = [[-RUNWAY_WIDTH/2,RUNWAY_WIDTH/2,-260,260], [TAXIWAY.x-TAXIWAY.width/2,TAXIWAY.x+TAXIWAY.width/2,-240,240], rect(TERMINAL.position,TERMINAL.size)]
  for (const hangar of HANGARS) {
    const footprint = rect(hangar.position, hangar.size)
    for (const obstacle of obstacles) assert.equal(overlaps(footprint, obstacle), false)
    obstacles.push(footprint)
  }
})
test('F5: both PAPI banks read four red below path, two/two on path, four white above; back faces are dark', () => {
  for (const bank of PAPI_BANKS) {
    const signals = angle => bank.xs.map((_,i)=>papiSignal([0,.7+400*Math.tan(angle*Math.PI/180),bank.z+400*bank.direction],bank,i))
    assert.deepEqual(signals(2), ['red','red','red','red'])
    assert.deepEqual(signals(3), ['white','white','red','red'])
    assert.deepEqual(signals(4), ['white','white','white','white'])
    assert.equal(papiSignal([0,20,bank.z-50*bank.direction],bank,0),'off')
  }
})
test('F6: section navigation lands inside each section, with a readable cockpit dwell', () => {
  SECTION_DESTINATIONS.forEach((p,i)=>assert.ok(p>SECTIONS[i].start && p<SECTIONS[i].end))
  assert.equal(deriveScrollSnapshot(SECTION_DESTINATIONS[4]).interiorZone,'cockpit')
})
test('F6: the first S2 data row is visible at the editorial 13% stop', () => {
  const local = localProgress(0.13, SECTIONS[1])
  assert.ok(local >= TAKEOFF_REVEAL_AT[0])
  assert.ok(local < TAKEOFF_REVEAL_AT[1])
})
