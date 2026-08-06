import { Vector3 } from 'three'

export interface PortalWindow {
  center: Vector3
  /** Progress values: ramp opens start->peak, stays near max, closes peak->end. */
  start: number
  peak: number
  end: number
  maxRadius: number
}

// S4 nose entry — opens a little ahead of the official S4 boundary (0.42) so
// the hole is already forming by the time the camera reaches the skin, and
// reseals shortly into S5 so the hull isn't gaping open for the interior
// walkthrough. Center matches dissolveHullMaterial's default.
export const NOSE_PORTAL: PortalWindow = {
  center: new Vector3(0, 40, -114),
  start: 0.4,
  peak: 0.45,
  end: 0.52,
  maxRadius: 14,
}

// S6 exit — the inverse threshold, near where the S6 keyframes break the
// camera back outside close to the upper deck (see cameraPath.ts).
export const EXIT_PORTAL: PortalWindow = {
  center: new Vector3(0, 44, -52),
  start: 0.79,
  peak: 0.83,
  end: 0.87,
  maxRadius: 14,
}

/** Triangular ramp: 0 outside [start,end], rising to maxRadius at peak. */
export function portalRadius(progress: number, window: PortalWindow): number {
  const { start, peak, end, maxRadius } = window
  if (progress <= start || progress >= end) return 0
  if (progress <= peak) return (maxRadius * (progress - start)) / (peak - start)
  return (maxRadius * (end - progress)) / (end - peak)
}

const FRAME_FADE = 0.03

/**
 * Visibility for the physical door-frame geometry (ThresholdFrame.tsx) at a
 * portal: unlike portalRadius (the dissolve hole itself, 0 outside the
 * window), the frame fades in slightly *before* start so it reads as
 * already being there when the hole starts opening — a frame that popped in
 * mid-dissolve would look like a bug, not a doorway — and fades out after
 * end for the same reason in reverse.
 */
export function frameVisibility(progress: number, window: PortalWindow): number {
  const { start, end } = window
  const fadeIn = (progress - (start - FRAME_FADE)) / FRAME_FADE
  const fadeOut = (end + FRAME_FADE - progress) / FRAME_FADE
  return Math.min(1, Math.max(0, Math.min(fadeIn, fadeOut)))
}
