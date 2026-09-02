import { AERODROME_KEEP_OUT, isInsideAerodromeKeepOut, keepOutFlattenFactor } from './aerodromeKeepOut'
import { isInsideHeroSightline } from './heroSightline'
import { hillHeightAt } from './hillsField'
import {
  fbm2D,
  groundMaskAt,
  sampleForestField,
  sampleJitteredGrid,
  terrainHeightAt,
  TREE_BAND_RADII,
  type TreeBand,
} from './terrainField'

/**
 * plan4.md Fase H1/H2, pure and testable: where every tree and shrub in
 * the hero stands, derived from the shared density field (terrainField.ts)
 * with the aerodrome keep-out and the hero sightline (heroSightline.ts)
 * carved out. Ground height comes from the same functions the terrain disc
 * and the hill ring sample, so trunks sit on the surface they render over.
 */
export type TreeSpecies = 'conifer' | 'broadleaf'

export interface PlacedPlant {
  x: number
  y: number
  z: number
  scale: number
  /** Vertical stretch on top of `scale` — trees of one species still differ in proportion. */
  heightScale: number
  rotationY: number
  /** [0,1) per-instance draws decorrelated from each other. */
  hue: number
  light: number
  species: TreeSpecies
  distanceToHero: number
}

// The S1 hero camera (cameraPath.ts KEYFRAMES[0]) — density and tier
// culling are measured from here because it's the viewpoint the hero is
// composed for.
export const HERO_ANCHOR = { x: 60, z: 55 } as const

const BAND_INNER: Record<TreeBand, number> = { near: 0, mid: TREE_BAND_RADII.near, far: TREE_BAND_RADII.mid }
const BAND_OUTER: Record<TreeBand, number> = { near: TREE_BAND_RADII.near, mid: TREE_BAND_RADII.mid, far: TREE_BAND_RADII.far }

// Broadleaf share of the near band only — at mid/far distance the crown
// shape is sub-pixel and conifers give the jagged silhouette §3.1 asks for.
const BROADLEAF_SHARE = 0.24

function decorrelate(value: number, salt: number): number {
  const v = Math.sin(value * 127.1 + salt * 311.7) * 43758.5453
  return v - Math.floor(v)
}

export function groundHeightAt(x: number, z: number): number {
  return terrainHeightAt(x, z) * keepOutFlattenFactor(x, z) + hillHeightAt(x, z)
}

// A rectangle keep-out gives the forest a ruler-straight edge along the
// aerodrome. The tree line is feathered instead: each candidate must also
// clear a noise-driven margin (8–60 u) beyond the keep-out, so the edge
// meanders like a real clearing boundary (plan4.md §3.1 property 1).
const EDGE_FEATHER_SALT = 0x77e1
// plan4.md §3.1 property 1: "manchones con huecos de suelo desnudo entre
// grupos". The shared forest density field (terrainField.ts) saturates to
// 1 over most of its range, which reads as a uniform carpet; a second,
// larger-scale clearing field carves real gaps (≈35 % of the area) with
// irregular contours, and the H2 test asserts the resulting
// over-dispersion against a uniform Poisson field.
const CLEARING_SALT = 0x3c1e4
const CLEARING_CELL_SIZE: Record<TreeBand, number> = { near: 95, mid: 150, far: 220 }
const CLEARING_THRESHOLD = 0.4
function insideClearing(x: number, z: number, band: TreeBand): boolean {
  return fbm2D(x + 3000, z - 3000, CLEARING_SALT, 3, CLEARING_CELL_SIZE[band]) < CLEARING_THRESHOLD
}

function keepOutEdgeDistance(x: number, z: number): number {
  const dx = Math.max(AERODROME_KEEP_OUT.minX - x, 0, x - AERODROME_KEEP_OUT.maxX)
  const dz = Math.max(AERODROME_KEEP_OUT.minZ - z, 0, z - AERODROME_KEEP_OUT.maxZ)
  return Math.hypot(dx, dz)
}

