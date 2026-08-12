import { CatmullRomCurve3, Quaternion, Vector3 } from 'three'
import { SECTIONS, getActiveSectionIndex } from './sections'
import { INTERIOR_ANCHORS_WORLD } from './sceneLayout'

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

  // S3 — climb + orbit: arcs from rear-lateral to head-on, with a brief bank
  // (roll) during the turn — the override applied after lookAt. Starts
  // close to kf3 (S2's end) on purpose, so the S2/S3 boundary reads as one
  // continuous reposition rather than a cut.
  { sectionIndex: 2, camPos: [100, 70, -53], camTarget: [0, 35, -72], fov: 42, roll: 6 },
  { sectionIndex: 2, camPos: [0, 60, -220], camTarget: [0, 40, -80], fov: 38, roll: 0 },

  // S4 — threshold: continues head-on, crosses the nose skin (world z=-115)
  // and ends just past it, approaching the real cockpit (world z=-106, from
  // INTERIOR_ANCHORS_WORLD — see sceneLayout.ts).
  { sectionIndex: 3, camPos: [0, 41, -114], camTarget: [0, 39, -102], fov: 42, roll: 0 },
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
  { sectionIndex: 5, camPos: [-110, 55, -20], camTarget: [-72.12, 50.32, -31.96], fov: 42, roll: 0 },
  { sectionIndex: 5, camPos: [-190, 90, 90], camTarget: [-131.5, 74.6, 37.68], fov: 35, roll: 0 },

  // S7 — footer: holds near the wide shot, a touch further back so the
  // ending doesn't read as an exact freeze-frame of S6.
  { sectionIndex: 6, camPos: [-200, 92, 96], camTarget: [-141.05, 76.67, 44.13], fov: 35, roll: 0 },
]

const POSITION_CURVE = new CatmullRomCurve3(KEYFRAMES.map((keyframe) => new Vector3(...keyframe.camPos)))

// Sampling only once per control-point segment measures its chord, not the
// Catmull-Rom arc between the points. A dense table makes getPointAt() truly
// close to constant-speed and, because the division count is an exact
// multiple of the segment count, still gives an exact lookup for every
// authored keyframe.
const ARC_SAMPLES_PER_SEGMENT = 512
const ARC_LENGTH_DIVISIONS = (KEYFRAMES.length - 1) * ARC_SAMPLES_PER_SEGMENT
POSITION_CURVE.arcLengthDivisions = ARC_LENGTH_DIVISIONS

function buildKeyframeArcLengthU(curve: CatmullRomCurve3): number[] {
  const cumulative = curve.getLengths(ARC_LENGTH_DIVISIONS)
  const total = cumulative[cumulative.length - 1]
  return KEYFRAMES.map((_, index) => cumulative[index * ARC_SAMPLES_PER_SEGMENT] / total)
}

const POSITION_U = buildKeyframeArcLengthU(POSITION_CURVE)
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

export type InteriorZoneKey = 'cockpit' | 'economy' | 'stair' | 'upperDeck'

interface CameraTraversalBand {
  start: number
  end: number
  fromIndex: number
  toIndex: number
  zone?: InteriorZoneKey
}

const INTERIOR_SECTION = SECTIONS[4]
const interiorTime = (localProgress: number) =>
  localProgress <= 0
    ? INTERIOR_SECTION.start
    : localProgress >= 1
      ? INTERIOR_SECTION.end
      : INTERIOR_SECTION.start + (INTERIOR_SECTION.end - INTERIOR_SECTION.start) * localProgress

/**
 * One gap-free global traversal. Every moving band joins adjacent authored
 * keyframes; a dwell repeats one keyframe over a non-zero scroll interval.
 * Section boundaries therefore choose narrative timing, never disjoint
 * pieces of curve:
 *
 * - S2 absorbs the hero-to-tracking transition.
 * - S3 reaches the threshold approach before S4 begins.
 * - S4 lands in the cockpit exactly as S5 begins.
 * - S5 gives all four zones, including upper deck, a real hold.
 * - S6 turns through the exit before its long cinematic pull-back.
 */
