// Where the aircraft rests on the runway for S1, before S2's taxi/rotate
// animates it. y=8.48 places the real exterior model's lowest point (a main
// landing gear wheel contact patch, local y=0.0236 post-rotation — see
// EXTERIOR_LOCAL_OFFSET below) exactly on the ground plane: 8.48 - 8.5 +
// 0.0236 ≈ 0.
export const RUNWAY_POSE = {
  position: [0, 8.48, 0] as const,
  pitchDeg: 0,
}

// The pose the aircraft holds constant for S3 onward — S2 interpolates into
// this by its own end, so there's no pop at the S2/S3 boundary. From here on
// only the camera moves; the aircraft itself stays put (see aircraftPose.ts).
// Unchanged since the Fase 2 placeholder: every camera keyframe, portal
// center, and interior anchor downstream was tuned against this value, so
// ExteriorAsset is placed (via EXTERIOR_LOCAL_OFFSET) to fit it rather than
// the other way around.
export const FLYING_POSE = {
  position: [0, 40, -80] as const,
  pitchDeg: -3,
}

// Fixed local transform applied to the loaded exterior.glb inside
// ExteriorAsset's pose-driven group (rotation first, then this translation —
// see the component). Derived from the real model's own vertex bounds
// (public/models/exterior.glb, verified with three.js Matrix4 composition
// down the Exterior_Root -> A380_low -> A380/LandingGear chain, since
// Exterior_Root carries a real -90°X rotation that a naive translation-only
// read would silently ignore):
//
// - Rotation +90° about X: Blender exports Z-up -> glTF Y-up, and
//   prepare_exterior.py's own Exterior_Root -90°X (applied in Blender,
//   before that export conversion) compose into a raw glTF file where Y
//   holds length (nose->tail, range ~[0,73]) and Z holds *negative* height
//   (range ~[-24.71,-0.02], ground near 0). +90° about X on load maps
//   (Y,Z) -> (-Z,Y), landing height on Y (~[0.02,24.71], ground near 0) and
//   length on Z (~[0,73]) — the same axis contract InteriorAsset already
//   uses, and the same corrective rotation, which makes sense: both assets
//   went through the same kind of Blender-authored/glTF-exported pipeline.
// - Z offset -35: puts the model's nose (local z=0 after rotation) 35 units
//   ahead of the group origin, matching the old placeholder's half-length
//   (70/2) so the nose still lands at world z=-115 at FLYING_POSE — exactly
//   where NOSE_PORTAL and every S3/S4 camera keyframe already expect it.
// - Y offset -8.5: puts the main deck floor (real A380 door-sill height
//   ~5.5m above the model's own local ground reference) at world y=37 at
//   FLYING_POSE, matching INTERIOR_OFFSET.y so the interior sits inside the
//   fuselage instead of floating clear of it.
//
// Nose/tail direction (which end of the raw [0,73] Y range is which) was
// confirmed independently by clustering the 115 LandingGear_Part_* meshes'
// own world-space centroids: a tight 23-part cluster at the low end
// (~4.5-6, the nose gear) and a ~92-part cluster at the high end (~25-36,
// the main gear under the wing box) — matching the audit's documented
// "23 parts nose / 90 parts main" split.
export const EXTERIOR_LOCAL_OFFSET = [0, -8.5, -35] as const

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
