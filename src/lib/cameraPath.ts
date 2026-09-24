import { CatmullRomCurve3, Quaternion, Vector3 } from 'three'
import { SECTIONS, getActiveSectionIndex } from './sections'
import { FLYING_POSE, INTERIOR_ANCHORS_WORLD, interiorToWorld } from './sceneLayout'
import { cabinRouteSpeed, sampleCabinRoute } from './cabinRoute'
import { createMotionProfile, type MotionKnot } from './motionProfile'
import { allocateShotSpans, ROTATION_COST_PER_RADIAN, SHOT_SHEET, type InteriorZoneKey, type ShotBand } from './shotSheet'

export type { InteriorZoneKey } from './shotSheet'

export interface CameraKeyframe {
  sectionIndex: number
  camPos: readonly [number, number, number]
  camTarget: readonly [number, number, number]
  fov: number
  /** Degrees, applied as an extra rotation *after* lookAt — see CameraRig.tsx. */
  roll: number
}

// One global, ordered list of keyframes spanning all 7 scroll-driven
// sections (S1..S7 — S0 loading precedes scroll and isn't part of this
// curve). Placeholder coordinates: loose meters-ish scale matching
// sceneLayout.ts, not final art-directed values — tune these after looking
// at the Playwright screenshots, not by re-deriving them on paper.
export const KEYFRAMES: CameraKeyframe[] = [
  // S1 — hero: ~80m out, 3/4 front-low, near-static with a slow drift.
  { sectionIndex: 0, camPos: [60, 8, 55], camTarget: [0, 6, 0], fov: 45, roll: 0 },
  { sectionIndex: 0, camPos: [58, 8, 52], camTarget: [0, 6, 0], fov: 45, roll: 0 },

  // S2 — taxi/rotate: lateral tracking shot, retreating and rising to
  // accompany the climb-out as the aircraft interpolates to its flying pose.
  // Distance matters here more than it looks like it should: the wing
  // placeholder is 80 units wide (§ AircraftPlaceholder), so anything
  // closer than ~100-120 units puts it outside the frame's margins and it
  // reads as a flat slab filling the screen rather than a wing — caught by
  // the first two Playwright passes, both distance *and* height above the
  // wing plane were short.
  { sectionIndex: 1, camPos: [75, 45, 35], camTarget: [0, 12, -15], fov: 45, roll: 0 },
  { sectionIndex: 1, camPos: [100, 70, -50], camTarget: [0, 35, -70], fov: 42, roll: 0 },

  // S3 — climb + orbit: arcs from rear-lateral to head-on. The bank through
  // the turn is authored on the orbit *shot* (shotSheet.ts `bankDegrees`),
  // not here: this keyframe sits three metres from the last one, so once
  // scroll is handed out by traversal cost it owns barely a tenth of a
  // percent of the page, and a six-degree roll authored across it snapped
  // over about seven pixels of scroll instead of banking through the turn.
  { sectionIndex: 2, camPos: [100, 70, -53], camTarget: [0, 35, -72], fov: 42, roll: 0 },
  { sectionIndex: 2, camPos: [0, 60, -220], camTarget: [0, 40, -80], fov: 38, roll: 0 },

  // S4 — threshold: continues head-on, crosses the nose skin (world z=-115)
  // and ends just past it, approaching the real cockpit (world z=-106, from
  // INTERIOR_ANCHORS_WORLD — see sceneLayout.ts).
  // fov 45, not 42: the lens has to reach the cabin's 50 by the seam at
  // 0.46, and doing the whole 42→50 inside S4's four metres made the focal
  // change the fastest scalar on the page. Starting to open during the
  // run-in splits it into two comparable halves.
  { sectionIndex: 3, camPos: [0, 41, -114], camTarget: [0, 39, -102], fov: 45, roll: 0 },
  { sectionIndex: 3, camPos: [0, 39, -110], camTarget: [0, 38.5, -98], fov: 50, roll: 0 },

  // S5 — interior walkthrough, v1 scope (§12.3): cockpit → economy →
  // staircase → upper deck, routed through the real anchor points from
  // interior_blockout.py (INTERIOR_ANCHORS_WORLD), not hand-guessed
  // placeholder stops — this asset is real geometry as of Fase 3, no longer
  // a box. Eye height ~1.6 above each zone's floor anchor. +Z is "toward the
  // tail" throughout (see sceneLayout.ts), so every target below is a
  // small positive offset past its own position — looking ahead down the
  // cabin, never back toward the nose.
  {
    sectionIndex: 4,
    camPos: [0, 38.5, INTERIOR_ANCHORS_WORLD.cockpit[2] + 4],
    camTarget: [0, 38.5, INTERIOR_ANCHORS_WORLD.economy[2] + 5],
    fov: 50,
    roll: 0,
  },
  {
    sectionIndex: 4,
    camPos: [0, 38.5, INTERIOR_ANCHORS_WORLD.economy[2] + 13],
    camTarget: [0, 38.5, INTERIOR_ANCHORS_WORLD.stair[2] + 3],
    fov: 48,
    roll: 0,
  },
  {
    sectionIndex: 4,
    camPos: [0.6, 39.5, INTERIOR_ANCHORS_WORLD.stair[2] + 3],
    camTarget: [0.6, 40.9, INTERIOR_ANCHORS_WORLD.upperDeck[2] + 9],
    fov: 46,
    roll: 0,
  },
  {
    sectionIndex: 4,
    camPos: [0, 40.95, INTERIOR_ANCHORS_WORLD.upperDeck[2] + 9],
    camTarget: [0, 40.95, INTERIOR_ANCHORS_WORLD.upperDeck[2] + 14],
    fov: 45,
    roll: 0,
  },

  // S6 — exit + pull back: breaks back outside near the upper deck exit,
  // then retreats to a wide cinematic shot of the aircraft in flight —
  // same generous-distance reasoning as S2/S3 above.
  // First meet the port upper-deck doorway on its own beat, then clear the
  // fuselage laterally. Separating approach from pull-back keeps the frame
  // readable during the crossing and reserves the right third for copy.
  { sectionIndex: 5, camPos: [0, 40.95, -61], camTarget: [-2.75, 40.4, -53.8], fov: 45, roll: 0 },
  { sectionIndex: 5, camPos: [-2.75, 41.05, -53.8], camTarget: [-3.65, 41, -47.05], fov: 44, roll: 0 },
  // Port-quarter *aft*, not abeam. The camera leaves the door facing port,
  // so the size of the turn back onto the aircraft is decided by where this
  // keyframe sits: abeam at [-110, 55, -20] the aircraft lies 160° round
  // from the exit heading, and S6 does not have the scroll to turn that far
  // at a comfortable rate. Aft of the tail the aircraft is forward and to
  // starboard instead, which is 125° — and it reads as watching the
  // aircraft depart rather than orbiting it.
  { sectionIndex: 5, camPos: [-70, 50, 30], camTarget: [0, 42, -70], fov: 38, roll: 0 },
  // 198 m out, not 262: at the old distance the retreat consumed most of
  // S6's scroll and the wingspan covered 26% of frame width against 35%
  // here.
  { sectionIndex: 5, camPos: [-140, 78, 55], camTarget: [0, 41, -80], fov: 35, roll: 0 },

  // S7 — footer: holds near the wide shot, a touch further back so the
  // ending doesn't read as an exact freeze-frame of S6.
  { sectionIndex: 6, camPos: [-147, 79.5, 59], camTarget: [0, 41, -80], fov: 35, roll: 0 },
]

