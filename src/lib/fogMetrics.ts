export const FOG_EVIDENCE_DISTANCES = [100, 400, 800] as const

/** Matches three.js FogExp2's shader factor: 1 - exp(-(density * distance)^2). */
export function exponentialFogMix(density: number, distance: number) {
  const scaled = Math.max(0, density) * Math.max(0, distance)
  return 1 - Math.exp(-(scaled * scaled))
}