function excludedForTrees(x: number, z: number, band: TreeBand, inner: number, outer: number): boolean {
  const radius = Math.hypot(x, z)
  if (radius < inner || radius > outer) return true
  if (isInsideAerodromeKeepOut(x, z) || isInsideHeroSightline(x, z)) return true
  if (insideClearing(x, z, band)) return true
  const feather = 8 + 52 * fbm2D(x, z, EDGE_FEATHER_SALT, 2, 55)
  return keepOutEdgeDistance(x, z) < feather
}

/** Every tree of one distance band, sorted nearest-to-the-hero first so a tier can keep a prefix. */
export function placeForestBand(band: TreeBand): PlacedPlant[] {
  const inner = BAND_INNER[band]
  const outer = BAND_OUTER[band]
  const bounds = { minX: -outer, maxX: outer, minZ: -outer, maxZ: outer }
  const instances = sampleForestField(band, bounds, (x, z) => excludedForTrees(x, z, band, inner, outer))

  const placed: PlacedPlant[] = instances.map((instance) => {
    const speciesDraw = decorrelate(instance.jitter, 1)
    const scaleDraw = decorrelate(instance.jitter, 2)
    const heightDraw = decorrelate(instance.jitter, 3)
    const species: TreeSpecies = band === 'near' && speciesDraw < BROADLEAF_SHARE ? 'broadleaf' : 'conifer'
    const scale = band === 'far' ? 0.95 + scaleDraw * 0.75 : band === 'mid' ? 0.85 + scaleDraw * 0.7 : 0.72 + scaleDraw * 0.68
    return {
      x: instance.x,
      z: instance.z,
      y: groundHeightAt(instance.x, instance.z),
      scale,
      heightScale: 0.72 + heightDraw * 0.62,
      rotationY: instance.rotationY,
      hue: decorrelate(instance.jitter, 4),
      light: decorrelate(instance.jitter, 5),
      species,
      distanceToHero: Math.hypot(instance.x - HERO_ANCHOR.x, instance.z - HERO_ANCHOR.z),
    }
  })
  placed.sort((a, b) => a.distanceToHero - b.distanceToHero)
  return placed
}

const SHRUB_SALT = 0x5b2b
const SHRUB_CELL_SIZE = 6.5
const SHRUB_RADIUS = 330

/** Low shrubs in the near band, following the grass mask (they grow where the ground holds moisture) and thinning with distance. */
export function placeShrubs(): PlacedPlant[] {
  const instances = sampleJitteredGrid({
    minX: -SHRUB_RADIUS,
    maxX: SHRUB_RADIUS,
    minZ: -SHRUB_RADIUS,
    maxZ: SHRUB_RADIUS,
    cellSize: SHRUB_CELL_SIZE,
    salt: SHRUB_SALT,
    densityAt: (x, z) => groundMaskAt(x, z) * 0.55,
    excluded: (x, z) => isInsideAerodromeKeepOut(x, z) || isInsideHeroSightline(x, z) || Math.hypot(x, z) > SHRUB_RADIUS,
  })
  const placed: PlacedPlant[] = instances.map((instance) => ({
    x: instance.x,
    z: instance.z,
    y: groundHeightAt(instance.x, instance.z),
    scale: 0.8 + decorrelate(instance.jitter, 2) * 1.1,
    heightScale: 0.8 + decorrelate(instance.jitter, 3) * 0.5,
    rotationY: instance.rotationY,
    hue: decorrelate(instance.jitter, 4),
    light: decorrelate(instance.jitter, 5),
    species: 'broadleaf',
    distanceToHero: Math.hypot(instance.x - HERO_ANCHOR.x, instance.z - HERO_ANCHOR.z),
  }))
  placed.sort((a, b) => a.distanceToHero - b.distanceToHero)
  return placed
}