// Registration-only changes in round 6. Exterior shot timing remains phase 3.
KEYFRAMES[6].camPos = interiorToWorld([0, 1.1, -4])
KEYFRAMES[6].camTarget = interiorToWorld([0, 1.1, 2])
KEYFRAMES[7].camPos = interiorToWorld([0, 1.1, 0])
KEYFRAMES[7].camTarget = interiorToWorld([0, 1.1, 4])
for (const [index, p] of [[8,.5],[9,.608],[10,.718],[11,.8],[12,.83],[13,.835]]) {
  const sample = sampleCabinRoute(p)!
  KEYFRAMES[index].camPos = sample.position.toArray() as [number,number,number]
  KEYFRAMES[index].camTarget = sample.target.toArray() as [number,number,number]
  KEYFRAMES[index].fov = sample.fov
}

// Target distance is not a camera channel. Normalize the exterior exit's
// look rays to match the cabin so target diagnostics measure motion, not
// arbitrary 5→60 metre look-ray interpolation (orientation is unchanged).
for (let i = 14; i < KEYFRAMES.length; i++) {
  const k = KEYFRAMES[i], p = new Vector3(...k.camPos)
  k.camTarget = new Vector3(...k.camTarget).sub(p).normalize().multiplyScalar(5).add(p).toArray() as [number,number,number]
}

