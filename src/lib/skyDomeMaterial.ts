import { ShaderMaterial, Texture, BackSide } from 'three'

/**
 * Single sky dome, single transparent surface, blending two equirectangular
 * HDRIs (golden-hour / high-altitude) by a per-pixel mix in one shader.
 *
 * Deliberately not two overlaid MeshBasicMaterial spheres each with their
 * own opacity: standard "over" alpha compositing of two stacked transparent
 * layers doesn't reduce to a linear crossfade unless one of them is fully
 * opaque (there's a quadratic cross-term and background leakage from the
 * layering itself). Mixing inside one shader sidesteps that — it's a single
 * opaque-alpha surface, so there's no compositing order to get wrong, and
 * `mixFactor` is a true linear interpolation between the two skies.
 *
 * `opacity` is the dome's overall visibility (1 across S1-S3, fading to 0
 * before S4 so scene.background's flat fog-matched color shows through
 * unchanged for S4-S7 — see hdriTheme.ts). Rendered BackSide because the
 * camera is always inside this sphere.
 */
export function createSkyDomeMaterial(goldenHourMap: Texture, highAltitudeMap: Texture) {
  return new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    // depthTest stays on (the default): this dome is huge (see SKY_RADIUS in
    // EnvironmentPlaceholder.tsx) and rendered first among transparent
    // objects, but it still needs to lose to opaque geometry already in the
    // depth buffer — the aircraft and ground are both much closer. Disabling
    // depthTest would make the sky paint over them regardless of distance.
    fog: false,
    toneMapped: true,
    uniforms: {
      goldenHourMap: { value: goldenHourMap },
      highAltitudeMap: { value: highAltitudeMap },
      mixFactor: { value: 0 },
      opacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vSkyUv;
      void main() {
        vSkyUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D goldenHourMap;
      uniform sampler2D highAltitudeMap;
      uniform float mixFactor;
      uniform float opacity;
      varying vec2 vSkyUv;

      void main() {
        vec3 golden = texture2D(goldenHourMap, vSkyUv).rgb;
        vec3 highAltitude = texture2D(highAltitudeMap, vSkyUv).rgb;
        gl_FragColor = vec4(mix(golden, highAltitude, mixFactor), opacity);
        // plan3.md bug #9: the material already declares toneMapped: true
        // above, but that flag only defines the TONE_MAPPING preprocessor
        // symbol — three.js never auto-injects the chunk itself into a
        // custom ShaderMaterial's source, so without these two includes
        // (present in this repo's other two custom shaders,
        // RunwayEnvironment.tsx's aircraft-shadow and soft-cloud materials)
        // toneMapped was a declared no-op, same shape as bug #8.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
