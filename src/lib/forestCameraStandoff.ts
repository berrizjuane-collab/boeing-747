import { Box3, PerspectiveCamera, Vector3 } from 'three'
import { KEYFRAMES } from './cameraPath'

/**
 * plan4.md §3.8 says the aerodrome keep-out alone puts "las coníferas más
 * cercanas a ~60-120 u de la cámara". Measured directly against
 * AERODROME_KEEP_OUT (aerodromeKeepOut.ts) and the real S1 camera keyframes
 * below, that isn't true: the keep-out's padded edge closest to the S1
 * camera ([60,8,55]) is only 31u away.
 *
 * Two separate constraints follow from that, and only the first is a
 * simple radius:
 *
 * 1. `isWithinCameraStandoff` — nothing should spawn right next to wherever
 *    the camera itself is standing (it would fill the frame at point-blank
 *    range regardless of what else is in view).
 * 2. `isWithinAircraftSightline` — nothing should spawn between the camera
 *    and the A380, even far from the camera itself. A first version of this
 *    module only had (1), sized as a circle around each camera position; a
 *    captured 01-hero.png (progress4.md H5 evidence) showed a near-band
 *    conifer standing directly in front of the wing/engine nacelle despite
 *    being outside every camera-standoff circle — the aircraft's ~80u
 *    wingspan subtends a wide angle at only ~80u of camera distance
 *    (roughly 50° full angle), which a fixed-radius circle around the
 *    camera can't encode.
 *
 *    (2) projects the aircraft's real world-space bounding box
 *    (RUNWAY_POSE/FLYING_POSE, sceneLayout.ts, plus the ~80x74u footprint
 *    AircraftGroundShadow already uses) through each camera keyframe's own
 *    real projection matrix (fov, aspect, look-at) to get its on-screen
 *    rectangle, and rejects any near-band candidate whose own projection
 *    falls inside that rectangle — deliberately with *no* depth/distance
 *    escape hatch. An earlier version tried to also allow candidates that
 *    project inside the rectangle but sit "behind" the aircraft's nearest
 *    surface (so the aircraft itself would be the occluder, not the tree);
 *    every depth model tried for that — nearest box corner, then aircraft-
 *    center distance minus a flat margin — either let real occluders
 *    through (a corner of a *generous* bounding box is the box's *emptiest*
 *    point, not a point the fuselage silhouette actually covers, so
 *    "distance to nearest corner" could read far closer than any real
 *    aircraft surface) or needed a depth model of the fuselage/wing surface
 *    this project has no clean source for. The near band is capped at
 *    400u — a tree angularly inside the aircraft's silhouette is either
 *    genuinely in front of it (the bug) or far enough behind it to be
 *    entirely hidden by it anyway (draws zero visible pixels), so dropping
 *    depth and excluding the whole cone out to 400u costs nothing visible
 *    and is the only version that's actually verified safe end to end
 *    (progress4.md H5).
 */
const HERO_CAMERA_KEYFRAMES = KEYFRAMES.filter((keyframe) => keyframe.sectionIndex <= 1)
const HERO_CAMERA_KEYFRAMES_XZ: ReadonlyArray<readonly [number, number]> = HERO_CAMERA_KEYFRAMES.map(
  (keyframe) => [keyframe.camPos[0], keyframe.camPos[2]] as const,
)

export const CAMERA_STANDOFF_RADIUS = 50

export function isWithinCameraStandoff(x: number, z: number): boolean {
  return HERO_CAMERA_KEYFRAMES_XZ.some(([cameraX, cameraZ]) => Math.hypot(x - cameraX, z - cameraZ) < CAMERA_STANDOFF_RADIUS)
}

