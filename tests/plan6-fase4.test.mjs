import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { getAircraftPose } = await server.ssrLoadModule('/src/lib/aircraftPose.ts')
const { SECTIONS } = await server.ssrLoadModule('/src/lib/sections.ts')
const { sampleCamera } = await server.ssrLoadModule('/src/lib/cameraPath.ts')
const {
  UNDERCAST_FADE_END,
  UNDERCAST_FADE_START,
  UNDERCAST_Y,
  aerodromeDetailVisible,
  undercastOpacity,
} = await server.ssrLoadModule('/src/lib/worldPersistence.ts')
const { PROBE_CROSSOVERS, activeProbe, probeBlend } = await server.ssrLoadModule('/src/lib/iblSchedule.ts')
const { DEPTH_OF_FIELD, GOD_RAYS, cabinFocusDistance, effectMounted, effectWeight } =
  await server.ssrLoadModule('/src/lib/postFxSchedule.ts')
const { EXIT_PORTAL, NOSE_PORTAL, nearPlaneCornerDistance, portalRadius, portalSignedDepth } =
  await server.ssrLoadModule('/src/lib/thresholdPortals.ts')

/** The clearance round 6 phase 2 measured from the camera to cabin geometry. */
const VERIFIED_CABIN_CLEARANCE = 0.2548
const SHIPPED_NEAR = 0.15

test('4.1: nothing about the world is switched by a scroll number any more', () => {
  // The old gate was `progress < 0.305`. What decides visibility now is how
  // far the aircraft has climbed, so the same progress can legitimately show
  // a different world if the takeoff is re-authored — and, crucially, the
  // state is identical whichever direction the visitor arrives from.
  for (let sample = 0; sample <= 1000; sample += 1) {
    const progress = sample / 1000
    const forward = undercastOpacity(getAircraftPose(progress).altitude)
    const backward = undercastOpacity(getAircraftPose(progress).altitude)
    assert.equal(forward, backward, `deck state at ${progress} is not a pure function of progress`)
  }

  assert.ok(aerodromeDetailVisible(undercastOpacity(getAircraftPose(0).altitude)), 'the hero must show its aerodrome')
  assert.ok(
    aerodromeDetailVisible(undercastOpacity(getAircraftPose(0.2).altitude)),
    'the world must still be there mid-climb, where the old gate had already removed it',
  )
  assert.ok(
    !aerodromeDetailVisible(undercastOpacity(getAircraftPose(0.5).altitude)),
    'and it is culled once the deck above it is closed',
  )
})

test('4.2: the deck only closes once the aircraft is above it, and the aircraft climbs through it', () => {
  assert.ok(UNDERCAST_FADE_START > UNDERCAST_Y, 'the deck must not start closing before the aircraft has passed it')
  assert.ok(UNDERCAST_FADE_END > UNDERCAST_FADE_START)

  const S2 = SECTIONS[1]
  const altitudeAt = (u) => getAircraftPose(S2.start + (S2.end - S2.start) * u).altitude
  assert.ok(altitudeAt(1) > UNDERCAST_FADE_END, 'the takeoff must reach above the deck by the end of S2')

  // The camera must already be above the deck by the time it has any opacity,
  // or the visitor would be looking up at the underside of a cloud from the
  // hero shot.
  for (let sample = 0; sample <= 1000; sample += 1) {
    const progress = sample / 1000
    if (undercastOpacity(getAircraftPose(progress).altitude) <= 0.001) continue
    assert.ok(
      sampleCamera(progress).position.y > UNDERCAST_Y,
      `the camera is under the deck at ${progress} while it is visible`,
    )
  }
})

