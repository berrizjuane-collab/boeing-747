import { isInsideAerodromeKeepOut } from './aerodromeKeepOut'
import { isWithinAircraftSightline, isWithinCameraStandoff } from './forestCameraStandoff'
import { sampleForestField, terrainHeightAt, treeBandForRadius, TREE_BAND_RADII, type FieldInstance, type TreeBand } from './terrainField'

/**
 * plan4.md Fase H1/H2: pure placement logic for Forest.tsx, split out so it
 * can be exercised (and its instance/triangle counts measured) without
 * mounting a WebGL scene — same "pure lib module, thin component wiring"
 * split terrainGeometry.ts/TerrainGround.tsx already established for G1.
 */

const BAND_HALF_EXTENT: Record<TreeBand, number> = {
  near: TREE_BAND_RADII.near + 10,
  mid: TREE_BAND_RADII.mid + 10,
  far: TREE_BAND_RADII.far + 10,
}

// Near conifers span roughly y=0-10 (coniferGeometry.ts, NEAR_CONIFER_HEIGHT)
// — checked at three heights along that span, not just the middle: the
// aircraft's own silhouette isn't a single flat plane either (fuselage roof
// vs. wing-root height differ), and a mid-height-only check measurably let
// a few instances through whose canopy *tip* or *base* still crossed the
// aircraft at a different height (progress4.md H5 evidence — 3 of 2093
// survivors flagged at the tip/base but not the middle).
const NEAR_CANOPY_TEST_HEIGHTS = [1, 5, 9]

function isNearBandExcluded(x: number, z: number): boolean {
  if (isInsideAerodromeKeepOut(x, z) || isWithinCameraStandoff(x, z)) return true
  const groundY = terrainHeightAt(x, z)
  return NEAR_CANOPY_TEST_HEIGHTS.some((height) => isWithinAircraftSightline(x, z, groundY + height))
}

/**
 * Bounding-square sample, then trimmed to the exact annulus this band owns
 * — sampleForestField/treeBandForRadius share the same TREE_BAND_RADII, so
 * a "near" candidate that happens to land past 400u (square corners) is
 * correctly rejected here, not silently kept. The near band additionally
 * excludes the camera-standoff zone and the aircraft's actual projected
 * silhouette (forestCameraStandoff.ts) — mid/far start at 400u from the
 * origin, always farther from every S1/S2 camera position (>=319u, camera
 * is <=~82u from the origin) than the aircraft's own farthest point
 * (<=~205u from camera) can ever be, so they can't render in front of it
 * and don't need the same check.
 */
export function sampleForestBand(band: TreeBand): FieldInstance[] {
  const halfExtent = BAND_HALF_EXTENT[band]
  const bounds = { minX: -halfExtent, maxX: halfExtent, minZ: -halfExtent, maxZ: halfExtent }
  const excluded = band === 'near' ? isNearBandExcluded : isInsideAerodromeKeepOut
  return sampleForestField(band, bounds, excluded).filter((instance) => treeBandForRadius(Math.hypot(instance.x, instance.z)) === band)
}
