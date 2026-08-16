/** Deterministic PRNG: visual QA and tests see the same field every run. */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

export interface GrassPlacement {
  side: -1 | 1
  lateral: number
  z: number
  height: number
  rotationY: number
  scaleXZ: number
  colorMix: number
}

const CLUSTER_COUNT = 10

/**
 * plan3.md C2: uniform `18 + random()*72` scatter read as an evenly sprayed
 * lawn, not a field. A handful of cluster centers plus a min-of-two-draws
 * jitter (biases toward the center, thinning outward) gives patchy, uneven
 * coverage instead — the density falloff the item asks for. Exported (not
 * inlined in the component) so tests can assert the output is non-uniform
 * without mounting a scene.
 */
export function generateGrassField(count: number, seed: number): GrassPlacement[] {
  const random = seededRandom(seed)
  const clusterCenters = Array.from({ length: CLUSTER_COUNT }, () => ({
    lateral: 18 + random() * 72,
    z: -255 + random() * 510,
  }))

  const placements: GrassPlacement[] = []
  for (let index = 0; index < count; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    const cluster = clusterCenters[Math.floor(random() * CLUSTER_COUNT)]
    const jitterLateral = Math.min(random(), random()) * 22
    const jitterZ = (random() - 0.5) * 40
    const lateral = Math.min(90, Math.max(18, cluster.lateral + jitterLateral))
    const z = Math.max(-255, Math.min(255, cluster.z + jitterZ))
    const height = 0.55 + random() * 1.05
    placements.push({
      side,
      lateral,
      z,
      height,
      rotationY: random() * Math.PI * 2,
      scaleXZ: 0.65 + random() * 1.1,
      colorMix: random(),
    })
  }
  return placements
}
