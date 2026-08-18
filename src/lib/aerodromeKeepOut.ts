/**
 * plan4.md bug #15/#16, §3.8, §04-03: one declared "nothing built here"
 * rectangle that the terrain disc (Fase G1, flatness) and every
 * vegetation instance (Fase H, exclusion) test against — built from the
 * exact numbers the runway, apron, hangars and control tower already
 * render at (runwayGeometry.ts, RunwayEnvironment.tsx), never re-typed
 * approximations that could silently drift from what's actually on
 * screen.
 */
import { APRON, CONTROL_TOWER_POSITION, CONTROL_TOWER_ROOF_RADIUS, HANGARS } from '../components/RunwayEnvironment'
import { RUNWAY_LENGTH, RUNWAY_WIDTH } from './runwayGeometry'

interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function hangarFootprint(hangar: (typeof HANGARS)[number]): Rect {
  const [width, , depth] = hangar.size
  const [x, , z] = hangar.position
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 }
}

function apronFootprint(): Rect {
  const [width, depth] = APRON.size
  const [x, , z] = APRON.position
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 }
}

function towerFootprint(): Rect {
  const [x, , z] = CONTROL_TOWER_POSITION
  return {
    minX: x - CONTROL_TOWER_ROOF_RADIUS,
    maxX: x + CONTROL_TOWER_ROOF_RADIUS,
    minZ: z - CONTROL_TOWER_ROOF_RADIUS,
    maxZ: z + CONTROL_TOWER_ROOF_RADIUS,
  }
}

function runwayFootprint(): Rect {
  return { minX: -RUNWAY_WIDTH / 2, maxX: RUNWAY_WIDTH / 2, minZ: -RUNWAY_LENGTH / 2, maxZ: RUNWAY_LENGTH / 2 }
}

// Visual margin between the nearest tree trunk / grass blade and the
// nearest built edge — without this, a tree could root flush against a
// hangar wall.
const KEEP_OUT_PADDING = 6

const FOOTPRINTS: readonly Rect[] = [runwayFootprint(), apronFootprint(), towerFootprint(), ...HANGARS.map(hangarFootprint)]

/**
 * Single bounding rectangle over the runway, apron, control tower and all
 * three hangars, expanded by the padding above. Deliberately one rectangle
 * rather than one shape per structure: plan4.md's own art direction (§3.1)
 * puts the forest at 400-1500u, far outside this footprint on every side
 * except immediately west of the runway, so the extra containment a
 * multi-polygon keep-out would buy isn't needed to keep vegetation off the
 * built aerodrome.
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
