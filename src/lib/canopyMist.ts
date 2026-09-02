import { Color, type MeshStandardMaterial } from 'three'

/**
 * plan4.md §3.6 / G4, generalised for round 5: one shared "canopy mist"
 * colour — warmer and measurably brighter than `scene.fog.color` — that the
 * terrain (terrainGroundMaterial.ts), the forest (forestMaterial.ts), the
 * grass (grassMaterial.ts) and the hill ring all converge toward with
 * distance. One uniform object, mutated once per frame by TerrainGround,
 * shared by reference so every ground-level material dissolves into the
 * identical colour instead of four slightly different ones.
 *
 * The sky domes (skyDomeMaterial.ts) bind the same uniform for their
 * horizon band (plan4.md Fase I1): the terrain converges to this colour
 * from below and the sky converges to it from above, so there is no
 * remaining colour step at the horizon line (bug #14).
 */
export const canopyMistColor = { value: new Color('#e9a66c') }

const hsl = { h: 0, s: 0, l: 0 }

/** Warmer (+0.02 hue), at least moderately saturated, and +0.22 lightness over the section background. */
export function updateCanopyMistColor(themeBackground: Color): Color {
  canopyMistColor.value.copy(themeBackground)
  canopyMistColor.value.getHSL(hsl)
  canopyMistColor.value.setHSL((hsl.h + 0.02) % 1, Math.max(hsl.s, 0.4), Math.min(1, hsl.l + 0.22))
  return canopyMistColor.value
}

/** Fragment-shader replacement for three's `fog_fragment` chunk: identical
 * exp2/linear law (so depth matches every other fogged material in the
 * scene), blend target swapped from the scene-wide `fogColor` uniform to
 * `canopyMistColor`. */
export const CANOPY_MIST_FOG_FRAGMENT = /* glsl */ `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float canopyFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float canopyFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, canopyMistColor, canopyFogFactor );
#endif`

export interface CanopyMistPatchOptions {
  /** Extra vertex-shader edit applied after the mist patch. */
  vertex?: (vertexShader: string) => string
  /** Extra fragment-shader edit applied after the mist patch. */
  fragment?: (fragmentShader: string) => string
  /** Extra uniforms merged into the compiled program. */
  uniforms?: Record<string, { value: unknown }>
}

/**
 * Installs the canopy-mist fog swap on a MeshStandardMaterial (keeping
 * `material.fog = true` so `fogDensity`/`vFogDepth` stay bound to
 * `scene.fog` automatically) and gives callers one place to chain further
 * shader edits. `cacheKey` must be unique per distinct patch so three never
 * shares a compiled program between two differently-patched materials.
 */
export function patchCanopyMist(material: MeshStandardMaterial, cacheKey: string, options: CanopyMistPatchOptions = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.canopyMistColor = canopyMistColor
    if (options.uniforms) Object.assign(shader.uniforms, options.uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 canopyMistColor;')
      .replace('#include <fog_fragment>', CANOPY_MIST_FOG_FRAGMENT)
    if (options.vertex) shader.vertexShader = options.vertex(shader.vertexShader)
    if (options.fragment) shader.fragmentShader = options.fragment(shader.fragmentShader)
  }
  material.customProgramCacheKey = () => cacheKey
  return material
}
