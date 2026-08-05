import { Vector3 } from 'three'

interface PortalWindow {
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