// RUNWAY_POSE [0,8.48,0] to FLYING_POSE [0,40,-80] (sceneLayout.ts) is the
// full S2 travel; ~80u wingspan / ~74u fuselage length is
// AircraftGroundShadow's own declared footprint (RunwayEnvironment.tsx),
// not re-guessed. Margin keeps the box honest against a wide aircraft
// silhouette (engines/wingtips) rather than just its centreline.
const AIRCRAFT_SIGHTLINE_BOX = new Box3(new Vector3(-45, -2, -122), new Vector3(45, 55, 42))
const AIRCRAFT_BOX_CORNERS: readonly Vector3[] = [
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.min.x, AIRCRAFT_SIGHTLINE_BOX.min.y, AIRCRAFT_SIGHTLINE_BOX.min.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.max.x, AIRCRAFT_SIGHTLINE_BOX.min.y, AIRCRAFT_SIGHTLINE_BOX.min.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.min.x, AIRCRAFT_SIGHTLINE_BOX.max.y, AIRCRAFT_SIGHTLINE_BOX.min.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.max.x, AIRCRAFT_SIGHTLINE_BOX.max.y, AIRCRAFT_SIGHTLINE_BOX.min.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.min.x, AIRCRAFT_SIGHTLINE_BOX.min.y, AIRCRAFT_SIGHTLINE_BOX.max.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.max.x, AIRCRAFT_SIGHTLINE_BOX.min.y, AIRCRAFT_SIGHTLINE_BOX.max.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.min.x, AIRCRAFT_SIGHTLINE_BOX.max.y, AIRCRAFT_SIGHTLINE_BOX.max.z),
  new Vector3(AIRCRAFT_SIGHTLINE_BOX.max.x, AIRCRAFT_SIGHTLINE_BOX.max.y, AIRCRAFT_SIGHTLINE_BOX.max.z),
]

interface ProjectedAircraft {
  minNdcX: number
  maxNdcX: number
  minNdcY: number
  maxNdcY: number
  camera: PerspectiveCamera
}

const ASPECT = 1440 / 900 // desktop hero viewport (visual-qa.mjs) — this exclusion only has to protect the desktop 01-hero frame; mobile's narrower/taller crop is a subset of the same world-space danger zone, not a wider one.

function projectAircraftForKeyframe(keyframe: (typeof HERO_CAMERA_KEYFRAMES)[number]): ProjectedAircraft {
  const camera = new PerspectiveCamera(keyframe.fov, ASPECT, 0.1, 3000)
  camera.position.set(...keyframe.camPos)
  camera.lookAt(...keyframe.camTarget)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()

  let minNdcX = Infinity
  let maxNdcX = -Infinity
  let minNdcY = Infinity
  let maxNdcY = -Infinity
  const projected = new Vector3()
  for (const corner of AIRCRAFT_BOX_CORNERS) {
    projected.copy(corner).project(camera)
    minNdcX = Math.min(minNdcX, projected.x)
    maxNdcX = Math.max(maxNdcX, projected.x)
    minNdcY = Math.min(minNdcY, projected.y)
    maxNdcY = Math.max(maxNdcY, projected.y)
  }
  return { minNdcX, maxNdcX, minNdcY, maxNdcY, camera }
}

const PROJECTED_AIRCRAFT: readonly ProjectedAircraft[] = HERO_CAMERA_KEYFRAMES.map(projectAircraftForKeyframe)

// Screen-space slack so a tree doesn't have to overlap the aircraft's exact
// pixel edge to count — a canopy brushing right up against the fuselage
// outline reads just as badly as one dead-centre on it.
const NDC_MARGIN = 0.06

const candidateScratch = new Vector3()

/**
 * True if a candidate at world (x, z) — canopy midpoint height, not ground
 * level, since that's the part of a conifer that would actually cross the
 * aircraft's silhouette — projects inside the A380's on-screen rectangle
 * from any S1/S2 camera keyframe. No depth test (see module comment): the
 * near band this gates is capped at 400u, so anything caught here either
 * is the occlusion bug or would be entirely hidden behind the aircraft
 * anyway.
 */
export function isWithinAircraftSightline(x: number, z: number, canopyMidHeight: number): boolean {
  candidateScratch.set(x, canopyMidHeight, z)
  return PROJECTED_AIRCRAFT.some(({ minNdcX, maxNdcX, minNdcY, maxNdcY, camera }) => {
    const projected = candidateScratch.clone().project(camera)
    if (projected.z < -1 || projected.z > 1) return false // behind the camera / outside its clip range — not a meaningful screen-space comparison
    return (
      projected.x >= minNdcX - NDC_MARGIN &&
      projected.x <= maxNdcX + NDC_MARGIN &&
      projected.y >= minNdcY - NDC_MARGIN &&
      projected.y <= maxNdcY + NDC_MARGIN
    )
  })
}
