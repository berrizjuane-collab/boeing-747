import { Matrix4, Quaternion, Vector3 } from 'three'
import { FLYING_POSE, INTERIOR_MANIFEST, interiorToWorld } from './sceneLayout'
import { sampleCamera, type SampledCamera } from './cameraPath'

const UP = new Vector3(0, 1, 0)

export interface ScreenPoint {
  /** Normalised device coordinates: -1..1 across and up the frame. */
  x: number
  y: number
  /** True when the point is in front of the camera and inside the frame. */
  onScreen: boolean
  /** Distance from the camera, in world units. */
  distance: number
}

/**
 * plan6 3.7 — where a world landmark actually lands in frame.
 *
 * World distance alone cannot answer whether the aircraft is still in shot:
 * the same three metres of camera travel is a whole frame at the door and a
 * few pixels at the wide pull-back, and changing the aspect ratio moves the
 * subject without moving the camera at all. This reproduces the rig's own
 * pose maths — lookAt with a world up, then the roll override about the
 * camera's forward axis, exactly as CameraRig applies them — so the numbers
 * describe the shot that ships rather than an idealised one.
 */
export function projectToScreen(point: Vector3, sample: SampledCamera, aspect: number): ScreenPoint {
  const basis = new Matrix4().lookAt(sample.position, sample.target, UP)
  const orientation = new Quaternion().setFromRotationMatrix(basis)
  if (sample.rollRad !== 0) {
    orientation.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), sample.rollRad))
  }

  const view = point.clone().sub(sample.position).applyQuaternion(orientation.clone().invert())
  // three.js cameras look down local -Z.
  const depth = -view.z
  const distance = point.distanceTo(sample.position)
  if (depth <= 1e-6) return { x: Number.NaN, y: Number.NaN, onScreen: false, distance }

  const halfHeight = Math.tan((sample.fov * Math.PI) / 360)
  const y = view.y / (depth * halfHeight)
  const x = view.x / (depth * halfHeight * aspect)
  return { x, y, onScreen: Math.abs(x) <= 1 && Math.abs(y) <= 1, distance }
}

/**
 * Hull extremes in world space at FLYING_POSE, measured off the shipped
 * `public/models/exterior.glb` through the same transform chain
 * ExteriorAsset mounts it with — not estimated from the aircraft's published
 * dimensions. Guessing these is what made an earlier reading of the S6 exit
 * look like an empty sky frame: judged on the fuselage centre alone the
 * subject is off screen at the door, while the port wing is in fact 9° off
 * the frame axis and fills it.
 */
export const AIRCRAFT_LANDMARKS = {
  nose: new Vector3(0, 35.01, -114.79),
  portWingtip: new Vector3(-39.84, 38.87, -64.81),
  starboardWingtip: new Vector3(39.84, 38.89, -64.41),
  finTip: new Vector3(0, 58.18, -42.9),
  tailCone: new Vector3(0, 42.46, -42.4),
  centre: new Vector3(...FLYING_POSE.position),
  upperDeckDoor: new Vector3(...interiorToWorld(INTERIOR_MANIFEST.anchors.exit)),
} as const

/**
 * A grid sample of the hull surface, taken from the same GLB by bucketing
 * vertices across span and length and keeping one representative per bucket.
 * Six named extremes are not a silhouette: between a wingtip at x=-39.8 and
 * the centreline there are thirty metres of continuous wing, and a test
 * built on the extremes alone reports an empty frame whenever the camera
 * happens to look between two of them.
 */
export const HULL_SILHOUETTE: readonly (readonly [number, number, number])[] = [
  [-39.76, 41.17, -63.39], [-34.91, 39.74, -66.11], [-27.43, 35.42, -79.95], [-27.26, 35.37, -84.04],
  [-26.07, 38.4, -68], [-24.08, 35.48, -79.12], [-16.57, 34.04, -91.28], [-16.39, 33.93, -91.72],
  [-14.57, 42.26, -45.54], [-13.18, 33.63, -91.65], [-13.13, 42.01, -47.68], [-11.71, 36.97, -78.3],
  [-3.28, 38.21, -64.68], [-3.25, 37.74, -106.67], [-0.35, 35.81, -64.45], [-0.2, 42.29, -49.86],
  [0, 33.72, -78.68], [0, 40.65, -107.73], [0, 42.2, -92.91], [3.3, 37.37, -106.65],
  [3.55, 39.71, -64.76], [11.71, 37.02, -78.25], [13.13, 42.07, -47.5], [13.26, 33.93, -91.72],
  [14.57, 42.24, -45.57], [16.3, 34.21, -91.77], [16.44, 33.94, -91.69], [24.2, 36.09, -79.15],
  [26.08, 38.47, -68.03], [27.26, 35.37, -84.04], [34.91, 39.59, -71.8], [34.91, 39.74, -66.11],
  [39.76, 41.18, -63.39],
]

