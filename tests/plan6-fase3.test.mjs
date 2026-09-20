import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
after(() => server.close())

const { CAMERA_SHOT_BANDS, KEYFRAMES, cameraTraversalSpeed, keyframeArrivalProgress, sampleCamera } =
  await server.ssrLoadModule('/src/lib/cameraPath.ts')
const { SHOT_SHEET, allocateShotSpans } = await server.ssrLoadModule('/src/lib/shotSheet.ts')
const { createMotionProfile, rampedLinear } = await server.ssrLoadModule('/src/lib/motionProfile.ts')
const { cabinRouteSpeed, sampleCabinRoute } = await server.ssrLoadModule('/src/lib/cabinRoute.ts')
const { getAircraftPose } = await server.ssrLoadModule('/src/lib/aircraftPose.ts')
const { RUNWAY_POSE, FLYING_POSE } = await server.ssrLoadModule('/src/lib/sceneLayout.ts')
const { SECTIONS } = await server.ssrLoadModule('/src/lib/sections.ts')
const { walkSwayTarget, approachEnvelope } = await server.ssrLoadModule('/src/lib/cameraEnvelopes.ts')
const { AIRCRAFT_LANDMARKS, hullLandmarksOnScreen, horizontalPreservingFov, landmarkScreenSpeed, projectToScreen, REFERENCE_ASPECT } =
  await server.ssrLoadModule('/src/lib/shotFraming.ts')

const ASPECT = 16 / 9
const deg = (radians) => (radians * 180) / Math.PI
const look = (sample) => sample.target.clone().sub(sample.position).normalize()

// Declared before the tuning, as plan6 3.4 requires. Cost rate is the
// quantity the interpolator is C1 in; linear speed may still step at a join
// where a shot trades translation for rotation, and that share is declared
// separately rather than asserted to be zero.
const COST_RATE_CONTINUITY_TOLERANCE = 0.05
const LINEAR_SPEED_CONTINUITY_TOLERANCE = 0.5
// Frame heights the subject may sweep per 0.001 of progress, by what the
// shot is for. A retreat is *about* the subject moving through frame, so
// holding it to a tracking shot's budget would be asking the wrong
// question; a drift or a settle is a held frame and must prove it.
// Measured peaks, round 6 phase 3: drift 0.0006, settle 0.0006,
// track 0.039, approach 0.035, turn 0.019, retreat 0.106.
const SCREEN_SPEED_LIMITS = { drift: 0.005, settle: 0.005, track: 0.05, approach: 0.05, turn: 0.05, retreat: 0.12 }

test('3.1: every shot declares intent, subject and framing, and the bands are gap-free', () => {
  const intents = new Set(['drift', 'track', 'turn', 'approach', 'threshold', 'dwell', 'retreat', 'settle'])
  for (const shot of SHOT_SHEET) {
    assert.ok(intents.has(shot.intent), `${shot.id} has an unknown intent`)
    assert.ok(shot.subject.length > 10, `${shot.id} has no usable subject`)
    assert.ok(shot.framing.length > 10, `${shot.id} has no usable framing note`)
    assert.ok(shot.toIndex - shot.fromIndex >= 0 && shot.toIndex - shot.fromIndex <= 1, `${shot.id} spans too many keyframes`)
  }
  assert.equal(CAMERA_SHOT_BANDS.length, SHOT_SHEET.length)
  assert.equal(CAMERA_SHOT_BANDS[0].start, 0)
  assert.equal(CAMERA_SHOT_BANDS[CAMERA_SHOT_BANDS.length - 1].end, 1)
  for (let index = 1; index < CAMERA_SHOT_BANDS.length; index += 1) {
    assert.equal(CAMERA_SHOT_BANDS[index].start, CAMERA_SHOT_BANDS[index - 1].end, `gap before band ${index}`)
  }
  // Only a shot whose intent is `dwell` may hold still.
  for (const band of CAMERA_SHOT_BANDS) {
    const holds = band.fromIndex === band.toIndex
    assert.equal(holds, band.intent === 'dwell', `${band.id} holds still without declaring a dwell`)
  }
})

