import { BlendFunction, Effect } from 'postprocessing'
import { Color, Uniform } from 'three'

// Display-space split-tone shift, not a full lift/gamma/gain grade: PostFX
// places this effect immediately after ACES, so the thresholds below operate
// on the intended 0..1 display range rather than an unbounded HDR buffer.
// Shadows get pushed
// toward `shadowColor`, highlights toward `highlightColor`, each shift
// scaled down (0.35 / 0.25) and centered on the tint color's midpoint
// (`color - 0.5`) so a light tint (e.g. S3's white acento) doesn't blow out
// highlights and a dark one doesn't crush shadows to black — this is meant
// to read as a photographic grade layered over the existing lighting, not a
// recolor of the frame.
const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 shadowColor;
  uniform vec3 highlightColor;
  uniform float strength;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    float shadowWeight = 1.0 - smoothstep(0.0, 0.55, lum);
    float highlightWeight = smoothstep(0.45, 1.0, lum);
    vec3 graded = inputColor.rgb;
    graded += (shadowColor - 0.5) * 0.35 * shadowWeight;
    graded += (highlightColor - 0.5) * 0.25 * highlightWeight;
    outputColor = vec4(mix(inputColor.rgb, graded, strength), inputColor.a);
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
        // Updated every frame from sectionGrading.ts; a zero default makes a
        // missed update visibly fail instead of silently freezing at 0.5.
        ['strength', new Uniform(0)],
      ]),
    })
  }
}
