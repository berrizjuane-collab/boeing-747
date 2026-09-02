/**
 * plan4.md §3.8 / H5: the aerodrome keep-out (aerodromeKeepOut.ts) keeps
 * the forest off the built airport, but the S1 hero camera stands *east*
 * of the runway ([60, 8, 55], cameraPath.ts) looking north-west across the
 * aircraft — a 12 m conifer rooted anywhere between that camera and the
 * fuselage would subtend hundreds of pixels and cover the subject. This
 * box is the corridor the camera looks through in S1 and rises out of in
 * S2: no tree or shrub is planted inside it. Grass is fine (sub-2 m).
 *
 * Extents derived from the S1/S2 keyframes, not guessed: x up to 118 keeps
 * everything behind the S2 end pose (camPos x=100); z from -150 to 135
 * covers the aircraft's full length at RUNWAY_POSE (nose z=-35, tail
 * z≈+38) plus the horizontal field of view of both S1 keyframes at the
 * aircraft's distance, with margin.
 */
export const HERO_SIGHTLINE = { minX: -30, maxX: 118, minZ: -150, maxZ: 135 } as const

export function isInsideHeroSightline(x: number, z: number): boolean {
  return x >= HERO_SIGHTLINE.minX && x <= HERO_SIGHTLINE.maxX && z >= HERO_SIGHTLINE.minZ && z <= HERO_SIGHTLINE.maxZ
}