// plan6 3.3: two bounded position curves instead of one global spline.
// A Catmull-Rom control point steers the tangents of its neighbours, so
// while all seventeen keyframes shared a curve the cabin's own interior
// keyframes were bending the nose approach and the exit break-out — the
// exact "keyframes exteriores lejanos deforman el tramo de puerta" the plan
// names. The cabin route (cabinRoute.ts) owns position between the two seams
// and both seam keyframes are authored to its endpoints, so splitting here
// costs no continuity and removes the cross-talk entirely.
const APPROACH_FIRST = 0
const APPROACH_LAST = 7
const EXIT_FIRST = 13
const EXIT_LAST = 16
const CABIN_START = 0.46
const CABIN_END = 0.835

// Sampling only once per control-point segment measures its chord, not the
// Catmull-Rom arc between the points. A dense table makes getPointAt() truly
// close to constant-speed and, because the division count is an exact
// multiple of the segment count, still gives an exact lookup for every
// authored keyframe.
const ARC_SAMPLES_PER_SEGMENT = 512

interface BoundedCurve {
  first: number
  last: number
  curve: CatmullRomCurve3
  /** Arc-length u per keyframe index, offset by `first`. */
  u: number[]
  length: number
}

function buildBoundedCurve(first: number, last: number): BoundedCurve {
  const points = KEYFRAMES.slice(first, last + 1).map((keyframe) => new Vector3(...keyframe.camPos))
  const curve = new CatmullRomCurve3(points)
  const divisions = (points.length - 1) * ARC_SAMPLES_PER_SEGMENT
  curve.arcLengthDivisions = divisions
  const cumulative = curve.getLengths(divisions)
  const total = cumulative[cumulative.length - 1]
  return {
    first,
    last,
    curve,
    u: points.map((_, index) => cumulative[index * ARC_SAMPLES_PER_SEGMENT] / total),
    length: total,
  }
}

const APPROACH_CURVE = buildBoundedCurve(APPROACH_FIRST, APPROACH_LAST)
const EXIT_CURVE = buildBoundedCurve(EXIT_FIRST, EXIT_LAST)

function curveFor(fromIndex: number, toIndex: number): BoundedCurve | null {
  if (toIndex <= APPROACH_LAST) return APPROACH_CURVE
  if (fromIndex >= EXIT_FIRST) return EXIT_CURVE
  return null
}

const AIRCRAFT_CENTRE = new Vector3(...FLYING_POSE.position)

