import { CatmullRomCurve3, Vector3 } from 'three'
import { SECTIONS, getActiveSectionIndex, localProgress } from './sections'
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
  { sectionIndex: 5, camPos: [20, 50, -45], camTarget: [0, 40.95, -58], fov: 42, roll: 0 },
  { sectionIndex: 5, camPos: [190, 90, 90], camTarget: [0, 40, -80], fov: 35, roll: 0 },

  // S7 — footer: holds near the wide shot, a touch further back so the
  // ending doesn't read as an exact freeze-frame of S6.
  { sectionIndex: 6, camPos: [200, 92, 96], camTarget: [0, 40, -80], fov: 35, roll: 0 },
]

const posCurve = new CatmullRomCurve3(KEYFRAMES.map((k) => new Vector3(...k.camPos)))
const targetCurve = new CatmullRomCurve3(KEYFRAMES.map((k) => new Vector3(...k.camTarget)))

// Arc-length position, 0..1, of each keyframe *along its own curve* —
// `getLengths(N-1)` samples cumulative length at exactly the keyframes'
// raw parametric positions (t = i/(N-1)), which is where CatmullRomCurve3
// places control point i. Position and target are two *different* curves
// with two different shapes, so each needs its own table: reusing
// position's u to sample the target curve looked plausible but landed on
// the wrong points entirely (caught in the Fase 2 Playwright review — the
// look-at target was nowhere near the intended keyframe at a section
// boundary, even though the position was fine).
function buildArcLengthU(curve: CatmullRomCurve3): number[] {
  const cumulative = curve.getLengths(KEYFRAMES.length - 1)
  const total = cumulative[cumulative.length - 1]
  return cumulative.map((len) => len / total)
}

const POS_U = buildArcLengthU(posCurve)
const TARGET_U = buildArcLengthU(targetCurve)

interface SectionSpan {
  firstIndex: number
  lastIndex: number
  first: CameraKeyframe
  last: CameraKeyframe
}

const SECTION_SPANS: SectionSpan[] = SECTIONS.map((section) => {
  const indices = KEYFRAMES.reduce<number[]>((acc, k, i) => {
    if (k.sectionIndex === section.index) acc.push(i)
    return acc
  }, [])
  const firstIndex = indices[0]
  const lastIndex = indices[indices.length - 1]
  return { firstIndex, lastIndex, first: KEYFRAMES[firstIndex], last: KEYFRAMES[lastIndex] }
})

export interface SampledCamera {
  position: Vector3
  target: Vector3
  fov: number
  rollRad: number
}

/**
 * Samples the camera curve at global scroll progress (0..1).
 *
 * Two things have to both be true, and they pull in different directions:
 *
 * 1. Uses `getPointAt`, not `getPoint`. `getPointAt` is reparametrized by
 *    arc length, so equal steps in curve-`u` move the camera equal
 *    *distances* along the curve. `getPoint` uses raw parametric `t`
 *    (keyframe-index fraction), which speeds up and slows down wherever
 *    keyframes happen to sit closer together or further apart — a bug that
 *    reads as "the easing is wrong" and sends you looking in the wrong
 *    place.
 *
 * 2. Section boundaries have to land exactly on §3's scroll percentages —
 *    the aircraft's own pose (aircraftPose.ts) is driven by section-local
 *    progress, and if the camera's curve-`u` were fed raw scroll progress
 *    directly, a section's share of *arc length* rarely matches its share
 *    of *scroll*, so the camera and the aircraft drift out of sync (this
 *    was caught during the Fase 2 Playwright review: the camera ended up
 *    clipped inside the fuselage mid-S2, well before the S4 threshold).
 *
 * The fix: remap scroll progress to curve-`u` piecewise, per section, using
 * each section's own [firstKeyframe, lastKeyframe] arc-length span — looked
 * up separately in POS_U and TARGET_U, since position and target need their
 * own u for the reason in the comment on buildArcLengthU above. Within a
 * section this is still a `getPointAt`-style constant-speed traversal —
 * just of that section's stretch of each curve, not the whole thing — and
 * section-local progress (the same value driving the aircraft) maps 1:1 to
 * how far through that stretch both the position and the target are.
 */
const WALKTHROUGH_PLATEAUS = [
  { start: 0, end: 0.12, from: 0, to: 0 },
  { start: 0.12, end: 0.38, from: 0, to: 1 / 3 },
  { start: 0.38, end: 0.5, from: 1 / 3, to: 1 / 3 },
  { start: 0.5, end: 0.76, from: 1 / 3, to: 2 / 3 },
  { start: 0.76, end: 0.88, from: 2 / 3, to: 2 / 3 },
  { start: 0.88, end: 1, from: 2 / 3, to: 1 },
] as const

function smoothstep01(value: number) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

/**
 * Gives S5 extra scroll dwell at cockpit, stair and upper-deck anchors.
 * Movement still starts and ends at exactly the same keyframes; only the
 * local time spent at each zone changes.
 */
export function walkthroughProgress(progress: number) {
  const band = WALKTHROUGH_PLATEAUS.find((candidate) => progress <= candidate.end) ?? WALKTHROUGH_PLATEAUS[WALKTHROUGH_PLATEAUS.length - 1]
  const span = band.end - band.start
  const local = span > 0 ? (progress - band.start) / span : 0
  const eased = smoothstep01(local)
  return band.from + (band.to - band.from) * eased
}

export function sampleCamera(progress: number): SampledCamera {
  const sectionIndex = getActiveSectionIndex(progress)
  const section = SECTIONS[sectionIndex]
  const span = SECTION_SPANS[sectionIndex]
  const t = localProgress(progress, section)
  const pathT = sectionIndex === 4 ? walkthroughProgress(t) : t

  const posU = POS_U[span.firstIndex] + (POS_U[span.lastIndex] - POS_U[span.firstIndex]) * t
  const targetU = TARGET_U[span.firstIndex] + (TARGET_U[span.lastIndex] - TARGET_U[span.firstIndex]) * pathT

  const position = posCurve.getPointAt(posU)
  const target = targetCurve.getPointAt(targetU)
  const fov = span.first.fov + (span.last.fov - span.first.fov) * pathT
  const rollDeg = span.first.roll + (span.last.roll - span.first.roll) * pathT

  return { position, target, fov, rollRad: (rollDeg * Math.PI) / 180 }
}