test('3.2: scroll is handed out by traversal cost, not by keyframe count', () => {
  // Two shots inside one authored interval, one ten times the cost of the
  // other, must receive proportional scroll.
  const costs = SHOT_SHEET.map((shot, index) => (index === 1 ? 10 : index === 2 ? 90 : 1))
  const bands = allocateShotSpans(costs)
  const first = bands[1].end - bands[1].start
  const second = bands[2].end - bands[2].start
  assert.ok(Math.abs(second / first - 9) < 1e-9, `expected a 9:1 split, received ${second / first}`)

  // The three-metre S2/S3 reposition used to be handed the same 0.02 of
  // scroll as a ninety-metre move, which is what put a near-stop at 0.30.
  const bankEntry = CAMERA_SHOT_BANDS.find((band) => band.id === 'S3-bank-entry')
  const orbit = CAMERA_SHOT_BANDS.find((band) => band.id === 'S3-orbit')
  assert.ok(bankEntry.end - bankEntry.start < 0.005, 'a three-metre reposition must not own a percent of the page')
  assert.ok(orbit.end - orbit.start > 0.08, 'the orbit must own the scroll its length and turn need')
})

test('3.3: the interior keyframes cannot bend the exterior curve', () => {
  // A bounded curve is only checked by what it produces: both exterior runs
  // must pass exactly through their own end keyframes, which a spline shared
  // with the cabin's keyframes would overshoot.
  const arrivals = keyframeArrivalProgress()
  for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 15, 16]) {
    const sample = sampleCamera(arrivals[index])
    const authored = KEYFRAMES[index].camPos
    const error = Math.hypot(
      sample.position.x - authored[0],
      sample.position.y - authored[1],
      sample.position.z - authored[2],
    )
    assert.ok(error <= 1e-4, `keyframe ${index} is off its authored position by ${error}`)
  }
})

test('3.4: C0 holds at every join and C1 holds everywhere the shots keep moving', () => {
  for (const band of CAMERA_SHOT_BANDS) {
    for (const edge of [band.start, band.end]) {
      if (edge <= 0 || edge >= 1) continue
      const before = sampleCamera(edge - 1e-9)
      const after = sampleCamera(edge + 1e-9)
      assert.ok(before.position.distanceTo(after.position) <= 1e-4, `position C0 at ${edge}`)
      assert.ok(deg(look(before).angleTo(look(after))) <= 0.01, `orientation C0 at ${edge}`)
      assert.ok(Math.abs(before.fov - after.fov) <= 0.01, `FOV C0 at ${edge}`)
    }
  }

  let worstCost = 0
  let worstLinear = 0
  for (const band of CAMERA_SHOT_BANDS.slice(0, -1)) {
    const edge = band.end
    const beforeRate = cameraTraversalSpeed(edge - 1e-5)
    const afterRate = cameraTraversalSpeed(edge + 1e-5)
    // An authored dwell is allowed — required — to reach zero.
    if (Math.min(beforeRate, afterRate) < 1e-6) continue
    worstCost = Math.max(worstCost, Math.abs(afterRate - beforeRate) / Math.max(afterRate, beforeRate))

    const step = 2e-4
    const beforeLinear = sampleCamera(edge - step).position.distanceTo(sampleCamera(edge - 2 * step).position) / step
    const afterLinear = sampleCamera(edge + step).position.distanceTo(sampleCamera(edge + 2 * step).position) / step
    worstLinear = Math.max(worstLinear, Math.abs(afterLinear - beforeLinear) / Math.max(afterLinear, beforeLinear))
  }
  assert.ok(worstCost <= COST_RATE_CONTINUITY_TOLERANCE, `cost-rate continuity ${worstCost}`)
  assert.ok(worstLinear <= LINEAR_SPEED_CONTINUITY_TOLERANCE, `linear speed continuity ${worstLinear}`)
})

