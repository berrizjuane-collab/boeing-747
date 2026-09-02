/**
 * plan4.md bug #15/#16, §3.8, §04-03: one declared "nothing built here"
 * rectangle that the terrain disc (Fase G1, flatness) and every
 * vegetation instance (Fase H, exclusion) test against — built from the
 * exact numbers the runway, taxiway, apron, terminal, hangars, fuel farm
 * and control tower already render at (runwayGeometry.ts,
 * airportLayout.ts), never re-typed approximations that could silently
 * drift from what's actually on screen.
 */
import { airportFootprints, type Rect } from './airportLayout'

// Visual margin between the nearest tree trunk / grass blade and the
// nearest built edge — without this, a tree could root flush against a
// hangar wall.
const KEEP_OUT_PADDING = 6

const FOOTPRINTS: readonly Rect[] = airportFootprints()

/**
 * Single bounding rectangle over the runway, taxiway, apron, terminal,
 * control tower, fuel farm and all three hangars, expanded by the padding
 * above. Deliberately one rectangle rather than one shape per structure:
 * plan4.md's own art direction (§3.1) puts the forest at 400-1500u, far
 * outside this footprint on every side except immediately west of the
 * runway, so the extra containment a multi-polygon keep-out would buy isn't
 * needed to keep vegetation off the built aerodrome.
 */
export const AERODROME_KEEP_OUT: Rect = {
  minX: Math.min(...FOOTPRINTS.map((rect) => rect.minX)) - KEEP_OUT_PADDING,
  maxX: Math.max(...FOOTPRINTS.map((rect) => rect.maxX)) + KEEP_OUT_PADDING,
  minZ: Math.min(...FOOTPRINTS.map((rect) => rect.minZ)) - KEEP_OUT_PADDING,
  maxZ: Math.max(...FOOTPRINTS.map((rect) => rect.maxZ)) + KEEP_OUT_PADDING,
}

export function isInsideAerodromeKeepOut(x: number, z: number): boolean {
  return x >= AERODROME_KEEP_OUT.minX && x <= AERODROME_KEEP_OUT.maxX && z >= AERODROME_KEEP_OUT.minZ && z <= AERODROME_KEEP_OUT.maxZ
}

/**
 * plan4.md G1: the terrain disc's relief must read as exactly flat
 * (y == 0) inside the keep-out — same contract runwayGeometry.ts's marking
 * quads already hold outside this module — and blend smoothly back to the
 * field's real relief just past its edge, so there's no visible seam at
 * the boundary.
 */
const KEEP_OUT_FEATHER = 24

export function keepOutFlattenFactor(x: number, z: number): number {
  const dx = Math.max(AERODROME_KEEP_OUT.minX - x, 0, x - AERODROME_KEEP_OUT.maxX)
  const dz = Math.max(AERODROME_KEEP_OUT.minZ - z, 0, z - AERODROME_KEEP_OUT.maxZ)
  const distance = Math.hypot(dx, dz)
  if (distance >= KEEP_OUT_FEATHER) return 1
  const t = distance / KEEP_OUT_FEATHER
  return t * t * (3 - 2 * t)
}
