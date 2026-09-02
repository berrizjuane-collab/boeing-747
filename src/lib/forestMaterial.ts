import { Color, DoubleSide, MeshStandardMaterial } from 'three'
import { patchCanopyMist } from './canopyMist'

/**
 * One MeshStandardMaterial for every tree/shrub band: real PBR lighting
 * (key/fill/rim/hemisphere + IBL, same as the aircraft), baked per-vertex
 * AO via `vertexColors`, per-instance foliage colour via `instanceColor`,
 * trunk colour mixed in from a uniform on `aFoliage == 0` vertices
 * (treeGeometry.ts), and the shared canopy mist (canopyMist.ts) instead of
 * the scene fog colour.
 *
 * A subtle wind sway is applied in the vertex shader — foliage vertices
 * only, amplitude growing with height — driven by `windTime`, which the
 * Forest component freezes under prefers-reduced-motion.
 */
export interface ForestMaterialHandles {
  material: MeshStandardMaterial
  windTime: { value: number }
}

export function createForestMaterial(trunkColor = '#4a3424', sway = 0.06): ForestMaterialHandles {
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
    side: DoubleSide,
  })
  const windTime = { value: 0 }
  const trunk = { value: new Color(trunkColor) }
  const swayAmplitude = { value: sway }

  patchCanopyMist(material, `meridian-forest-${trunkColor}-${sway}`, {
    uniforms: { trunkColor: trunk, windTime, swayAmplitude },
    vertex: (shader) =>
      shader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aFoliage;
uniform vec3 trunkColor;
uniform float windTime;
uniform float swayAmplitude;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
vColor.rgb = mix( trunkColor * vColor.rgb, vColor.rgb, aFoliage );`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
#ifdef USE_INSTANCING
	vec3 forestInstanceOrigin = vec3( instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2] );
#else
	vec3 forestInstanceOrigin = vec3( 0.0 );
#endif
float forestPhase = windTime * 0.9 + forestInstanceOrigin.x * 0.045 + forestInstanceOrigin.z * 0.031;
float forestSway = sin( forestPhase ) * swayAmplitude * aFoliage * max( 0.0, position.y ) * 0.08;
transformed.x += forestSway;
transformed.z += forestSway * 0.6;`,
        ),
  })

  return { material, windTime }
}
