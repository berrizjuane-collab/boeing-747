import { Color, ShaderMaterial, Vector3, DoubleSide } from 'three'

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
 */
export function createDissolveHullMaterial() {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      color: { value: new Color('#d8dbe0') },
      edgeGlow: { value: new Color('#8fd8ff') },
      portal1Center: { value: new Vector3(0, 40, -114) },
      portal1Radius: { value: 0 },
      portal2Center: { value: new Vector3(0, 44, -52) },
      portal2Radius: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform vec3 edgeGlow;
      uniform vec3 portal1Center;
      uniform float portal1Radius;
      uniform vec3 portal2Center;
      uniform float portal2Radius;
      varying vec3 vWorldPosition;

      const float EDGE_BAND = 0.7;

      // 0 inside the hole (fully dissolved), 1 well outside it, smooth band between.
      float portalMask(vec3 p, vec3 center, float radius) {
        if (radius < 0.001) return 1.0;
        float d = distance(p, center);
        return smoothstep(radius, radius + EDGE_BAND, d);
      }

      float portalGlow(vec3 p, vec3 center, float radius) {
        if (radius < 0.001) return 0.0;
        float d = distance(p, center);
        float band = 1.0 - smoothstep(radius, radius + EDGE_BAND, d);
        float inside = 1.0 - smoothstep(radius - EDGE_BAND, radius, d);
        return band * inside;
      }

      void main() {
        float mask = min(
          portalMask(vWorldPosition, portal1Center, portal1Radius),
          portalMask(vWorldPosition, portal2Center, portal2Radius)
        );
        if (mask < 0.02) discard;

        float glow = max(
          portalGlow(vWorldPosition, portal1Center, portal1Radius),
          portalGlow(vWorldPosition, portal2Center, portal2Radius)
        );

        vec3 finalColor = mix(color, edgeGlow, glow);
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  })
}