const LOOK_DIRECTIONS = KEYFRAMES.map((keyframe) =>
  new Vector3(...keyframe.camTarget).sub(new Vector3(...keyframe.camPos)).normalize(),
)
const LOOK_DISTANCES = KEYFRAMES.map((keyframe) =>
  new Vector3(...keyframe.camTarget).distanceTo(new Vector3(...keyframe.camPos)),
)
const LOOK_ROTATIONS = LOOK_DIRECTIONS.slice(0, -1).map((direction, index) =>
  new Quaternion().setFromUnitVectors(direction, LOOK_DIRECTIONS[index + 1]),
)
const IDENTITY_ROTATION = new Quaternion()

/**
 * Where a subject-tracking shot looks: the point on its closing keyframe's
 * look ray at the aircraft's distance, so tracking it ends on exactly that
 * keyframe's direction and the next shot starts without a turn step.
 */
const SUBJECT_POINTS = KEYFRAMES.map((keyframe, index) => {
  const position = new Vector3(...keyframe.camPos)
  const distance = position.distanceTo(AIRCRAFT_CENTRE)
  return position.addScaledVector(LOOK_DIRECTIONS[index], distance)
})

const INTERIOR_SECTION = SECTIONS[4]

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

/**
 * Traversal cost for one shot: metres travelled plus the distance a radian of
 * look-direction change is declared to be worth. Scroll is then handed out in
 * proportion to this, so a 195-metre orbit through 97 degrees and a
 * three-metre reposition can no longer receive comparable amounts of it
 * (plan6 3.2). Bands on a bounded curve measure real arc length; bands the
 * cabin route owns are integrated from that route so the two systems agree
 * about how far the camera actually goes.
 */
function shotCost(fromIndex: number, toIndex: number, authoredStart: number, authoredEnd: number): number {
  if (fromIndex === toIndex) return 0

  const curve = curveFor(fromIndex, toIndex)
  if (curve) {
    const length = (curve.u[toIndex - curve.first] - curve.u[fromIndex - curve.first]) * curve.length
    const turn = LOOK_DIRECTIONS[fromIndex].angleTo(LOOK_DIRECTIONS[toIndex])
    return length + ROTATION_COST_PER_RADIAN * turn
  }

  const steps = 192
  let length = 0
  let turn = 0
  let previous = sampleCabinRoute(authoredStart)
  for (let step = 1; step <= steps; step += 1) {
    const sample = sampleCabinRoute(authoredStart + ((authoredEnd - authoredStart) * step) / steps)
    if (!sample || !previous) break
    length += sample.position.distanceTo(previous.position)
    turn += previous.target
      .clone()
      .sub(previous.position)
      .normalize()
      .angleTo(sample.target.clone().sub(sample.position).normalize())
    previous = sample
  }
  return length + ROTATION_COST_PER_RADIAN * turn
}

/** Authored scroll spans, known before allocation for every pinned shot. */
const AUTHORED_SPANS = (() => {
  const spans: Array<{ start: number; end: number }> = []
  let cursor = 0
  for (const shot of SHOT_SHEET) {
    const end = shot.authoredEnd ?? Number.NaN
    spans.push({ start: cursor, end })
    if (shot.authoredEnd !== undefined) cursor = shot.authoredEnd
  }
  return spans
})()

const BANDS: readonly ShotBand[] = allocateShotSpans(
  SHOT_SHEET.map((shot, index) =>
    shotCost(shot.fromIndex, shot.toIndex, AUTHORED_SPANS[index].start, AUTHORED_SPANS[index].end),
  ),
)

function assertValidTraversal() {
  const first = BANDS[0]
  const last = BANDS[BANDS.length - 1]
  if (first.start !== 0 || first.fromIndex !== 0 || last.end !== 1 || last.toIndex !== KEYFRAMES.length - 1) {
    throw new Error('Camera traversal must cover global progress [0, 1]')
  }

  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index]
    if (band.end <= band.start || band.toIndex < band.fromIndex || band.toIndex - band.fromIndex > 1) {
      throw new Error(`Invalid camera traversal band at index ${index}`)
    }
    if (
      band.zone &&
      (band.fromIndex !== band.toIndex || band.start < INTERIOR_SECTION.start || band.end > INTERIOR_SECTION.end)
    ) {
      throw new Error(`Interior zone must be an S5 dwell at band ${index}`)
    }
    if (index > 0) {
      const previous = BANDS[index - 1]
      if (band.start !== previous.end || band.fromIndex !== previous.toIndex) {
        throw new Error(`Camera traversal has a gap before band ${index}`)
      }
    }
  }
}