test('3.4: the camera only comes to a stop where a dwell asks it to', () => {
  const holds = CAMERA_SHOT_BANDS.filter((band) => band.intent === 'dwell')
  for (let sample = 1; sample < 1000; sample += 1) {
    const progress = sample / 1000
    if (cameraTraversalSpeed(progress) > 1e-6) continue
    const inDwell = holds.some((band) => progress >= band.start - 1e-9 && progress <= band.end + 1e-9)
    assert.ok(inDwell, `the camera stops at ${progress} without an authored dwell`)
  }
  for (const band of holds) {
    const middle = (band.start + band.end) / 2
    assert.ok(cameraTraversalSpeed(middle) <= 1e-6, `${band.id} does not actually hold`)
  }
})

test('3.4: the cabin walk no longer brakes at each of its nineteen stops', () => {
  // Every stop that is not a repeated position must be passed through with
  // real speed; a per-segment smoothstep put a stop at all of them.
  let braking = 0
  for (const progress of [0.475, 0.56, 0.568, 0.576, 0.674, 0.752, 0.827]) {
    if (cabinRouteSpeed(progress) < 1) braking += 1
  }
  assert.equal(braking, 0, 'the cabin route still stops at a segment join')
  for (const progress of [0.51, 0.61, 0.72, 0.8]) {
    assert.ok(cabinRouteSpeed(progress) <= 1e-6, `the cabin dwell at ${progress} must hold`)
  }
})

test('3.4: the motion profile is monotone, exact at its knots and C1 between them', () => {
  const knots = [
    { progress: 0, cost: 0 },
    { progress: 0.2, cost: 5 },
    { progress: 0.4, cost: 5 },
    { progress: 0.7, cost: 300 },
    { progress: 1, cost: 320 },
  ]
  const profile = createMotionProfile(knots)
  for (const knot of knots) assert.ok(Math.abs(profile.cost(knot.progress) - knot.cost) < 1e-9, `knot at ${knot.progress}`)
  let previous = -1
  for (let sample = 0; sample <= 1000; sample += 1) {
    const value = profile.cost(sample / 1000)
    assert.ok(value >= previous - 1e-9, `cost decreased at ${sample / 1000}`)
    previous = value
  }
  // A flat interval is a real stop; its neighbours therefore arrive at zero.
  assert.ok(profile.speed(0.3) <= 1e-9)
  assert.equal(profile.speed(0.2), 0, 'the knot entering a hold must have zero tangent')
  assert.ok(profile.speed(0.2 - 1e-4) < 0.01 * 25, 'speed must already be settling into the hold')
  // A join between two moving intervals is continuous in speed. Compared
  // relatively: sampling either side of a knot necessarily lands a finite
  // step away, and the curvature there is on the order of the cost itself.
  const beforeKnot = profile.speed(0.7 - 1e-6)
  const afterKnot = profile.speed(0.7 + 1e-6)
  assert.ok(
    Math.abs(afterKnot - beforeKnot) / Math.max(beforeKnot, afterKnot) < 1e-3,
    `speed stepped from ${beforeKnot} to ${afterKnot} across a moving knot`,
  )

  // The ramped profile holds a near-constant rate: peak is 1/(1-ramp).
  let peak = 0
  for (let sample = 1; sample <= 1000; sample += 1) {
    peak = Math.max(peak, (rampedLinear(sample / 1000, 0.05) - rampedLinear((sample - 1) / 1000, 0.05)) * 1000)
  }
  assert.ok(peak < 1.08, `ramped rate peaked at ${peak}`)
  assert.equal(rampedLinear(0), 0)
  assert.equal(rampedLinear(1), 1)
})

