import { seededRandom } from './proceduralRandom'

export const VEGETATION_MAX = 720
const VEGETATION_SEED = 0xa38026
const CLUSTER_COUNT = 16

export interface VegetationCluster {
  x: number
  z: number
  radius: number
}

export interface VegetationInstance {
  x: number
  z: number
  rotationY: number
  scaleXZ: number
  scaleY: number
  colorT: number
}

function buildClusters(random: () => number): VegetationCluster[] {
  const clusters: VegetationCluster[] = []
  for (let index = 0; index < CLUSTER_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1
    clusters.push({
      x: side * (22 + random() * 62),
      z: -250 + random() * 500,
      radius: 12 + random() * 26,
    })
  }
  return clusters
}

/**
 * plan3.md C2 (§1.1: "sin clustering ni ruido de densidad"): clumped,
 * density-falloff placement instead of the old uniform scatter. Each
 * instance belongs to one of CLUSTER_COUNT patches; `radius = cluster.radius
 * * random()` (not `* Math.sqrt(random())`) is deliberate — sampling radius
 * uniformly rather than area-uniformly concentrates instances toward each
 * cluster's own center, which *is* the density falloff the item asks for,
 * with no separate rejection pass needed.
 */
export function buildVegetationInstances(count: number = VEGETATION_MAX, seed: number = VEGETATION_SEED): VegetationInstance[] {
  const random = seededRandom(seed)
  const clusters = buildClusters(random)
  const instances: VegetationInstance[] = []
  for (let index = 0; index < count; index += 1) {
    const cluster = clusters[index % clusters.length]
    const radius = cluster.radius * random()
    const theta = random() * Math.PI * 2
    instances.push({
      x: cluster.x + Math.cos(theta) * radius,
      z: cluster.z + Math.sin(theta) * radius,
      rotationY: random() * Math.PI * 2,
      scaleXZ: 0.65 + random() * 1.1,
      scaleY: 0.55 + random() * 1.05,
      colorT: random(),
    })
  }
  return instances
}
