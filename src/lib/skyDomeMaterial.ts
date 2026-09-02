import { ShaderMaterial, Texture, BackSide, Color } from 'three'
import { canopyMistColor } from './canopyMist'

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
 *
 * plan4.md Fase I1/I2 (bug #14): a horizon haze band. The HDRI colour is
 * blended toward `mistColor` by `hazeStrength · exp(−elevation ·
 * hazeFalloff)` — full mist at and below the horizon, ~46 % two degrees
 * up, ~15 % five degrees up, gone by ten. The terrain (G4), forest and
 * grass converge to the same shared canopy-mist uniform from below, so
 * there is no colour step left at the horizon line. The sunset dome passes
 * its own mist uniform (the warm S6 fog colour, EnvironmentPlaceholder.tsx)
 * so both domes are this one shader.
 */
export interface SkyDomeOptions {
  mistColor?: { value: Color }
  hazeFalloff?: number
  hazeStrength?: number
  /** Haze applied to the dome's below-horizon half (0..1). 1 for the hero dome, where the terrain owns that half anyway; lower for the sunset dome so the HDRI's dusk gradient survives under the horizon. */
  belowHorizonHaze?: number
}

export function createSkyDomeMaterial(goldenHourMap: Texture, highAltitudeMap: Texture, options: SkyDomeOptions = {}) {
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
      mistColor: options.mistColor ?? canopyMistColor,
      hazeFalloff: { value: options.hazeFalloff ?? 22 },
      hazeStrength: { value: options.hazeStrength ?? 0.94 },
      belowHorizonHaze: { value: options.belowHorizonHaze ?? 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vSkyUv;
      varying vec3 vSkyDirection;
      void main() {
        vSkyUv = uv;
        // The dome is centred on the world origin and ~1200 u across; the
        // camera never strays more than a few tens of units from that
        // centre while a dome is visible, so the local vertex direction is
        // the view direction to within a fraction of a degree.
        vSkyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D goldenHourMap;
      uniform sampler2D highAltitudeMap;
      uniform float mixFactor;
      uniform float opacity;
      uniform vec3 mistColor;
      uniform float hazeFalloff;
      uniform float hazeStrength;
      uniform float belowHorizonHaze;
      varying vec2 vSkyUv;
      varying vec3 vSkyDirection;

      void main() {
        vec3 golden = texture2D(goldenHourMap, vSkyUv).rgb;
        vec3 highAltitude = texture2D(highAltitudeMap, vSkyUv).rgb;
        vec3 sky = mix(golden, highAltitude, mixFactor);
        float elevation = vSkyDirection.y;
        float haze = exp(-max(elevation, 0.0) * hazeFalloff) * hazeStrength;
        // Below the horizon the terrain/mist already owns the frame; keep
        // the dome fully hazed there so any sliver that shows through past
        // the terrain disc edge is mist, not the HDRI's own ground half.
        haze = mix(haze, hazeStrength * belowHorizonHaze, smoothstep(0.0, -0.06, elevation));
        gl_FragColor = vec4(mix(sky, mistColor, haze), opacity);
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
