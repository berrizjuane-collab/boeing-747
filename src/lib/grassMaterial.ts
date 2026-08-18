import { Color, DoubleSide, MeshStandardMaterial } from 'three'
import { applyCanopyMistFogPatch } from './canopyMistMaterial'

export interface GrassMaterialHandles {
  material: MeshStandardMaterial
  /** Mutated per frame — see canopyMist.ts. */
  canopyMistColor: { value: Color }
  /** Advanced per frame only when !reducedMotionState.active — see Grass.tsx, same bypass pattern DustParticles/RunwayEnvironment.tsx already use elsewhere in this file tree. */
  windTime: { value: number }
}

const WIND_STRENGTH = 0.18

/**
 * plan4.md H3: per-instance wind sway lives entirely in the vertex shader —
 * an offset spliced in right after `#include <begin_vertex>`, i.e. in the
 * blade's own LOCAL space *before* instanceMatrix is applied (verified
 * against three.js's real begin_vertex.glsl.js/project_vertex.glsl.js: the
 * instancing multiply happens later, inside project_vertex) — rather than
 * rewriting thousands of instance matrices on the CPU every frame. Sway is
 * quadratic in local Y (transformed.y — the blade's own root-to-tip axis,
 * apex at y=1 in grassGeometry.ts) so the root stays planted and the tip
 * moves most. Per-instance phase comes from the instance's own world
 * position (instanceMatrix's translation column, i.e. column index 3) run
 * through a cheap sine dot-product hash, so a whole field of blades doesn't
 * sway in lockstep like one rigid sheet.
 */
export function createGrassMaterial(): GrassMaterialHandles {
  const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, side: DoubleSide })
  const canopyMistColor = { value: new Color('#e9a66c') }
  const windTime = { value: 0 }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
	float windPhase = dot( instanceMatrix[ 3 ].xz, vec2( 12.9898, 78.233 ) );
	float windSway = sin( windTime * 1.6 + windPhase ) * ${WIND_STRENGTH.toFixed(3)};
	transformed.x += windSway * transformed.y * transformed.y;
#endif`,
      )
    applyCanopyMistFogPatch(shader, canopyMistColor)
  }
  material.customProgramCacheKey = () => 'meridian-grass-wind-canopy-mist'

  return { material, canopyMistColor, windTime }
}
