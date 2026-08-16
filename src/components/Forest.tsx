import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DoubleSide, InstancedMesh as InstancedMeshImpl, MeshStandardMaterial, Object3D, StaticDrawUsage } from 'three'
import { buildForestInstances, FOREST_INSTANCE_COUNT } from '../lib/forestLayout'
import { createTreeBillboardGeometry } from '../lib/treeGeometry'
import { type QualityTier, useQualityStore } from '../state/qualityStore'

const TREE_BASE_WIDTH = 5
const TREE_BASE_HEIGHT = 9

// plan3.md §3.1's own budget table lists "+ bosque" as its own +1 draw call
// line even for Mobile Low — unlike grass, the forest is meant to stay
// visible (at reduced density) on every tier, not hidden whole.
const FOREST_TIER_COUNT: Record<QualityTier, number> = {
  high: FOREST_INSTANCE_COUNT,
  mid: Math.round(FOREST_INSTANCE_COUNT * 0.6),
  low: Math.round(FOREST_INSTANCE_COUNT * 0.35),
}

function createTreeMaterial() {
  const material = new MeshStandardMaterial({
    roughness: 0.88,
    side: DoubleSide,
    vertexColors: true,
    alphaTest: 0.5,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTreeUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeUv = uv;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        // plan3.md C1: the silhouette is painted analytically (same
        // "shader-computed, not sampled" approach as the existing cloud
        // material) — a rounded trunk plus three overlapping canopy lobes,
        // both built from one radial mask function so there's no rectangle-
        // vs-circle seam to solve. Declared at global scope (not inside
        // map_fragment's insertion point below, which sits inside main())
        // since GLSL doesn't allow nested function definitions.
        '#include <common>\nvarying vec2 vTreeUv;\nfloat treeCircleMask(vec2 uv, vec2 center, vec2 radius) {\n  return 1.0 - smoothstep(0.85, 1.0, length((uv - center) / radius));\n}',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  float treeCanopy = max(
    treeCircleMask(vTreeUv, vec2(0.5, 0.66), vec2(0.36, 0.30)),
    max(
      treeCircleMask(vTreeUv, vec2(0.28, 0.56), vec2(0.22, 0.20)),
      treeCircleMask(vTreeUv, vec2(0.72, 0.58), vec2(0.24, 0.21))
    )
  );
  float treeTrunk = treeCircleMask(vTreeUv, vec2(0.5, 0.14), vec2(0.05, 0.16));
  float treeShape = max(treeCanopy, treeTrunk);
  vec3 treeCanopyColor = vec3(0.22, 0.34, 0.16);
  vec3 treeTrunkColor = vec3(0.24, 0.18, 0.12);
  diffuseColor.rgb = mix(treeTrunkColor, treeCanopyColor, step(treeTrunk, treeCanopy));
  diffuseColor.a = treeShape;
}`,
      )
  }
  return material
}

/**
 * plan3.md C1/C4: real, instanced trees — a cross-billboard silhouette per
 * instance, one draw call for the whole forest regardless of tier or count
 * (InstancedMesh), replacing the "there are no trees at all" state the
 * audit found. See forestLayout.ts for the near/far placement split and
 * treeGeometry.ts / createTreeMaterial above for why normals and the
 * silhouette are authored rather than computed or sampled.
 */
export function Forest() {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const tier = useQualityStore((state) => state.tier)
  const geometry = useMemo(createTreeBillboardGeometry, [])
  const material = useMemo(createTreeMaterial, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const instances = buildForestInstances()
    const dummy = new Object3D()
    const shadeA = new Color('#2f4a26')
    const shadeB = new Color('#6d8a4a')
    const instanceColor = new Color()

    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    instances.forEach((instance, index) => {
      dummy.position.set(instance.x, 0, instance.z)
      dummy.rotation.set(0, instance.rotationY, 0)
      dummy.scale.set(TREE_BASE_WIDTH * instance.scale, TREE_BASE_HEIGHT * instance.scale, TREE_BASE_WIDTH * instance.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.copy(shadeA).lerp(shadeB, instance.colorT))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      name="Environment · Forest"
      args={[geometry, material, FOREST_INSTANCE_COUNT]}
      count={FOREST_TIER_COUNT[tier]}
      receiveShadow
    />
  )
}
