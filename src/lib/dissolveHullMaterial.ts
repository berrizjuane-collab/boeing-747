import { Color, DoubleSide, type Material, MeshStandardMaterial, Vector2, Vector3 } from 'three'
import { createAircraftSurfaceMaps, type AircraftSurfaceMaps } from './aircraftSurfaceMaps'
import { EXIT_PORTAL, NOSE_PORTAL } from './thresholdPortals'

export interface DissolveUniforms {
  edgeGlow: { value: Color }
  portal1Center: { value: Vector3 }
  portal1Radius: { value: number }
  portal2Center: { value: Vector3 }
  portal2Radius: { value: number }
}

/**
 * Object-space tiles per world unit for the procedural surface detail.
 * The tile carries two vertical panel seams and four horizontal ones, so a
 * third of a tile per unit puts seams about 1.5 and 0.75 units apart on a
 * 72-unit fuselage — panel-line scale, not fabric scale.
 */
const SURFACE_TILES_PER_UNIT = 1 / 3

export type DissolveHullMaterial = MeshStandardMaterial & {
  userData: Record<string, unknown> & {
    aircraftSurfaceMaps: AircraftSurfaceMaps
    dissolveUniforms: DissolveUniforms
  }
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
  const aircraftSurfaceMaps = createAircraftSurfaceMaps()
  const uniforms: DissolveUniforms = {
    edgeGlow: { value: new Color('#8fd8ff') },
    portal1Center: { value: NOSE_PORTAL.center.clone() },
    portal1Radius: { value: 0 },
    portal2Center: { value: EXIT_PORTAL.center.clone() },
    portal2Radius: { value: 0 },
  }

  material.side = DoubleSide
  material.shadowSide = DoubleSide
  material.name = `${baseMaterial.name || 'A380_Hull'}_MERIDIAN_PBR`
  material.normalMap = aircraftSurfaceMaps.normal
  material.normalScale = new Vector2(0.32, 0.32)
  // plan6 5.2 / A19: deliberately *not* material.roughnessMap. An audit of
  // the shipped GLB (scripts/audit-exterior-surface.mjs) measured 16.3% of
  // the hull's 67,580 triangles carrying zero-area UVs, and texel density
  // varying 8.4x between the 5th and 95th percentiles. Any map bound to
  // TEXCOORD_0 therefore collapses to a single texel across a sixth of the
  // aircraft and is stretched unevenly across the rest. The procedural
  // roughness is projected from object space below instead, which needs no
  // UVs at all; the licensed albedo keeps its own, since only it knows
  // where the livery goes.
  material.roughness = 1
  material.userData = {
    ...material.userData,
    aircraftSurfaceMaps,
    dissolveUniforms: uniforms,
    surfaceProfile: {
      paint: { metalness: 0, roughness: '0.39–0.68 map-driven' },
      glass: { metalness: 0.02, roughness: 0.1 },
      exposedMetal: { metalness: 0.68, roughness: 0.24 },
    },
  }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.uniforms.meridianSurfaceRoughness = { value: aircraftSurfaceMaps.roughness }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vDissolveWorldPosition;
varying vec3 vMeridianObjectPosition;
varying vec3 vMeridianObjectNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vDissolveWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vMeridianObjectPosition = position;
vMeridianObjectNormal = normal;`,
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
uniform sampler2D meridianSurfaceRoughness;
varying vec3 vDissolveWorldPosition;
varying vec3 vMeridianObjectPosition;
varying vec3 vMeridianObjectNormal;

const float MERIDIAN_SURFACE_TILES_PER_UNIT = ${SURFACE_TILES_PER_UNIT};

// Triplanar sample of the panel/rivet roughness tile. The fourth power
// weighting keeps each face reading from one plane except close to a 45
// degree edge, where the blend is what avoids a visible join.
float meridianSurfaceDetail(vec3 objectPosition, vec3 objectNormal) {
  vec3 blend = pow(abs(normalize(objectNormal)), vec3(4.0));
  blend /= max(blend.x + blend.y + blend.z, 1e-4);
  vec3 p = objectPosition * MERIDIAN_SURFACE_TILES_PER_UNIT;
  return texture2D(meridianSurfaceRoughness, p.yz).g * blend.x
    + texture2D(meridianSurfaceRoughness, p.zx).g * blend.y
    + texture2D(meridianSurfaceRoughness, p.xy).g * blend.z;
}

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
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>

// Panel-level roughness, projected rather than sampled through the asset's
// own UVs — see the audit note above material.roughness.
roughnessFactor = meridianSurfaceDetail(vMeridianObjectPosition, vMeridianObjectNormal);

// The licensed source has one albedo atlas for every surface. Classify broad
// physical identities from that atlas, then retain the authored roughness
// tile above for panel-level variation. Dark neutral pixels are glazing;
// mid-value neutrals are exposed metal; saturated and bright pixels remain
// painted dielectric surfaces.
float meridianLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float meridianChroma = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b))
  - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
float meridianNeutral = 1.0 - smoothstep(0.055, 0.16, meridianChroma);
float meridianGlass = meridianNeutral * (1.0 - smoothstep(0.055, 0.16, meridianLuma));
float meridianMetal = meridianNeutral
  * smoothstep(0.18, 0.32, meridianLuma)
  * (1.0 - smoothstep(0.58, 0.78, meridianLuma));
roughnessFactor = mix(roughnessFactor, 0.10, meridianGlass);
roughnessFactor = mix(roughnessFactor, 0.24, meridianMetal);`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.02, meridianGlass);
metalnessFactor = mix(metalnessFactor, 0.68, meridianMetal);`,
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
  material.customProgramCacheKey = () => 'a380-dissolve-pbr-surface-v4-triplanar-roughness'
  material.needsUpdate = true
  return material
}