assertValidTraversal()

const BAND_COSTS = BANDS.map((band) => shotCost(band.fromIndex, band.toIndex, band.start, band.end))
const CUMULATIVE_COST = BAND_COSTS.reduce<number[]>(
  (accumulator, cost) => [...accumulator, accumulator[accumulator.length - 1] + cost],
  [0],
)
const MOTION_KNOTS: MotionKnot[] = [
  { progress: 0, cost: 0 },
  ...BANDS.map((band, index) => ({ progress: band.end, cost: CUMULATIVE_COST[index + 1] })),
]

/**
 * Linear speed the cabin route hands over at a seam, converted into this
 * traversal's cost units by the adjacent band's own length-to-cost ratio.
 * Matching *linear* speed is what removes the visible lurch: the cabin's own
 * cost is rotation-heavy at the cockpit turn, so matching cost rate there
 * would accelerate the exterior approach into the nose rather than settle it.
 */
function cabinSeamTangent(bandIndex: number, seam: number): number {
  const linearRate = cabinRouteSpeed(seam)
  const cost = BAND_COSTS[bandIndex]
  if (cost <= 0) return Number.NaN
  const curve = curveFor(BANDS[bandIndex].fromIndex, BANDS[bandIndex].toIndex)
  if (!curve) return Number.NaN
  const length =
    (curve.u[BANDS[bandIndex].toIndex - curve.first] - curve.u[BANDS[bandIndex].fromIndex - curve.first]) * curve.length
  return linearRate / (length / cost)
}

const CABIN_ENTRY_BAND = BANDS.findIndex((band) => band.end === CABIN_START)
const CABIN_EXIT_BAND = BANDS.findIndex((band) => band.start === CABIN_END)

const SEAM_TANGENTS: Record<number, number> = {}
const entryTangent = cabinSeamTangent(CABIN_ENTRY_BAND, CABIN_START)
if (Number.isFinite(entryTangent)) SEAM_TANGENTS[CABIN_ENTRY_BAND + 1] = entryTangent
const exitTangent = cabinSeamTangent(CABIN_EXIT_BAND, CABIN_END)
if (Number.isFinite(exitTangent)) SEAM_TANGENTS[CABIN_EXIT_BAND] = exitTangent

const MOTION_PROFILE = createMotionProfile(MOTION_KNOTS, SEAM_TANGENTS)

function bandIndexAt(progress: number) {
  for (let index = 0; index < BANDS.length; index += 1) {
    if (progress >= BANDS[index].start && progress < BANDS[index].end) return index
  }
  return BANDS.length - 1
}

function traversalSample(progress: number) {
  const clamped = clampProgress(progress)
  const index = bandIndexAt(clamped)
  const band = BANDS[index]
  const span = CUMULATIVE_COST[index + 1] - CUMULATIVE_COST[index]
  const t = span > 0 ? Math.min(1, Math.max(0, (MOTION_PROFILE.cost(clamped) - CUMULATIVE_COST[index]) / span)) : 0
  return { band, t }
}

/** Authored shot bands with their derived scroll spans — the diagnostic view of §3.1's sheet. */
export const CAMERA_SHOT_BANDS: readonly ShotBand[] = BANDS

/** Traversal cost consumed per unit of scroll. Zero only inside an authored dwell. */
export function cameraTraversalSpeed(progress: number): number {
  return MOTION_PROFILE.speed(clampProgress(progress))
}

