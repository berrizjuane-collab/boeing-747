/**
 * plan6 4.4 (A14). DoF and GodRays used to mount and unmount on the active
 * section index: full strength on one frame, gone on the next, with the
 * composer rebuilt at exactly the two boundaries the camera is crossing a
 * threshold at.
 *
 * Two things change. Each effect has a continuous weight, so it arrives and
 * leaves as a ramp; and its mount window is strictly wider than that ramp,
 * so the rebuild always happens while the effect contributes nothing. The
 * mount edges are then placed where the camera is slowest — inside S4's
 * four-metre crawl and inside the upper-deck hold — because a rebuilt
 * composer costs a frame, and a lost frame is invisible where nothing is
 * moving and obvious where everything is.
 */

interface Window {
  mountFrom: number
  mountTo: number
  riseFrom: number
  riseTo: number
  fallFrom: number
  fallTo: number
}

/** Threshold god rays: rise inside S4's crawl, gone before the cabin. */
export const GOD_RAYS: Window = {
  mountFrom: 0.425,
  mountTo: 0.47,
  riseFrom: 0.433,
  riseTo: 0.448,
  fallFrom: 0.452,
  fallTo: 0.465,
}

/** Cabin depth of field: present for the whole walk, mounted either side of it. */
export const DEPTH_OF_FIELD: Window = {
  mountFrom: 0.435,
  mountTo: 0.818,
  riseFrom: 0.448,
  riseTo: 0.492,
  fallFrom: 0.79,
  fallTo: 0.812,
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function effectWeight(progress: number, window: Window): number {
  return Math.min(
    smoothstep(window.riseFrom, window.riseTo, progress),
    1 - smoothstep(window.fallFrom, window.fallTo, progress),
  )
}

export function effectMounted(progress: number, window: Window): boolean {
  return progress >= window.mountFrom && progress <= window.mountTo
}

/**
 * Focal distance for the cabin, in world units, keyed to what the camera is
 * actually looking at. A fixed six metres focused past the instrument panel
 * in the cockpit and short of the aisle in economy; the staircase is closer
 * still. Interpolated between the zone holds so the focal plane travels with
 * the camera rather than stepping at a zone boundary.
 */
const FOCUS_STOPS: readonly [progress: number, distance: number][] = [
  [0.46, 4],
  [0.516, 3.2],
  [0.609, 9],
  [0.718, 4.5],
  [0.8, 9],
  [0.835, 9],
]

export function cabinFocusDistance(progress: number): number {
  if (progress <= FOCUS_STOPS[0][0]) return FOCUS_STOPS[0][1]
  for (let index = 1; index < FOCUS_STOPS.length; index += 1) {
    const [toProgress, toDistance] = FOCUS_STOPS[index]
    if (progress > toProgress) continue
    const [fromProgress, fromDistance] = FOCUS_STOPS[index - 1]
    const t = smoothstep(fromProgress, toProgress, progress)
    return fromDistance + (toDistance - fromDistance) * t
  }
  return FOCUS_STOPS[FOCUS_STOPS.length - 1][1]
}
