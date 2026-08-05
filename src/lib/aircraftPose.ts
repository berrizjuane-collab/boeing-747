import { Vector3 } from 'three'
import { FLYING_POSE, RUNWAY_POSE } from './sceneLayout'
import { SECTIONS, localProgress } from './sections'

const TAKEOFF_SECTION = SECTIONS[1] // S2 — Rodaje y despegue

const runwayPos = new Vector3(...RUNWAY_POSE.position)
const flyingPos = new Vector3(...FLYING_POSE.position)

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

export interface AircraftPose {
  position: Vector3
  pitchRad: number
}

/**
 * Deterministic aircraft pose as a pure function of global scroll progress.
 * Holds the runway pose through S1, interpolates to the flying pose across
 * S2 (taxi + rotation), then holds the flying pose for S3 onward — from S3
 * on, only the camera moves (see PLAN.md §13 Fase 2 notes). Cosmetic
 * per-frame jitter (taxi vibration) is layered on top by the component that
 * calls this, not here — that part is time-driven, not scroll-driven.
 */
export function getAircraftPose(progress: number): AircraftPose {
  if (progress < TAKEOFF_SECTION.start) {
    return { position: runwayPos.clone(), pitchRad: 0 }
  }
  if (progress >= TAKEOFF_SECTION.end) {
    return { position: flyingPos.clone(), pitchRad: (FLYING_POSE.pitchDeg * Math.PI) / 180 }
  }

  const t = easeInOutCubic(localProgress(progress, TAKEOFF_SECTION))
  const position = runwayPos.clone().lerp(flyingPos, t)
  const pitchRad = t * (FLYING_POSE.pitchDeg * Math.PI) / 180
  return { position, pitchRad }
}
