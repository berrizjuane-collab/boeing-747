import { Vector3 } from 'three'
import { FLYING_POSE, RUNWAY_POSE } from './sceneLayout'
import { SECTIONS, localProgress } from './sections'

const TAKEOFF_SECTION = SECTIONS[1] // S2 — Rodaje y despegue

const runwayPos = new Vector3(...RUNWAY_POSE.position)
const flyingPos = new Vector3(...FLYING_POSE.position)
const FLYING_PITCH_RAD = (FLYING_POSE.pitchDeg * Math.PI) / 180

/**
 * Main-gear contact point in the aircraft's own body frame, measured off
 * `public/models/exterior.glb` through the pose group's transform. The
 * rotation pivots here rather than at the model origin, which is what keeps
 * the wheels planted while the nose comes up (plan6 3.6 "pivotes").
 */
const MAIN_GEAR_CONTACT = { y: -8.476, z: -2.63 }

// S2-local milestones. The aircraft accelerates down the runway first, then
// rotates, then flies: the previous pose lerped position and pitch across
// the whole section at once, so it left the ground from the first frame of
// S2 and had no ground roll at all.
const ROTATE_START = 0.42
const LIFTOFF = 0.56
/**
 * Peak nose-up attitude at rotation, in degrees. Positive is nose-up here:
 * the pose group applies this about world X at the aircraft origin, and the
 * nose sits ~35 m forward of it, so a positive angle raises it.
 * FLYING_POSE.pitchDeg stays exactly as registered — the interior's whole
 * coordinate frame is built on it — and this is an excursion above it that
 * settles back by the end of the section.
 */
const ROTATION_PEAK_DEG = 9
const GEAR_UP_START = 0.62
const GEAR_UP_END = 0.86

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const smoothstep01 = (value: number) => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

/**
 * Distance covered along the runway, as a fraction of the section's total.
 * Integrates a speed that ramps linearly to rotation speed and then holds:
 * constant acceleration on the ground, constant speed once flying. A
 * smoothstep here would have the aircraft slowing down as it climbs away.
 */
function trackFraction(u: number): number {
  const total = LIFTOFF / 2 + (1 - LIFTOFF)
  const covered = u <= LIFTOFF ? (u * u) / (2 * LIFTOFF) : LIFTOFF / 2 + (u - LIFTOFF)
  return covered / total
}

function pitchRadians(u: number): number {
  const peak = (ROTATION_PEAK_DEG * Math.PI) / 180
  if (u <= ROTATE_START) return 0
  if (u < LIFTOFF) return peak * smoothstep01((u - ROTATE_START) / (LIFTOFF - ROTATE_START))
  return peak + (FLYING_PITCH_RAD - peak) * smoothstep01((u - LIFTOFF) / (1 - LIFTOFF))
}

/**
 * Height of the aircraft origin while the main gear is still loaded. Solving
 * for "the wheels are on the runway" rather than authoring a height keeps
 * the contact correct for whatever rotation angle the curve above produces.
 */
function groundedHeight(pitch: number): number {
  const { y, z } = MAIN_GEAR_CONTACT
  return RUNWAY_POSE.position[1] + y - (y * Math.cos(pitch) - z * Math.sin(pitch))
}

export interface AircraftPose {
  position: Vector3
  pitchRad: number
  /**
   * Height of the main-gear contact above the runway surface, not of the
   * model origin: rotating about the gear swings the origin slightly
   * *downward*, so origin height reads as the aircraft sinking at exactly
   * the moment it is lifting its nose. This is the number both the contact
   * shadow and the retraction gate actually want.
   */
  altitude: number
  /** 1 while the gear is down and locked, 0 once fully retracted. */
  gearExtension: number
}

/** Height of the main-gear contact above the runway, for a given origin height and attitude. */
function gearContactAltitude(originY: number, pitch: number): number {
  const { y, z } = MAIN_GEAR_CONTACT
  return originY + (y * Math.cos(pitch) - z * Math.sin(pitch)) - (RUNWAY_POSE.position[1] + y)
}

/**
 * Deterministic aircraft pose as a pure function of global scroll progress.
 * Holds the runway pose through S1, runs the takeoff across S2, then holds
 * the flying pose for S3 onward — from S3 on, only the camera moves (see
 * PLAN.md §13 Fase 2 notes). Cosmetic per-frame jitter (taxi vibration) is
 * layered on top by the component that calls this, not here — that part is
 * time-driven, not scroll-driven.
 */
export function getAircraftPose(progress: number): AircraftPose {
  if (progress < TAKEOFF_SECTION.start) {
    return { position: runwayPos.clone(), pitchRad: 0, altitude: 0, gearExtension: 1 }
  }
  if (progress >= TAKEOFF_SECTION.end) {
    return {
      position: flyingPos.clone(),
      pitchRad: FLYING_PITCH_RAD,
      altitude: gearContactAltitude(flyingPos.y, FLYING_PITCH_RAD),
      gearExtension: 0,
    }
  }

  const u = localProgress(progress, TAKEOFF_SECTION)
  const pitchRad = pitchRadians(u)
  const track = trackFraction(u)

  // Lateral/longitudinal travel follows the runway the whole way; height
  // stays solved against the wheels until rotation completes, then climbs.
  const climb = u <= LIFTOFF ? 0 : smoothstep01((u - LIFTOFF) / (1 - LIFTOFF))
  const grounded = groundedHeight(pitchRad)
  const position = new Vector3(
    runwayPos.x + (flyingPos.x - runwayPos.x) * track,
    grounded + (flyingPos.y - grounded) * climb,
    runwayPos.z + (flyingPos.z - runwayPos.z) * track,
  )

  return {
    position,
    pitchRad,
    altitude: Math.max(0, gearContactAltitude(position.y, pitchRad)),
    gearExtension: 1 - smoothstep01((u - GEAR_UP_START) / (GEAR_UP_END - GEAR_UP_START)),
  }
}