const CAMERA_TRAVERSAL: readonly CameraTraversalBand[] = [
  { start: 0, end: 0.12, fromIndex: 0, toIndex: 1 },
  { start: 0.12, end: 0.18, fromIndex: 1, toIndex: 2 },
  { start: 0.18, end: 0.28, fromIndex: 2, toIndex: 3 },
  { start: 0.28, end: 0.3, fromIndex: 3, toIndex: 4 },
  { start: 0.3, end: 0.378, fromIndex: 4, toIndex: 5 },
  { start: 0.378, end: 0.42, fromIndex: 5, toIndex: 6 },
  { start: 0.42, end: 0.46, fromIndex: 6, toIndex: 7 },
  { start: 0.46, end: 0.5, fromIndex: 7, toIndex: 8 },

  { start: interiorTime(0), end: interiorTime(0.1), fromIndex: 8, toIndex: 8, zone: 'cockpit' },
  { start: interiorTime(0.1), end: interiorTime(0.28), fromIndex: 8, toIndex: 9 },
  { start: interiorTime(0.28), end: interiorTime(0.4), fromIndex: 9, toIndex: 9, zone: 'economy' },
  { start: interiorTime(0.4), end: interiorTime(0.64), fromIndex: 9, toIndex: 10 },
  { start: interiorTime(0.64), end: interiorTime(0.72), fromIndex: 10, toIndex: 10, zone: 'stair' },
  { start: interiorTime(0.72), end: interiorTime(0.88), fromIndex: 10, toIndex: 11 },
  { start: interiorTime(0.88), end: interiorTime(1), fromIndex: 11, toIndex: 11, zone: 'upperDeck' },

  { start: 0.82, end: 0.83, fromIndex: 11, toIndex: 12 },
  { start: 0.83, end: 0.835, fromIndex: 12, toIndex: 13 },
  { start: 0.835, end: 0.88, fromIndex: 13, toIndex: 14 },
  { start: 0.88, end: 0.95, fromIndex: 14, toIndex: 15 },
  { start: 0.95, end: 1, fromIndex: 15, toIndex: 16 },
]

function assertValidTraversal() {
  const first = CAMERA_TRAVERSAL[0]
  const last = CAMERA_TRAVERSAL[CAMERA_TRAVERSAL.length - 1]
  if (first.start !== 0 || first.fromIndex !== 0 || last.end !== 1 || last.toIndex !== KEYFRAMES.length - 1) {
    throw new Error('Camera traversal must cover global progress [0, 1]')
  }

  for (let index = 0; index < CAMERA_TRAVERSAL.length; index += 1) {
    const band = CAMERA_TRAVERSAL[index]
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
      const previous = CAMERA_TRAVERSAL[index - 1]
      if (band.start !== previous.end || band.fromIndex !== previous.toIndex) {
        throw new Error(`Camera traversal has a gap before band ${index}`)
      }
    }
  }
}

assertValidTraversal()

const ACCELERATION_SHARE = 0.02

/**
 * Integrates a cosine-ramped velocity profile: zero speed at either end,
 * constant cruise speed through the middle. Unlike smoothstep, its short
 * acceleration shoulders only raise peak speed by ~6.4%, which keeps the
 * long S3/S6 moves below the 3-unit sampling budget.
 */
function traversalEase(value: number) {
  const t = Math.min(1, Math.max(0, value))
  const ramp = ACCELERATION_SHARE
  const normalization = 1 - ramp

  if (t < ramp) {
    return (0.5 * t - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * t) / ramp)) / normalization
  }
  if (t > 1 - ramp) {
    const remaining = 1 - t
    return 1 - (0.5 * remaining - (ramp / (2 * Math.PI)) * Math.sin((Math.PI * remaining) / ramp)) / normalization
  }
  return (t - ramp / 2) / normalization
}

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, progress))
}

function traversalSample(progress: number) {
  const clamped = clampProgress(progress)
  const band =
    CAMERA_TRAVERSAL.find((candidate) => clamped >= candidate.start && clamped < candidate.end) ??
    CAMERA_TRAVERSAL[CAMERA_TRAVERSAL.length - 1]
  const local = (clamped - band.start) / (band.end - band.start)
  return { band, t: traversalEase(local) }
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
  const { band, t } = traversalSample(progress)
  const from = KEYFRAMES[band.fromIndex]
  const to = KEYFRAMES[band.toIndex]
  const positionU = POSITION_U[band.fromIndex] + (POSITION_U[band.toIndex] - POSITION_U[band.fromIndex]) * t
  const position = POSITION_CURVE.getPointAt(positionU)

  const lookRotation = new Quaternion()
  if (band.toIndex !== band.fromIndex) {
    lookRotation.slerpQuaternions(IDENTITY_ROTATION, LOOK_ROTATIONS[band.fromIndex], t)
  }
  const lookDirection = LOOK_DIRECTIONS[band.fromIndex].clone().applyQuaternion(lookRotation).normalize()
  const lookDistance = LOOK_DISTANCES[band.fromIndex] + (LOOK_DISTANCES[band.toIndex] - LOOK_DISTANCES[band.fromIndex]) * t
  const target = position.clone().addScaledVector(lookDirection, lookDistance)
  const fov = from.fov + (to.fov - from.fov) * t
  const rollDeg = from.roll + (to.roll - from.roll) * t

  return { position, target, fov, rollRad: (rollDeg * Math.PI) / 180 }
}