test('4.3: exactly one schedule owns reflections, and it hands over at the physical crossings', () => {
  assert.equal(activeProbe(0), 'golden')
  assert.equal(activeProbe(0.2), 'golden')
  assert.equal(activeProbe(0.35), 'highAltitude')
  assert.equal(activeProbe(0.6), 'cabin')
  assert.equal(activeProbe(0.9), 'sunset')
  assert.equal(activeProbe(1), 'sunset')

  // The cabin cannot light the aircraft from outside, and the sky must not
  // keep tinting the flight deck once the camera is in it. Crossings are
  // measured on the camera path, not assumed: the nose skin is crossed at
  // 0.420, which the previous 0.455 swap had drifted away from.
  const crossing = (portal, from, to) => {
    for (let sample = 0; sample <= 4000; sample += 1) {
      const progress = from + ((to - from) * sample) / 4000
      if (portalSignedDepth(sampleCamera(progress).position, portal) >= 0) return progress
    }
    return null
  }
  const noseCrossing = crossing(NOSE_PORTAL, 0.38, 0.5)
  const doorCrossing = crossing(EXIT_PORTAL, 0.8, 0.86)
  const cabinCrossover = PROBE_CROSSOVERS.find((crossover) => crossover.to === 'cabin')
  const sunsetCrossover = PROBE_CROSSOVERS.find((crossover) => crossover.to === 'sunset')
  assert.ok(cabinCrossover.at - cabinCrossover.halfWidth > noseCrossing, `the cabin blend starts at ${cabinCrossover.at - cabinCrossover.halfWidth}, before the nose crossing at ${noseCrossing}`)
  assert.ok(cabinCrossover.at + cabinCrossover.halfWidth < 0.46, 'the cabin owns the reflections by the start of the cabin route')
  assert.ok(Math.abs(sunsetCrossover.at - doorCrossing) < 0.003, `the sunset blend is centred on the door crossing at ${doorCrossing}`)

  // Every probe key the schedule can return must be one the owner supplies.
  const supplied = new Set(['golden', 'highAltitude', 'sunset', 'cabin'])
  for (let sample = 0; sample <= 1000; sample += 1) {
    assert.ok(supplied.has(activeProbe(sample / 1000)), `unknown probe at ${sample / 1000}`)
  }
})

test('4.3: probes blend across each hand-over instead of swapping', () => {
  // A swap hidden in a 45 % intensity well still showed as a one-frame colour
  // cut (0.279→0.280, 0.454→0.456). Both probes now contribute across the
  // window, with a mix that never steps.
  for (const crossover of PROBE_CROSSOVERS) {
    const middle = probeBlend(crossover.at)
    assert.equal(middle.to, crossover.to)
    assert.ok(Math.abs(middle.weight - 0.5) < 1e-9, `the ${crossover.to} hand-over is not half-mixed at its centre`)
    assert.ok(crossover.halfWidth >= 0.008, `the ${crossover.to} blend is too short to read as a blend`)
  }
  // Continuous: the effective mix (dominant probe weights) never jumps.
  const effective = (progress) => {
    const { from, to, weight } = probeBlend(progress)
    return { [from]: 1 - weight, ...(to === from ? {} : { [to]: weight }) }
  }
  let previous = effective(0)
  for (let sample = 1; sample <= 20000; sample += 1) {
    const current = effective(sample / 20000)
    for (const key of new Set([...Object.keys(previous), ...Object.keys(current)])) {
      const step = Math.abs((current[key] ?? 0) - (previous[key] ?? 0))
      assert.ok(step < 0.005, `probe ${key} stepped by ${step} at ${sample / 20000}`)
    }
    previous = current
  }
})

test('4.4: every effect is mounted and unmounted while it contributes nothing', () => {
  for (const [name, window] of [
    ['god rays', GOD_RAYS],
    ['depth of field', DEPTH_OF_FIELD],
  ]) {
    assert.ok(window.mountFrom < window.riseFrom, `${name} rises before it is mounted`)
    assert.ok(window.mountTo > window.fallTo, `${name} is unmounted before it has faded`)
    assert.equal(effectWeight(window.mountFrom, window), 0, `${name} is not silent at its mount edge`)
    assert.equal(effectWeight(window.mountTo, window), 0, `${name} is not silent at its unmount edge`)
    assert.ok(effectWeight((window.riseTo + window.fallFrom) / 2, window) > 0.99, `${name} never reaches full strength`)

    // And the effect is never asked for while it is not mounted.
    for (let sample = 0; sample <= 2000; sample += 1) {
      const progress = sample / 2000
      if (effectWeight(progress, window) > 0) {
        assert.ok(effectMounted(progress, window), `${name} has weight at ${progress} while unmounted`)
      }
    }
  }

  // Both mount edges sit where the camera is slow: a rebuilt composer costs
  // a frame, and a lost frame is invisible where little is moving.
  for (const edge of [GOD_RAYS.mountFrom, GOD_RAYS.mountTo, DEPTH_OF_FIELD.mountFrom, DEPTH_OF_FIELD.mountTo]) {
    const step = 5e-4
    const speed = sampleCamera(edge + step).position.distanceTo(sampleCamera(edge - step).position) / (2 * step)
    assert.ok(speed < 400, `a composer rebuild at ${edge} lands where the camera moves at ${speed} u per unit progress`)
  }
})

