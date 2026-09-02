import { DoubleSide, MeshStandardMaterial } from 'three'
import { patchCanopyMist } from './canopyMist'

export interface GrassMaterialHandles {
  material: MeshStandardMaterial
  windTime: { value: number }
}

/**
 * plan4.md H3: lit PBR grass — no emissive floor (bug #19 closed: the
 * hemisphere light from plan3 B1 is the floor now), per-vertex AO and
 * per-instance colour through `vertexColors`, shared canopy mist, and a
 * vertex-shader wind bend that scales with `aHeight²` so roots stay put
 * while tips sway. `windTime` is advanced by the GrassField component and
 * frozen under prefers-reduced-motion.
 */
export function createGrassMaterial(): GrassMaterialHandles {
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    side: DoubleSide,
  })
  const windTime = { value: 0 }

  patchCanopyMist(material, 'meridian-grass-wind', {
    uniforms: { windTime },
    vertex: (shader) =>
      shader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aHeight;
uniform float windTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
	vec2 grassOrigin = vec2( instanceMatrix[3][0], instanceMatrix[3][2] );
#else
	vec2 grassOrigin = vec2( 0.0 );
#endif
float grassPhase = windTime * 1.7 + grassOrigin.x * 0.13 + grassOrigin.y * 0.09;
float grassGust = 0.55 + 0.45 * sin( grassPhase ) + 0.3 * sin( grassPhase * 2.31 + 1.3 );
float grassBend = grassGust * 0.22 * aHeight * aHeight;
transformed.x += grassBend * 0.86;
transformed.z += grassBend * 0.5;`,
        ),
  })

  return { material, windTime }
}
