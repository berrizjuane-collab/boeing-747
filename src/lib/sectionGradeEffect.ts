import { BlendFunction, Effect } from 'postprocessing'
import { Color, Uniform } from 'three'

// Split-tone shift, not a full lift/gamma/gain grade: shadows get pushed
// toward `shadowColor`, highlights toward `highlightColor`, each shift
// centered on the tint color's midpoint (`color - 0.5`) so a light tint
// (e.g. S3's white acento) doesn't blow out highlights and a dark one
// doesn't crush shadows to black — this is meant to read as a photographic
// grade layered over the existing lighting, not a recolor of the frame.
//
// plan3.md bug #4: this pass runs pre-tone-mapping on an HDR buffer
// (PostFX.tsx's chain puts SectionGrade before <ToneMapping>), where sky/sun
// pixels routinely carry luminance well past 1.0. The original
// `smoothstep(0.45, 1.0, lum)` saturated to 1.0 for nearly everything above
// a dim midtone, so "highlight" and "near-white" were indistinguishable, and
// the fixed additive shift that followed (~0.125 at most) was swamped by an
// HDR highlight's own magnitude (sky ~1-8) while overpowering true shadows
// (~0.05-0.1) — exactly the "only visible in shadows" the bug reports.
// Fixed two ways: weights are computed on a Reinhard-normalized luminance
// (`lum/(lum+1)`, maps [0,inf) to [0,1) so smoothstep discriminates across
// the actual HDR range instead of just its bottom slice), and the highlight
// shift scales with the pixel's own luminance (capped at whitePoint-like 4.0
// so it stays bounded near the sun disc) instead of being a fixed constant —
// proportional, so it survives being swamped by exposure or by tone mapping.
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 shadowColor;
  uniform vec3 highlightColor;

  // plan3.md bug #5: PLAN.md §10.1's grading table has no per-section
  // strength/intensity column, so this was never meant to vary — it was a
  // live uniform that nothing ever wrote after construction, permanently
  // frozen at its 0.5 default. Fixed as a compile-time constant instead of a
  // dead knob that only looked adjustable.
  const float STRENGTH = 0.5;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float perceptual = lum / (lum + 1.0);
    float shadowWeight = 1.0 - smoothstep(0.0, 0.55, perceptual);
    float highlightWeight = smoothstep(0.45, 1.0, perceptual);
    vec3 graded = inputColor.rgb;
    graded += (shadowColor - 0.5) * 0.35 * shadowWeight;
    graded += (highlightColor - 0.5) * 0.5 * highlightWeight * min(lum, 4.0);
    outputColor = vec4(mix(inputColor.rgb, graded, STRENGTH), inputColor.a);
  }
`

/**
 * PLAN.md §10.1's per-section grading, as a real post-process pass rather
 * than only the fog/background tint environmentTheme.ts already does — fog
 * only reads on distant/foggy pixels, this reaches the aircraft's own
 * shading too. Uniforms are updated per-frame from scroll progress
 * (SectionGrade.tsx), not React state or effect args, so section changes
 * don't require reconstructing the effect.
 */
export class SectionGradeEffect extends Effect {
  constructor() {
    super('SectionGradeEffect', FRAGMENT_SHADER, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['shadowColor', new Uniform(new Color())],
        ['highlightColor', new Uniform(new Color())],
      ]),
    })
  }
}