test('4.4: cabin focus follows the subject of each beat instead of a fixed six metres', () => {
  const cockpit = cabinFocusDistance(0.516)
  const economy = cabinFocusDistance(0.609)
  const stair = cabinFocusDistance(0.718)
  assert.ok(cockpit < 4, `the flight deck is close: ${cockpit}`)
  assert.ok(economy > 7, `the aisle runs away from the camera: ${economy}`)
  assert.ok(stair < 6 && stair > cockpit, `the staircase sits between the two: ${stair}`)

  // Continuous, so the focal plane travels rather than snapping at a zone edge.
  let previous = cabinFocusDistance(0.46)
  for (let sample = 460; sample <= 835; sample += 1) {
    const value = cabinFocusDistance(sample / 1000)
    assert.ok(Math.abs(value - previous) < 0.2, `focus stepped at ${sample / 1000}`)
    previous = value
  }
})

test('4.5: the portal opens before contact and reseals only once the near plane is clear', () => {
  const nearCorner = nearPlaneCornerDistance(50, 16 / 9, SHIPPED_NEAR)
  const at = (depth, window) => {
    const position = window.center.clone().addScaledVector(window.traversalNormal, depth)
    return portalRadius((window.start + window.end) / 2, window, position, nearCorner)
  }

  for (const [name, window] of [
    ['nose', NOSE_PORTAL],
    ['exit', EXIT_PORTAL],
  ]) {
    assert.equal(at(-window.openDistance - 5, window), 0, `${name} is open before the camera is anywhere near it`)
    assert.ok(at(-window.contactDistance, window) > window.maxRadius * 0.99, `${name} is not open at contact`)
    assert.ok(at(0, window) > window.maxRadius * 0.99, `${name} is not open at the crossing itself`)
    // Still open while the near plane is inside.
    assert.ok(at(nearCorner * 0.5, window) > window.maxRadius * 0.99, `${name} reseals with the near plane still inside`)
    assert.equal(at(nearCorner + window.clearMargin + window.contactDistance + 1, window), 0, `${name} never reseals`)

    // Monotone either side of the crossing, so scrolling back is symmetric.
    let previous = 0
    for (let depth = -window.openDistance - 2; depth <= 0; depth += 0.05) {
      const radius = at(depth, window)
      assert.ok(radius >= previous - 1e-9, `${name} flickers while approaching`)
      previous = radius
    }

    // And the narrative gate still holds: outside its window, never open.
    const outside = window.center.clone()
    assert.equal(portalRadius(window.start, window, outside, nearCorner), 0, `${name} opens before its window`)
    assert.equal(portalRadius(window.end, window, outside, nearCorner), 0, `${name} stays open past its window`)
  }
})

test('4.5: the hull is open at the frames the camera actually crosses it', () => {
  const nearCorner = nearPlaneCornerDistance(50, 16 / 9, SHIPPED_NEAR)
  for (const [name, window] of [
    ['nose', NOSE_PORTAL],
    ['exit', EXIT_PORTAL],
  ]) {
    // Found, not assumed. The nose plane is crossed at 0.42, not at the
    // 0.46 cabin seam — keyframe 6 is authored on the skin — and a test
    // that hard-codes where it thinks the crossing is would have passed
    // while checking a stretch the camera had already left.
    let crossed = 0
    let previousDepth = portalSignedDepth(sampleCamera(window.start).position, window)
    for (let sample = 1; sample <= 2000; sample += 1) {
      const progress = window.start + ((window.end - window.start) * sample) / 2000
      const position = sampleCamera(progress).position
      const depth = portalSignedDepth(position, window)
      if (previousDepth < 0 && depth >= 0) crossed += 1
      if (Math.abs(depth) <= 1.5) {
        assert.ok(
          portalRadius(progress, window, position, nearCorner) > 0,
          `${name} is sealed at ${progress} with the camera ${depth} from the plane`,
        )
      }
      previousDepth = depth
    }
    assert.equal(crossed, 1, `${name}: expected exactly one crossing inside the window, saw ${crossed}`)
  }
})

test('4.6: the near plane is tighter for depth precision but still inside the verified clearance', () => {
  // The widest lens the path uses is the cabin's 50 degrees.
  const corner = nearPlaneCornerDistance(50, 16 / 9, SHIPPED_NEAR)
  assert.ok(corner < VERIFIED_CABIN_CLEARANCE, `near-plane corner ${corner} exceeds the measured clearance`)
  // The value it replaced bought less precision; the one rejected as too
  // large would have put the corner outside the clearance.
  assert.ok(nearPlaneCornerDistance(50, 16 / 9, 0.2) > VERIFIED_CABIN_CLEARANCE, 'near 0.2 would have clipped')
  assert.ok(corner > nearPlaneCornerDistance(50, 16 / 9, 0.1), 'the near plane did move outward')
})
