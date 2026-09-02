import { isInsideAerodromeKeepOut } from './aerodromeKeepOut'
import { groundHeightAt, HERO_ANCHOR } from './forestPlacement'
import { sampleJitteredGrid } from './terrainField'
import { TERRAIN_TEXTURE_TILE_SIZE } from './terrainGeometry'
import { tileGroundMask } from './terrainSurfaceMaps'

/**
 * plan4.md H3 / §3.3: grass clumps placed by the *same periodic mask the
 * terrain albedo is painted with* (terrainSurfaceMaps.ts's tileGroundMask,
 * sampled at the disc's world-space tiling), so a clump only ever stands on
 * a texel the texture already paints green and bare terracotta shows
 * exactly where no clump landed — §3.1 property 2 as a structural fact,
 * not a coincidence of two noise fields.
 *
 * Density thins with distance from the hero camera (plan4.md §1.5: a
 * clump is sub-10 px past ~150 u, so instances out there are noise, not
 * form); the terrain texture carries the mid-distance detail instead.
 */
export interface PlacedGrass {
  x: number
  y: number
  z: number
  scale: number
  heightScale: number
  /** 0 = dry/sparse patch edge, 1 = dense green centre. */
  mask: number
  light: number
  distanceToHero: number
}

/** Instances rendered per tier (GrassField.tsx): one draw call at every tier, Mobile Low included (plan4.md bug #17). */
export const GRASS_COUNT: Record<'high' | 'mid' | 'low', number> = { high: 8000, mid: 3600, low: 1500 }

const GRASS_SALT = 0x9a11
const GRASS_CELL_SIZE = 1.45
export const GRASS_BOUNDS = { minX: -240, maxX: 260, minZ: -300, maxZ: 300 } as const
const FULL_DENSITY_RADIUS = 70

function frac(value: number): number {
  return value - Math.floor(value)
}

/** The exact mask value the terrain albedo shows at world (x, z). */
export function paintedGrassMaskAt(x: number, z: number): number {
  return tileGroundMask(frac(x / TERRAIN_TEXTURE_TILE_SIZE), frac(z / TERRAIN_TEXTURE_TILE_SIZE))
}

function distanceFalloff(distance: number): number {
  if (distance <= FULL_DENSITY_RADIUS) return 1
  return (FULL_DENSITY_RADIUS / distance) ** 1.4
}

function decorrelate(value: number, salt: number): number {
  const v = Math.sin(value * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

export function placeGrass(): PlacedGrass[] {
  const instances = sampleJitteredGrid({
    ...GRASS_BOUNDS,
    cellSize: GRASS_CELL_SIZE,
    salt: GRASS_SALT,
    densityAt: (x, z) => {
      const painted = paintedGrassMaskAt(x, z)
      if (painted <= 0.05) return 0
      return Math.min(1, painted * 1.35) * distanceFalloff(Math.hypot(x - HERO_ANCHOR.x, z - HERO_ANCHOR.z))
    },
    excluded: isInsideAerodromeKeepOut,
  })
  const placed: PlacedGrass[] = instances.map((instance) => ({
    x: instance.x,
    z: instance.z,
    y: groundHeightAt(instance.x, instance.z),
    scale: 0.85 + decorrelate(instance.jitter, 1) * 0.75,
    heightScale: 0.75 + decorrelate(instance.jitter, 2) * 0.75,
    mask: paintedGrassMaskAt(instance.x, instance.z),
    light: decorrelate(instance.jitter, 3),
    distanceToHero: Math.hypot(instance.x - HERO_ANCHOR.x, instance.z - HERO_ANCHOR.z),
  }))
  placed.sort((a, b) => a.distanceToHero - b.distanceToHero)
  return placed
}
