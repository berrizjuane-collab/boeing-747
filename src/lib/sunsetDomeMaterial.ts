import { BackSide, Color, ShaderMaterial, Texture } from 'three'
import {
  horizonBandFragmentParsChunk,
  horizonBandVertexMainChunk,
  horizonBandVertexParsChunk,
  HORIZON_BAND_HALF_SIN,
} from './skyHorizonBand'

export interface SunsetDomeMaterialHandles {
  material: ShaderMaterial
  /** Mutated per frame from outside — same pattern as skyDomeMaterial.ts's horizonHazeColor. */
  horizonHazeColor: { value: Color }
  /** `.opacity` isn't a plain material property on a ShaderMaterial the way it is on MeshBasicMaterial — this uniform is what EnvironmentPlaceholder.tsx's per-frame sunsetWeight() ramp now writes into instead. */
  opacity: { value: number }
}

/**
 * plan4.md Fase I2/bug #14: the S6 sunset dome — previously a plain
 * MeshBasicMaterial(single equirect texture, fog:false, faded in/out via
 * `.opacity`) — gets the identical horizon-haze-band treatment
 * skyDomeMaterial.ts (I1) applies to the S1-S3 golden/high-altitude dome.
 * Rebuilt as a small ShaderMaterial rather than patched via
 * onBeforeCompile: a MeshBasicMaterial's fragment chunk order (map_fragment
 * vs. the later opaque/dithering chunks) isn't documented the way
 * fog_fragment is elsewhere in this codebase, and this shader is simple
 * enough (one texture sample) that writing it directly is less risky than
 * guessing an injection point in a built-in material's assembled shader.
 */
export function createSunsetDomeMaterial(sunsetMap: Texture): SunsetDomeMaterialHandles {
  const horizonHazeColor = { value: new Color('#e9a66c') }
  const opacity = { value: 0 }
  const material = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    uniforms: {
      sunsetMap: { value: sunsetMap },
      opacity,
      horizonHazeColor,
      horizonBandHalfSin: { value: HORIZON_BAND_HALF_SIN },
    },
    vertexShader: /* glsl */ `
      varying vec2 vSkyUv;
      ${horizonBandVertexParsChunk}
      void main() {
        vSkyUv = uv;
        ${horizonBandVertexMainChunk}
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D sunsetMap;
      uniform float opacity;
      varying vec2 vSkyUv;
      ${horizonBandFragmentParsChunk}

      void main() {
        vec3 skyColor = texture2D(sunsetMap, vSkyUv).rgb;
        skyColor = applyHorizonHazeBand(skyColor);
        gl_FragColor = vec4(skyColor, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  return { material, horizonHazeColor, opacity }
}
