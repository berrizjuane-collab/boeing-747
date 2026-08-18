import { isInsideAerodromeKeepOut } from './aerodromeKeepOut'
import { GRASS_CUTOFF_RADIUS } from './grassGeometry'
import { sampleGrassField, type FieldInstance } from './terrainField'

/**
 * plan4.md Fase H3: pure placement logic for Grass.tsx — cropped to
 * GRASS_CUTOFF_RADIUS (§1.5) and gated by the shared ground mask (bug #16:
 * sampleGrassField only keeps candidates where groundMaskAt > 0) and the
 * aerodrome keep-out (no blades rooted through the runway/apron/hangars).
 */
export function sampleGrassInstances(): FieldInstance[] {
  const bounds = { minX: -GRASS_CUTOFF_RADIUS, maxX: GRASS_CUTOFF_RADIUS, minZ: -GRASS_CUTOFF_RADIUS, maxZ: GRASS_CUTOFF_RADIUS }
  return sampleGrassField(bounds, isInsideAerodromeKeepOut).filter((instance) => Math.hypot(instance.x, instance.z) <= GRASS_CUTOFF_RADIUS)
}