test('3.5: the walking sway follows how fast the visitor advances, not which section they are in', () => {
  const inside = (SECTIONS[4].start + SECTIONS[4].end) / 2
  assert.equal(walkSwayTarget(inside, 0, false), 0, 'standing still in the cabin must not sway')
  assert.ok(walkSwayTarget(inside, 0.05, false) > 0.99, 'advancing normally must reach full amplitude')
  assert.ok(walkSwayTarget(inside, 0.05, true) === 0, 'reduced motion removes the layer entirely')
  assert.equal(walkSwayTarget(SECTIONS[3].start + 0.01, 0.05, false), 0, 'the sway belongs to S5 alone')
  // No step at the boundary: the envelope has to be continuous across it.
  assert.ok(walkSwayTarget(SECTIONS[4].start + 1e-6, 0.05, false) < 0.01)
  assert.ok(walkSwayTarget(SECTIONS[4].end - 1e-6, 0.05, false) < 0.01)
  // Scrolling backwards is still advancing.
  assert.ok(walkSwayTarget(inside, -0.05, false) > 0.99)

  // The smoothing is frame-rate independent and cannot be snapped by a long
  // background-tab delta.
  let sixty = 0
  for (let frame = 0; frame < 60; frame += 1) sixty = approachEnvelope(sixty, 1, 1 / 60, 0.32)
  let oneTwenty = 0
  for (let frame = 0; frame < 120; frame += 1) oneTwenty = approachEnvelope(oneTwenty, 1, 1 / 120, 0.32)
  assert.ok(Math.abs(sixty - oneTwenty) < 0.01, `60 Hz ${sixty} vs 120 Hz ${oneTwenty}`)
  assert.equal(approachEnvelope(0, 1, 30, 0.32), approachEnvelope(0, 1, 0.05, 0.32))
})

test('3.6: the aircraft rolls before it rotates and rotates before it flies', () => {
  const S2 = SECTIONS[1]
  const at = (u) => getAircraftPose(S2.start + (S2.end - S2.start) * u)

  assert.equal(at(0).altitude, 0, 'the aircraft must start on the runway')
  for (const u of [0.05, 0.2, 0.41]) {
    assert.equal(at(u).pitchRad, 0, `still taxiing at ${u}`)
    assert.ok(at(u).altitude <= 1e-9, `the wheels left the ground during the roll at ${u}`)
  }
  assert.ok(at(0.3).position.z < at(0.05).position.z, 'the ground roll must cover runway')
  assert.ok(
    Math.abs(at(0.3).position.z - at(0.05).position.z) < Math.abs(at(0.55).position.z - at(0.3).position.z),
    'the roll must accelerate, not run at constant speed',
  )

  const rotating = at(0.5)
  assert.ok(rotating.pitchRad > 0, 'rotation must raise the nose')
  assert.ok(rotating.altitude <= 1e-9, 'the main gear stays planted through the rotation')
  assert.ok(at(0.7).altitude > 0, 'the aircraft must be climbing after rotation')

  // Altitude never goes backwards, and pitch peaks at rotation before
  // settling to the registered flying attitude.
  let previousAltitude = -1
  let peakPitch = -Infinity
  for (let sample = 0; sample <= 400; sample += 1) {
    const pose = at(sample / 400)
    assert.ok(pose.altitude >= previousAltitude - 1e-9, `altitude fell at ${sample / 400}`)
    previousAltitude = pose.altitude
    peakPitch = Math.max(peakPitch, pose.pitchRad)
  }
  assert.ok(deg(peakPitch) > 6, `rotation peaked at only ${deg(peakPitch)} degrees`)
  assert.ok(
    Math.abs(deg(getAircraftPose(S2.end).pitchRad) - FLYING_POSE.pitchDeg) < 1e-9,
    'the takeoff must settle onto the registered flying pitch',
  )
  assert.equal(getAircraftPose(0).position.y, RUNWAY_POSE.position[1])
})

test('3.6: the gear retracts only after the wheels are off the ground and hides only when stowed', () => {
  const S2 = SECTIONS[1]
  const at = (u) => getAircraftPose(S2.start + (S2.end - S2.start) * u)
  assert.equal(at(0).gearExtension, 1)
  for (let sample = 0; sample <= 400; sample += 1) {
    const pose = at(sample / 400)
    if (pose.gearExtension < 1 - 1e-9) {
      assert.ok(pose.altitude > 0, `the gear started folding at altitude ${pose.altitude}`)
    }
  }
  let previous = 1
  for (let sample = 0; sample <= 400; sample += 1) {
    const extension = at(sample / 400).gearExtension
    assert.ok(extension <= previous + 1e-9, 'the gear must only ever go up')
    previous = extension
  }
  assert.equal(getAircraftPose(S2.end).gearExtension, 0)
})

