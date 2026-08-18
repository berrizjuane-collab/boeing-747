import { Color, MeshStandardMaterial, type MeshStandardMaterialParameters, type WebGLProgramParametersWithUniforms } from 'three'

export interface CanopyMistMaterialHandles {
  material: MeshStandardMaterial
  /** Mutated per frame from outside via canopyMist.ts's computeCanopyMistColor — same external-uniform-ref pattern terrainGroundMaterial.ts (G4) and skyDomeMaterial.ts already use. */
  canopyMistColor: { value: Color }
}

/**
 * plan4.md §3.6/Fase H: the same onBeforeCompile fog-blend-target patch
 * terrainGroundMaterial.ts (G4) already verified character-for-character
 * against three.js's real fog_fragment/fog_pars_fragment chunks — extracted
 * here (not imported from that file) so Fase G's already-shipped-and-tested
 * material stays untouched while Forest.tsx and Grass.tsx's new materials
 * get the identical "warm, brighter-with-distance" canopy mist instead of
 * the scene-wide fogColor three.js would otherwise rewrite into every
 * fog:true material every frame.
 *
 * Exported standalone (not only via createCanopyMistMaterial below) so
 * Grass.tsx can compose it with its own onBeforeCompile vertex-shader wind
 * patch on the same material, instead of two competing onBeforeCompile
 * callbacks racing to overwrite each other.
 */
export function applyCanopyMistFogPatch(shader: WebGLProgramParametersWithUniforms, canopyMistColor: { value: Color }): void {
  shader.uniforms.canopyMistColor = canopyMistColor
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 canopyMistColor;')
    .replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float terrainFogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float terrainFogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, canopyMistColor, terrainFogFactor );
#endif`,
    )
}

export function createCanopyMistMaterial(cacheKeyTag: string, params: MeshStandardMaterialParameters): CanopyMistMaterialHandles {
  const material = new MeshStandardMaterial(params)
  const canopyMistColor = { value: new Color('#e9a66c') }

  material.onBeforeCompile = (shader) => applyCanopyMistFogPatch(shader, canopyMistColor)
  // Distinct per caller: two onBeforeCompile-patched materials with the same
  // defines/uniforms shape but different patch text must not share a
  // cached program (same risk terrainGroundMaterial.ts documents).
  material.customProgramCacheKey = () => `meridian-canopy-mist-${cacheKeyTag}`

  return { material, canopyMistColor }
}
