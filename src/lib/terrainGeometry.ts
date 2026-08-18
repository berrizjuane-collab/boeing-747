import { BufferAttribute, PlaneGeometry } from 'three'
import { keepOutFlattenFactor } from './aerodromeKeepOut'
import { terrainHeightAt } from './terrainField'

// plan4.md G1/bug #15: replaces EnvironmentPlaceholder.tsx's old
// planeGeometry(4000,4000) centred at the world origin. This disc instead
// recentres to the camera's XZ every time the camera drifts far enough
// (TerrainGround's useFrame) — its edge is always ~half this size away from
// wherever the camera actually is, comfortably past where §1.3's fog table
// already reads near-total (0.988 at 1400u), so the edge is never a
// meaningfully lit pixel. Camera-follow is what actually keeps it out of
// frame; the size just has to clear the fog's effective range with margin.
export const TERRAIN_DISC_SIZE = 3000

// Uniform grid, not adaptive/radial LOD: the relief this carries is
// low-amplitude background texture (terrainField.ts's
// TERRAIN_RELIEF_AMPLITUDE), not a hero-focal sculpted landscape — detail
// close to the camera is meant to come from the G2 texture, not extra
// vertices (plan4.md §1.6, the same reasoning aircraftSurfaceMaps.ts
// already applies to the fuselage). 96 segments matches B5's own floor for
// the sky dome, chosen for the same "no visible faceting" reason.
export const TERRAIN_DISC_SEGMENTS = 96

// World-space UV tiling: the terrain texture repeats every this many world
// units. Small enough that a tile still reads as reasonably detailed within
// the *near* distance band (plan4.md §1.6, 0-250u) rather than one texture
// stretched across the whole 3000-unit disc.
export const TERRAIN_TEXTURE_TILE_SIZE = 120

/** Flat base geometry — rotateX is baked in here, once, so nothing downstream needs a JSX rotation prop that could double up. */
export function createTerrainDiscGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(TERRAIN_DISC_SIZE, TERRAIN_DISC_SIZE, TERRAIN_DISC_SEGMENTS, TERRAIN_DISC_SEGMENTS)
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/**
 * Rewrites every vertex's Y (relief, flattened to exactly 0 inside the
 * aerodrome keep-out) and UV (world-space, tiled) in place for a disc
 * currently centred at (centerX, centerZ).
 *
 * Deliberately CPU, not a GPU vertex shader: the disc's *position* moves to
 * follow the camera (TerrainGround's useFrame), so baking relief/UV from
 * *local* vertex coordinates once at geometry-build time would make the
 * terrain pattern "swim" relative to the world as the mesh translates — the
 * relief a given world point shows would depend on how far the disc has
 * since drifted from wherever it was when that vertex was last baked. This
 * function is called again on every recentre (not every frame — see
 * TERRAIN_RECENTER_STEP), always from the current world (x, z), so the
 * field stays world-locked. Being CPU-side also means relief and UV reuse
 * the exact same terrainField.ts functions G2's texture and Fase H's
 * instance placement already call, with no GLSL reimplementation of the
 * noise to keep in sync by hand — and it comes with correct per-vertex
 * lighting response to the bumps for free, since computeVertexNormals()
 * below recomputes normals from the displaced surface.
 */
export function updateTerrainDiscForCenter(geometry: PlaneGeometry, centerX: number, centerZ: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  const uv = geometry.getAttribute('uv') as BufferAttribute

  for (let index = 0; index < position.count; index += 1) {
    const localX = position.getX(index)
    const localZ = position.getZ(index)
    const worldX = centerX + localX
    const worldZ = centerZ + localZ

    // `+ 0` normalises -0 to +0: a negative terrainHeightAt times an exact
    // 0 keep-out factor is IEEE754 negative zero, which is a real vertex
    // value (`relief === 0` is true) but fails a strict Object.is-based
    // flatness assertion — the flatness contract this mirrors (B4's runway
    // markings test) cares about the value, not its sign bit.
    const relief = (terrainHeightAt(worldX, worldZ) * keepOutFlattenFactor(worldX, worldZ)) + 0
    position.setY(index, relief)
    uv.setXY(index, worldX / TERRAIN_TEXTURE_TILE_SIZE, worldZ / TERRAIN_TEXTURE_TILE_SIZE)
  }

  position.needsUpdate = true
  uv.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}
