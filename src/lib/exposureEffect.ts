import { BlendFunction, Effect } from 'postprocessing'
import { Uniform } from 'three'

const FRAGMENT_SHADER = /* glsl */ `
  uniform float exposureValue;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor = vec4(inputColor.rgb * exposureValue, inputColor.a);
  }
`

/**
 * Replaces the renderer-level `gl.toneMappingExposure` that stopped having
 * any effect once PostFX.tsx started forcing NoToneMapping — see
 * exposureState.ts. Mounted first in the composer chain (PostFX.tsx) so
 * exposure applies to the raw scene color before bloom's threshold
 * extraction and the tone curve, the same order a real camera's exposure
 * would sit relative to those.
 */
export class ExposureEffect extends Effect {
  constructor() {
    super('ExposureEffect', FRAGMENT_SHADER, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([['exposureValue', new Uniform(1)]]),
    })
  }
}
