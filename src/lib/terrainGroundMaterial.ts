import { Color, MeshStandardMaterial } from 'three'
import { canopyMistColor } from './canopyMist'

export interface TerrainGroundMaterialHandles {
  material: MeshStandardMaterial
  /** The shared canopyMist.ts uniform (round 5): mutated once per frame by TerrainGround, read by terrain, forest, grass, hills and both sky domes. */
  canopyMistColor: { value: Color }
}

/**
 * plan4.md G4/§3.6: "el terreno se disuelve en una bruma de dosel cálida y
 * más luminosa, no en el color de niebla genérico de la escena." Three.js
 * rewrites `fogColor`/`fogDensity` from `scene.fog` on *every* material with
 * `fog: true` each frame, so a fog-blend target color that differs per
 * material can't survive leaving that mechanism untouched — verified
 * against this project's actual three.js source
 * (node_modules/three/src/renderers/shaders/ShaderChunk/fog_fragment.glsl.js):
 * `mix(gl_FragColor.rgb, fogColor, fogFactor)`, where `fogColor` is one
 * scene-wide uniform.
 *
 * This keeps `material.fog = true` (the default) — so `fogDensity` and the
 * `vFogDepth` varying stay bound automatically from `scene.fog`, exactly
 * mirroring §3.6's "densidad copiada de scene.fog.density" with no manual
 * copy to go stale — but replaces the *fragment* shader's `fog_fragment`
 * chunk with an otherwise-identical copy that blends toward
 * `canopyMistColor` instead of the shared `fogColor` uniform. Nothing else
 * about the standard PBR pipeline is touched: lighting, the diffuse map
 * (G2) and the tint mix (G3, via the ordinary `material.color`) all still
 * go through three.js's own machinery unmodified.
 */
export function createTerrainGroundMaterial(): TerrainGroundMaterialHandles {
  const material = new MeshStandardMaterial({
    // Same starting flat colour EnvironmentPlaceholder.tsx's old ground
    // plane shipped with; still overwritten every frame from theme.ground
    // exactly as before (see G3's tint-mix in EnvironmentPlaceholder.tsx).
    color: '#59664d',
    roughness: 1,
    // Preserves the existing S2/S3-boundary crossfade (GROUND_FADE_START/
    // END in EnvironmentPlaceholder.tsx) — unrelated to G4's fog-colour
    // swap above, and out of scope this round (plan4.md §3.4: the 30.5%
    // gate isn't touched).
    transparent: true,
  })

  material.onBeforeCompile = (shader) => {
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
  // Distinct cache key: onBeforeCompile-patched materials otherwise risk
  // sharing a compiled program with an unrelated MeshStandardMaterial that
  // happens to hash the same (same defines/uniforms structure) but lacks
  // this patch.
  material.customProgramCacheKey = () => 'meridian-terrain-ground-canopy-mist'

  return { material, canopyMistColor }
}