test('3.7: the aircraft never leaves frame during an exterior shot', () => {
  let worstCoverage = Infinity
  for (let sample = 0; sample <= 2000; sample += 1) {
    const progress = sample / 2000
    // Inside the cabin the subject is the cabin, not the airframe.
    if (progress > 0.465 && progress < 0.83) continue
    const visible = hullLandmarksOnScreen(sampleCamera(progress), ASPECT)
    assert.ok(visible > 0, `no part of the aircraft is in frame at ${progress}`)
    worstCoverage = Math.min(worstCoverage, visible)
  }
  assert.ok(worstCoverage >= 1)
})

test('3.7: screen-space speed stays within budget, which world distance alone cannot show', () => {
  // The budget covers the shots whose declared subject is the aircraft seen
  // from outside. Inside the hull — the threshold crossing, the cabin, the
  // door — the subject is the cabin, and a landmark four metres away sweeps
  // the frame for geometric reasons rather than uncomfortable ones.
  const exteriorBands = CAMERA_SHOT_BANDS.filter((band) => band.end <= 0.42 || band.start >= 0.835)
  assert.ok(exteriorBands.length >= 8, 'the exterior shots must be covered')
  for (const band of exteriorBands) {
    let worst = { value: 0, progress: 0 }
    for (let step = 0; step <= 200; step += 1) {
      const progress = band.start + ((band.end - band.start) * step) / 200
      const speed = landmarkScreenSpeed(progress, AIRCRAFT_LANDMARKS.centre, ASPECT) / 1000
      if (speed > worst.value) worst = { value: speed, progress }
    }
    assert.ok(
      worst.value <= SCREEN_SPEED_LIMITS[band.intent],
      `${band.id} (${band.intent}) sweeps ${worst.value} frame heights per 0.001 at ${worst.progress}`,
    )
  }

  // The run-in carries the largest world-space step on the page and one of
  // the smallest screen-space ones, because it travels along the view axis.
  assert.ok(landmarkScreenSpeed(0.392, AIRCRAFT_LANDMARKS.centre, ASPECT) / 1000 < 0.01)
})

test('3.7: a narrower viewport opens the lens instead of cropping the subject', () => {
  assert.equal(horizontalPreservingFov(45, REFERENCE_ASPECT), 45, 'the reference aspect is left alone')
  assert.equal(horizontalPreservingFov(45, 21 / 9), 45, 'wider than reference is left alone')
  assert.ok(horizontalPreservingFov(45, 4 / 3) > 45, 'a narrower viewport must widen the lens')
  assert.ok(horizontalPreservingFov(35, 0.5) <= 75, 'the compensation is capped')

  // Horizontal field is what the compensation preserves.
  const wide = Math.tan((45 * Math.PI) / 360) * REFERENCE_ASPECT
  const narrowAspect = 4 / 3
  const narrow = Math.tan((horizontalPreservingFov(45, narrowAspect) * Math.PI) / 360) * narrowAspect
  assert.ok(Math.abs(wide - narrow) < 1e-9, `horizontal field ${wide} vs ${narrow}`)

  // And the closing shot keeps the aircraft framed across landscape ratios.
  for (const aspect of [21 / 9, 16 / 9, 4 / 3]) {
    for (const progress of [0.9164, 0.95, 1]) {
      const sample = sampleCamera(progress)
      const adjusted = { ...sample, fov: horizontalPreservingFov(sample.fov, aspect) }
      assert.ok(
        projectToScreen(AIRCRAFT_LANDMARKS.centre, adjusted, aspect).onScreen,
        `aircraft cropped at aspect ${aspect}, progress ${progress}`,
      )
    }
  }
})

test('3.4: the cabin seam is handed over at a matched speed in both directions', () => {
  for (const seam of [0.46, 0.835]) {
    const step = 2e-4
    const before = sampleCamera(seam - step).position.distanceTo(sampleCamera(seam - 2 * step).position) / step
    const after = sampleCamera(seam + step).position.distanceTo(sampleCamera(seam + 2 * step).position) / step
    const relative = Math.abs(after - before) / Math.max(after, before)
    assert.ok(relative < 0.1, `seam at ${seam} steps by ${relative}`)
    assert.ok(sampleCabinRoute(seam) !== null, `the cabin route must own ${seam}`)
  }
})
