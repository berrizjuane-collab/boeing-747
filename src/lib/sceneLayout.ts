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

// Places the real interior asset (InteriorAsset.tsx) inside the placeholder
// fuselage envelope: cockpit ~5 units past the nose (world z=-115), main
// deck floor near the bottom of the fuselage box (y=36..44 at rest).
export const INTERIOR_OFFSET = [0, 37, -110] as const

// Copied from the `empty(...)` anchor calls in blender/interior_blockout.py
// (Cockpit_Anchor, Economy_Anchor, Stair_Anchor, UpperDeck_Anchor) — these
// are the source of truth for zone position, in the blockout script's own
// coordinates. Keep in sync if that script's anchors ever move.
const INTERIOR_ANCHORS_LOCAL = {
  cockpit: [0, 0, 0],
  economy: [0, 0, 8],
  stair: [0, 0, 34],
  upperDeck: [0, 2.35, 40],
} as const

/**
 * Maps a point in interior_blockout.py's own coordinates to this scene's
 * world space. InteriorAsset.tsx's +90°-about-X load rotation undoes
 * Blender's glTF axis export swap, so — deliberately — no rotation is
 * needed here too: this is just the INTERIOR_OFFSET translation.
 */
function interiorToWorld([x, y, z]: readonly [number, number, number]): [number, number, number] {
  return [x + INTERIOR_OFFSET[0], y + INTERIOR_OFFSET[1], z + INTERIOR_OFFSET[2]]
}

export const INTERIOR_ANCHORS_WORLD = {
  cockpit: interiorToWorld(INTERIOR_ANCHORS_LOCAL.cockpit),
  economy: interiorToWorld(INTERIOR_ANCHORS_LOCAL.economy),
  stair: interiorToWorld(INTERIOR_ANCHORS_LOCAL.stair),
  upperDeck: interiorToWorld(INTERIOR_ANCHORS_LOCAL.upperDeck),
} as const
