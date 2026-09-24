import type { Material, Object3D } from 'three'
import { DETAIL_CULL_OPACITY } from './worldPersistence'

/**
 * The aerodrome used to be culled in one frame once the cloud deck reached
 * 98 % opacity. A frame-by-frame sweep showed what that cost: the horizon
 * forest (outside the deck's opaque disc), the terminal roofs and the 46 m
 * control tower (taller than the aircraft's own 31 m cruise height, so always
 * above the 14 m deck) were all on screen at 0.261 and gone at 0.262.
 *
 * Every material under the aerodrome and the terrain now dissolves with a
 * screen-space dither as the deck closes, finishing just before the cull, so
 * the cull removes nothing that can still be seen. Discarding keeps the
 * materials opaque: no sorting changes, no transparency on a forest.
 */
export const deckDissolveUniform = { value: 0 }

/** Deck opacity at which the dissolve begins; it completes at the cull threshold. */
export const DISSOLVE_START_OPACITY = 0.35

export function deckDissolveAmount(deckOpacity: number): number {
  const t = Math.min(1, Math.max(0, (deckOpacity - DISSOLVE_START_OPACITY) / (DETAIL_CULL_OPACITY - DISSOLVE_START_OPACITY)))
  return t * t * (3 - 2 * t)
}

const PATCHED = Symbol('deckDissolve')

/** Adds the dither discard to `material`, preserving any existing patch. */
export function patchDeckDissolve(material: Material) {
  const tagged = material as Material & { [PATCHED]?: true }
  if (tagged[PATCHED]) return
  tagged[PATCHED] = true
  const previousCompile = material.onBeforeCompile.bind(material)
  // Resolved now, before onBeforeCompile is replaced: three's default key is
  // `onBeforeCompile.toString()`, which after wrapping would be the same
  // string for every patched material whatever patch it carried before.
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer)
    shader.uniforms.uDeckDissolve = deckDissolveUniform
    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      /* glsl */ `uniform float uDeckDissolve;
void main() {
  if (uDeckDissolve > 0.0) {
    // Interleaved gradient noise: an even, pattern-free dither per pixel.
    float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (threshold < uDeckDissolve) discard;
  }`,
    )
  }
  material.customProgramCacheKey = () => `${previousKey}|deck-dissolve`
  material.needsUpdate = true
}

/** Patches every material under `root` that is not patched yet. */
export function patchDeckDissolveTree(root: Object3D) {
  root.traverse((object) => {
    const material = (object as Object3D & { material?: Material | Material[] }).material
    if (!material) return
    for (const entry of Array.isArray(material) ? material : [material]) patchDeckDissolve(entry)
  })
}