/** Global progress at which the camera reaches each authored keyframe. */
export function keyframeArrivalProgress(): number[] {
  const arrivals = new Array<number>(KEYFRAMES.length).fill(Number.NaN)
  arrivals[0] = 0
  for (const band of BANDS) if (band.toIndex !== band.fromIndex) arrivals[band.toIndex] = band.end
  return arrivals
}

/** A testable 0..1 coordinate proving that the authored path is traversed in order. */
export function cameraTraversalProgress(globalProgress: number) {
  const { band, t } = traversalSample(globalProgress)
  return (band.fromIndex + (band.toIndex - band.fromIndex) * t) / (KEYFRAMES.length - 1)
}

/**
 * The sole interior-zone API. Its input is global document progress and it
 * cannot return an S5 zone while another section is active.
 */
export function getInteriorZone(globalProgress: number): InteriorZoneKey | null {
  const progress = clampProgress(globalProgress)
  if (getActiveSectionIndex(progress) !== INTERIOR_SECTION.index) return null
  return traversalSample(progress).band.zone ?? null
}

export interface SampledCamera {
  position: Vector3
  target: Vector3
  fov: number
  rollRad: number
}

/** Samples the continuous camera traversal at global scroll progress. */
export function sampleCamera(progress: number): SampledCamera {
  const cabin = sampleCabinRoute(progress)
  if (cabin) return cabin
  const { band, t } = traversalSample(progress)
  const from = KEYFRAMES[band.fromIndex]
  const to = KEYFRAMES[band.toIndex]
  const curve = curveFor(band.fromIndex, band.toIndex) ?? APPROACH_CURVE
  const uFrom = curve.u[Math.min(Math.max(band.fromIndex - curve.first, 0), curve.u.length - 1)]
  const uTo = curve.u[Math.min(Math.max(band.toIndex - curve.first, 0), curve.u.length - 1)]
  const position = curve.curve.getPointAt(uFrom + (uTo - uFrom) * t)

  const lookRotation = new Quaternion()
  if (band.toIndex !== band.fromIndex) {
    lookRotation.slerpQuaternions(IDENTITY_ROTATION, LOOK_ROTATIONS[band.fromIndex], t)
  }
  const lookDirection = LOOK_DIRECTIONS[band.fromIndex].clone().applyQuaternion(lookRotation).normalize()
  if (band.trackSubject) {
    const [start, end, skew = 1] = band.trackSubject
    const u = Math.min(1, Math.max(0, (t - start) / (end - start))) ** skew
    const weight = u * u * (3 - 2 * u)
    const toSubject = SUBJECT_POINTS[band.toIndex].clone().sub(position).normalize()
    const handOver = new Quaternion().setFromUnitVectors(lookDirection, toSubject)
    lookDirection.applyQuaternion(IDENTITY_ROTATION.clone().slerp(handOver, weight)).normalize()
  }
  const lookDistance = LOOK_DISTANCES[band.fromIndex] + (LOOK_DISTANCES[band.toIndex] - LOOK_DISTANCES[band.fromIndex]) * t
  const target = position.clone().addScaledVector(lookDirection, lookDistance)
  // A lens change is its own move, not a by-product of how fast the camera
  // happens to be travelling. Easing it inside the shot puts zero focal
  // rate at both ends, so the threshold's 42→50 opening no longer does most
  // of its work in the first few pixels of S4 while the camera is still
  // carrying speed out of the run-in.
  const fovEase = t * t * (3 - 2 * t)
  const fov = from.fov + (to.fov - from.fov) * fovEase
  // sin², not sin: its derivative vanishes at both ends, so the bank enters
  // and leaves the turn without a roll-rate step at the shot boundary.
  const bank = band.bankDegrees ? band.bankDegrees * Math.sin(Math.PI * t) ** 2 : 0
  const rollDeg = from.roll + (to.roll - from.roll) * t + bank

  return { position, target, fov, rollRad: (rollDeg * Math.PI) / 180 }
}
