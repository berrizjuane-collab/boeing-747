import { Color, type MeshStandardMaterial, Vector3, DoubleSide } from 'three'

export interface DissolveUniforms {
  edgeGlow: { value: Color }
  portal1Center: { value: Vector3 }
  portal1Radius: { value: number }
  portal2Center: { value: Vector3 }
  portal2Radius: { value: number }
}

/**
 * Fase 4 threshold spike: radially dissolves the fuselage skin around a
 * fixed world-space point, opening a "portal" the camera can fly through.
 * Two independent portals share one material — the S4 nose entry and the
 * S6 upper-deck exit — each with its own center and radius, so the hole
 * opens and closes at a specific hull location rather than chasing the
 * camera around. See CameraRig.tsx / ThresholdController.tsx for how the
 * radii are driven from scroll progress.
 *
 * `edgeGlow` fakes the "motivated bloom" the plan calls for at the crossing
 * instant — real bloom is Fase 7 (the postprocessing pipeline isn't built
 * yet), but an emissive rim right at the dissolve edge gets most of the
 * visual read for a fraction of the cost.
 *
 * Rebuilt post-Fase-9 (found during a plain-language "why does this look
 * unfinished" check, not caught by any of the console-error/network-error
 * verification passes that closed Fases 3-8): the original version was a
 * bespoke `ShaderMaterial` with no texture sample and no lighting at all —
 * `gl_FragColor = vec4(mix(color, edgeGlow, glow), 1.0)`, a flat, unlit
 * `#d8dbe0` gray *everywhere* `portalRadius` is 0, which is the entire
 * fuselage for the whole site outside the few seconds of S4/S6 threshold
 * crossing. It replaced the real textured PBR material
 * (`baseColorTexture` + `roughness`/`metalness` from the glTF, verified real
 * in Fase 3/`ASSET_AUDIT.md`) on the mesh named "A380" unconditionally
 * (`ExteriorAsset.tsx`'s traverse), not just inside the dissolve band, so
 * the livery/paint/window detail in the source texture (confirmed present —
 * see `blender/source/A380.JPG`) never reached the screen at all. Every
 * prior verification pass checked for console/network errors and scene
 * structure (silhouette, proportions, hotspots in the right place), never
 * "does the surface actually show the texture" — a real gap in the
 * verification method, not just a rendering bug.
 *
 * Fix: instead of a from-scratch shader, this now takes the mesh's real
 * loaded material and extends it via `onBeforeCompile`, injecting the same
 * portal-mask discard and edge-glow mix into three.js's own
 * MeshStandardMaterial shader chunks. That keeps the built-in PBR lighting
 * pipeline (texture sampling, roughness/metalness response to the scene's
 * hemisphere + directional lights, shadow receiving) completely intact, and
 * only adds the dissolve behavior on top — the portal effect and the real
 * livery are no longer mutually exclusive.
 */
export function createDissolveHullMaterial(sourceMaterial: MeshStandardMaterial) {
  const material = sourceMaterial.clone()
  material.side = DoubleSide
  material.shadowSide = DoubleSide

  const uniforms: DissolveUniforms = {
    edgeGlow: { value: new Color('#8fd8ff') },
    portal1Center: { value: new Vector3(0, 40, -114) },
    portal1Radius: { value: 0 },
    portal2Center: { value: new Vector3(0, 44, -52) },
    portal2Radius: { value: 0 },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWorldPosition_dissolve = (modelMatrix * vec4(position, 1.0)).xyz;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vWorldPosition_dissolve;`,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform vec3 edgeGlow;
      uniform vec3 portal1Center;
      uniform float portal1Radius;
      uniform vec3 portal2Center;
      uniform float portal2Radius;
      varying vec3 vWorldPosition_dissolve;

      const float DISSOLVE_EDGE_BAND = 0.7;

      // 0 inside the hole (fully dissolved), 1 well outside it, smooth band between.
      float dissolvePortalMask(vec3 p, vec3 center, float radius) {
        if (radius < 0.001) return 1.0;
        float d = distance(p, center);
        return smoothstep(radius, radius + DISSOLVE_EDGE_BAND, d);
      }

      float dissolvePortalGlow(vec3 p, vec3 center, float radius) {
        if (radius < 0.001) return 0.0;
        float d = distance(p, center);
        float band = 1.0 - smoothstep(radius, radius + DISSOLVE_EDGE_BAND, d);
        float inside = 1.0 - smoothstep(radius - DISSOLVE_EDGE_BAND, radius, d);
        return band * inside;
      }`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `float dissolveMask = min(
        dissolvePortalMask(vWorldPosition_dissolve, portal1Center, portal1Radius),
        dissolvePortalMask(vWorldPosition_dissolve, portal2Center, portal2Radius)
      );
      if (dissolveMask < 0.02) discard;

      float dissolveGlow = max(
        dissolvePortalGlow(vWorldPosition_dissolve, portal1Center, portal1Radius),
        dissolvePortalGlow(vWorldPosition_dissolve, portal2Center, portal2Radius)
      );
      gl_FragColor.rgb = mix(gl_FragColor.rgb, edgeGlow, dissolveGlow);
      #include <dithering_fragment>`,
    )
  }

  return { material, uniforms }
}