const SILHOUETTE_VECTORS = HULL_SILHOUETTE.map(([x, y, z]) => new Vector3(x, y, z))

/** How much of the airframe is on screen, as a count of silhouette samples. */
export function hullLandmarksOnScreen(sample: SampledCamera, aspect: number): number {
  let visible = 0
  for (const point of SILHOUETTE_VECTORS) {
    if (projectToScreen(point, sample, aspect).onScreen) visible += 1
  }
  return visible
}

/** Aspect the shot sheet's framing notes are authored against. */
export const REFERENCE_ASPECT = 16 / 9
/**
 * Ceiling on the compensation below. Past this the lens distortion costs
 * more than the crop it prevents, so a very narrow viewport keeps a wide
 * but bounded frame and the remaining composition work belongs to the
 * layout pass rather than the camera.
 */
export const MAX_COMPENSATED_FOV = 75

/**
 * Vertical FOV that preserves the authored *horizontal* field as the
 * viewport narrows. A three.js perspective camera holds vertical FOV fixed,
 * so a narrow window silently crops the sides — which is where this shot
 * sheet puts the aircraft and the copy. Widening instead keeps the authored
 * framing until the cap.
 */
export function horizontalPreservingFov(fov: number, aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= REFERENCE_ASPECT) return fov
  const halfHeight = Math.tan((fov * Math.PI) / 360) * (REFERENCE_ASPECT / aspect)
  return Math.min(MAX_COMPENSATED_FOV, (Math.atan(halfHeight) * 360) / Math.PI)
}

/**
 * Screen-space travel of a landmark per unit of scroll, as a fraction of
 * frame height. This is the quantity a viewer experiences as camera speed;
 * the world-space step it replaces reads the same 4 metres as violent at the
 * door and imperceptible at 200 metres out.
 */
export function landmarkScreenSpeed(progress: number, landmark: Vector3, aspect: number, step = 5e-4): number {
  const before = projectToScreen(landmark, sampleCamera(Math.max(0, progress - step)), aspect)
  const after = projectToScreen(landmark, sampleCamera(Math.min(1, progress + step)), aspect)
  // Only meaningful while the landmark is actually in shot. Off-screen NDC
  // grows without bound as a point approaches the camera plane, so
  // measuring it there reports a speed the viewer never sees.
  if (!before.onScreen || !after.onScreen) return 0
  const dx = (after.x - before.x) * aspect
  const dy = after.y - before.y
  return Math.hypot(dx, dy) / (2 * step)
}

/**
 * Composition offset, in NDC x, applied as a lens shift (CameraRig's
 * setViewOffset): the subject is composed into the part of a landscape frame
 * the section copy leaves free, without turning the camera or changing
 * perspective. Positive moves the picture right, away from a left-hand
 * panel; negative moves it left, away from a right-hand one.
 *
 * Measured before this existed (16:10, panels begin at |x| ≈ 0.43): the S2
 * panel covered the nose from 0.22 to 0.28 (nose at x 0.52–0.62) and the
 * S3 spec panel covered the tail from 0.32 to 0.36 (tail to x −1.0). The
 * S2→S3 swap of sides is crossed over 3.5 % of scroll, a slide slower than
 * the track shots' own screen-speed budget. Interior and exit shots are
 * composed on the aisle and door axes and are left centred.
 */
const FRAMING_KEYS: readonly (readonly [progress: number, shift: number])[] = [
  [0, 0.2],
  [0.085, 0.2],
  [0.13, -0.08],
  [0.22, -0.25],
  [0.265, -0.25],
  [0.33, 0.4],
  [0.38, 0.4],
  [0.4, 0.33],
  [0.425, 0],
]

/** Below this aspect the copy sits under the picture, not beside it. */
const FRAMING_MIN_ASPECT = 1.05
const FRAMING_FULL_ASPECT = 1.35

export function framingShift(progress: number, aspect: number): number {
  const landscape = Math.min(1, Math.max(0, (aspect - FRAMING_MIN_ASPECT) / (FRAMING_FULL_ASPECT - FRAMING_MIN_ASPECT)))
  if (landscape === 0) return 0
  const last = FRAMING_KEYS[FRAMING_KEYS.length - 1]
  if (progress >= last[0]) return last[1] * landscape
  let index = 1
  while (index < FRAMING_KEYS.length - 1 && progress > FRAMING_KEYS[index][0]) index += 1
  const [fromProgress, fromShift] = FRAMING_KEYS[index - 1]
  const [toProgress, toShift] = FRAMING_KEYS[index]
  const t = Math.min(1, Math.max(0, (progress - fromProgress) / (toProgress - fromProgress)))
  const eased = t * t * (3 - 2 * t)
  return (fromShift + (toShift - fromShift) * eased) * landscape
}
