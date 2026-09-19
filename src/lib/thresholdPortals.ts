import { interiorToWorld, INTERIOR_MANIFEST } from './sceneLayout'
import { Vector3 } from 'three'

export interface PortalWindow {
  center: Vector3
  /** Progress values: ramp opens start->peak, stays near max, closes peak->end. */
  start: number
  peak: number
  end: number
  maxRadius: number
  /** Unit normal pointing in the camera's authored direction through the portal. */
  traversalNormal: Vector3
  /** Frame is fully present inside nearDistance and absent beyond farDistance. */
  frameNearDistance: number
  frameFarDistance: number
}

// S4 nose entry — opens a little ahead of the official S4 boundary (0.42) so
// the hole is already forming by the time the camera reaches the skin, and
// reseals shortly into S5 so the hull isn't gaping open for the interior
// walkthrough. Center matches dissolveHullMaterial's default.
export const NOSE_PORTAL: PortalWindow = {
  center: new Vector3(...interiorToWorld([0, 1.6, -4])),
  start: 0.4,
  peak: 0.45,
  end: 0.52,
  // A380 fuselage radius is roughly four metres in this registered scene;
  // the former 14-unit opening was larger than the aircraft cross-section
  // and made the trim read as an unexplained screen-space ring.
  maxRadius: 5.2,
  traversalNormal: new Vector3(0, 0, 1),
  frameNearDistance: 30,
  frameFarDistance: 64,
}

// S6 exit — the inverse threshold, near where the S6 keyframes break the
// camera back outside close to the upper deck (see cameraPath.ts).
export const EXIT_PORTAL: PortalWindow = {
  // Port-side upper-deck doorway. Camera keyframe 12 meets this exact X/Z
  // plane before keyframe 13 clears laterally, so frame, dissolve and path
  // all describe one physical threshold rather than three nearby effects.
  center: new Vector3(...interiorToWorld(INTERIOR_MANIFEST.anchors.exit)),
  start: 0.79,
  peak: 0.83,
  end: 0.87,
  maxRadius: 1.55,
  traversalNormal: new Vector3(-1, 0, 0),
  // The camera crosses before 0.86. The plane-side gate below removes the
  // frame even while distance is still short.
  frameNearDistance: 12,
  frameFarDistance: 30,
}

/** Triangular ramp: 0 outside [start,end], rising to maxRadius at peak. */
export function portalRadius(progress: number, window: PortalWindow): number {
  const { start, peak, end, maxRadius } = window
  if (progress <= start || progress >= end) return 0
  if (progress <= peak) return (maxRadius * (progress - start)) / (peak - start)
  return (maxRadius * (end - progress)) / (end - peak)
}

const FRAME_FADE = 0.03
const FRAME_ALIGNMENT_FADE_START = 0.18
const FRAME_ALIGNMENT_FULL = 0.62
const FRAME_EXIT_FADE_START = 0.5
const FRAME_EXIT_FADE_END = 1.45

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Visibility for the physical frame combines three independent facts:
 * narrative timing, actual camera distance and whether the camera is looking
 * toward the portal. The old scroll-only envelope left the EXIT ring visible
 * in S6's wide shot. Requiring camera↔portal proximity makes that state
 * impossible while preserving a visible frame at the 0.83 crossing.
 */
export function frameVisibility(
  progress: number,
  window: PortalWindow,
  cameraPosition: Vector3,
  cameraForward: Vector3,
): number {
  const { start, end } = window
  const fadeIn = (progress - (start - FRAME_FADE)) / FRAME_FADE
  const fadeOut = (end + FRAME_FADE - progress) / FRAME_FADE
  const timelineVisibility = clamp01(Math.min(fadeIn, fadeOut))
  if (timelineVisibility <= 0) return 0

  const dx = window.center.x - cameraPosition.x
  const dy = window.center.y - cameraPosition.y
  const dz = window.center.z - cameraPosition.z
  const distance = Math.hypot(dx, dy, dz)
  const distanceVisibility = 1 - smoothstep(window.frameNearDistance, window.frameFarDistance, distance)
  if (distanceVisibility <= 0) return 0

  // At the exact crossing the camera can coincide with the portal center;
  // direction is undefined there, so proximity is the stronger signal.
  const viewAlignment =
    distance < 1e-4 ? 1 : (dx * cameraForward.x + dy * cameraForward.y + dz * cameraForward.z) / distance
  const framingVisibility = smoothstep(FRAME_ALIGNMENT_FADE_START, FRAME_ALIGNMENT_FULL, viewAlignment)

  // Distance cannot distinguish "approaching" from "just crossed": with
  // the continuous B2 path the camera is still only ~20 units away at 0.86.
  // Signed depth against the authored portal plane can. Once the camera has
  // moved a few units through +normal, the frame is behind the traversal and
  // must be absent even if it remains geometrically close.
  const signedDepth =
    (cameraPosition.x - window.center.x) * window.traversalNormal.x +
    (cameraPosition.y - window.center.y) * window.traversalNormal.y +
    (cameraPosition.z - window.center.z) * window.traversalNormal.z
  const crossingSideVisibility = 1 - smoothstep(FRAME_EXIT_FADE_START, FRAME_EXIT_FADE_END, signedDepth)

  return timelineVisibility * distanceVisibility * framingVisibility * crossingSideVisibility
}
