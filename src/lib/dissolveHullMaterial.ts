import { Color, DoubleSide, type Material, MeshStandardMaterial, Vector3 } from 'three'

export interface DissolveUniforms {
  edgeGlow: { value: Color }
  portal1Center: { value: Vector3 }
  portal1Radius: { value: number }
  portal2Center: { value: Vector3 }
  portal2Radius: { value: number }
}

export type DissolveHullMaterial = MeshStandardMaterial & {
  userData: Record<string, unknown> & { dissolveUniforms: DissolveUniforms }
}

/**
 * Adds the two threshold portals to the GLB's real MeshStandardMaterial.
 *
 * The first implementation replaced that material with a bare ShaderMaterial,
 * which made the KTX2 albedo and all PBR response unreachable even though the
 * asset pipeline loaded them correctly. Patching the standard shader keeps the
 * original map, roughness, lighting and tone-mapping path, then applies only
 * the world-space discard and emissive edge that the transition needs.
 */
export function createDissolveHullMaterial(baseMaterial: Material): DissolveHullMaterial {
  if (!(baseMaterial as MeshStandardMaterial).isMeshStandardMaterial) {
    throw new Error('The A380 hull must use a MeshStandardMaterial before applying the dissolve portal.')
  }

  const material = (baseMaterial as MeshStandardMaterial).clone() as DissolveHullMaterial
  const uniforms: DissolveUniforms = {
    edgeGlow: { value: new Color('#8fd8ff') },
    portal1Center: { value: new Vector3(0, 40, -114) },
    portal1Radius: { value: 0 },
    portal2Center: { value: new Vector3(0, 44, -52) },
    portal2Radius: { value: 0 },
  }

  material.side = DoubleSide
  material.shadowSide = DoubleSide
  material.userData = { ...material.userData, dissolveUniforms: uniforms }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDissolveWorldPosition;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vDissolveWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 edgeGlow;
uniform vec3 portal1Center;
uniform float portal1Radius;
uniform vec3 portal2Center;
uniform float portal2Radius;
varying vec3 vDissolveWorldPosition;

const float DISSOLVE_EDGE_BAND = 0.7;

float dissolvePortalMask(vec3 point, vec3 center, float radius) {
  if (radius < 0.001) return 1.0;
  return smoothstep(radius, radius + DISSOLVE_EDGE_BAND, distance(point, center));
}

float dissolvePortalGlow(vec3 point, vec3 center, float radius) {
  if (radius < 0.001) return 0.0;
  float distanceFromCenter = distance(point, center);
  return 1.0 - smoothstep(radius, radius + DISSOLVE_EDGE_BAND, distanceFromCenter);
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float dissolveMask = min(
  dissolvePortalMask(vDissolveWorldPosition, portal1Center, portal1Radius),
  dissolvePortalMask(vDissolveWorldPosition, portal2Center, portal2Radius)
);
if (dissolveMask < 0.02) discard;

float dissolveGlow = max(
  dissolvePortalGlow(vDissolveWorldPosition, portal1Center, portal1Radius),
  dissolvePortalGlow(vDissolveWorldPosition, portal2Center, portal2Radius)
);
outgoingLight = mix(outgoingLight, edgeGlow, dissolveGlow);

#include <opaque_fragment>`,
      )
  }
  material.customProgramCacheKey = () => 'a380-dissolve-pbr-v2'
  material.needsUpdate = true
  return material
}
