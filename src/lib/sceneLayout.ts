// Shared placeholder-geometry constants. Loose meters-ish scale, not tied to
// real A380 dimensions — this is Fase 2 validation geometry (a box), not a
// production asset. Nose points toward -Z.
export const FUSELAGE = {
  length: 70,
  width: 7,
  height: 8,
}

// Where the aircraft rests on the runway for S1, before S2's taxi/rotate animates it.
export const RUNWAY_POSE = {
  position: [0, FUSELAGE.height / 2, 0] as const,
  pitchDeg: 0,
}

// The pose the aircraft holds constant for S3 onward — S2 interpolates into
// this by its own end, so there's no pop at the S2/S3 boundary. From here on
// only the camera moves; the aircraft itself stays put (see aircraftPose.ts).
export const FLYING_POSE = {
  position: [0, 40, -80] as const,
  pitchDeg: -3,
}
