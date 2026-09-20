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
  /** Distance along the traversal normal at which the opening starts to form. */
  openDistance: number
  /** Distance short of the plane by which it must be fully open. */
  contactDistance: number
  /** Clearance past the plane, beyond the near-plane corner, before it reseals. */
  clearMargin: number
}

// S4 nose entry — opens a little ahead of the official S4 boundary (0.42) so
// the hole is already forming by the time the camera reaches the skin, and
// reseals shortly into S5 so the hull isn't gaping open for the interior
// walkthrough. Center matches dissolveHullMaterial's default.
export const NOSE_PORTAL: PortalWindow = {
  center: new Vector3(...interiorToWorld([0, 1.6, -4])),
  // 0.38, not 0.40: the camera reaches this plane at 0.42 (keyframe 6 is
  // authored on it), and a gate that only finishes enabling at 0.42 leaves
  // the opening racing the crossing.
  start: 0.38,
  peak: 0.45,
  end: 0.52,
  // A380 fuselage radius is roughly four metres in this registered scene;
  // the former 14-unit opening was larger than the aircraft cross-section
  // and made the trim read as an unexplained screen-space ring.
  maxRadius: 5.2,
  traversalNormal: new Vector3(0, 0, 1),
  frameNearDistance: 30,
  frameFarDistance: 64,
  openDistance: 12,
  contactDistance: 2.4,
  clearMargin: 1.6,
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
  // A doorway, not a nose cone: it opens later and reseals sooner.
  openDistance: 6,
  contactDistance: 1.2,
  clearMargin: 1,
}

const clamp01Ramp = (value: number) => Math.min(1, Math.max(0, value))
function smoothstepRamp(edge0: number, edge1: number, value: number) {
  const t = clamp01Ramp((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * How far the camera has passed through the portal plane, along the
 * direction it is authored to cross in. Negative while approaching.
 */
export function portalSignedDepth(cameraPosition: Vector3, window: PortalWindow): number {
  return (
    (cameraPosition.x - window.center.x) * window.traversalNormal.x +
    (cameraPosition.y - window.center.y) * window.traversalNormal.y +
    (cameraPosition.z - window.center.z) * window.traversalNormal.z
  )
}

/**
 * Distance from the camera origin to the farthest corner of its near plane.
 * The hull cannot reseal while any part of that rectangle is still inside
 * it, which is what leaves a wedge of interior geometry showing through the
 * skin for a frame or two.
 */
export function nearPlaneCornerDistance(fovDeg: number, aspect: number, near: number): number {
  const halfHeight = Math.tan((fovDeg * Math.PI) / 360) * near
  return Math.hypot(near, halfHeight, halfHeight * aspect)
}

/**
 * plan6 4.5 (A14). The opening used to be a triangular ramp on scroll: it
 * peaked at an authored progress whether or not the camera had reached the
 * skin, and closed on a schedule rather than on clearance. It is now derived
 * from the crossing itself — it forms as the camera closes on the plane,
 * holds open while the camera and its near plane are inside, and reseals
 * only once both are clear on the far side. Being a function of position it
 * is automatically symmetric when the visitor scrolls back.
 *
 * The authored progress window survives as an enable gate, so the hull can
 * never open during a section that has no business opening it.
 */
export function portalRadius(
  progress: number,
  window: PortalWindow,
  cameraPosition: Vector3,
  nearCorner: number,
): number {
  const { start, end, maxRadius } = window
  if (progress <= start || progress >= end) return 0
  // Narrative gate, softened at its edges so the ceiling itself never steps.
  const gateWidth = Math.min(0.02, (end - start) / 4)
  const gate = Math.min(
    smoothstepRamp(start, start + gateWidth, progress),
    1 - smoothstepRamp(end - gateWidth, end, progress),
  )
  const depth = portalSignedDepth(cameraPosition, window)
  const opening = smoothstepRamp(-window.openDistance, -window.contactDistance, depth)
  const clear = nearCorner + window.clearMargin
  const resealing = 1 - smoothstepRamp(clear, clear + window.contactDistance, depth)
  return maxRadius * gate * Math.min(opening, resealing)
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
