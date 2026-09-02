import { Box3, Color, type InstancedMesh, type Mesh, MeshStandardMaterial, type Object3D, Vector2, Vector3, type Texture } from 'three'
import {
  createBrushedMetalMaps,
  createCarpetAlbedo,
  createCockpitDisplayAtlas,
  createIfeScreenTexture,
  createLeatherMaps,
  createPanelMaps,
  createWeaveMaps,
  createWindowViewTexture,
  type SurfaceKit,
} from './interiorSurfaceMaps'

/**
 * Round 5: upgrades the cabin's sixteen flat glTF materials in place, by
 * material name, with procedural PBR maps and screen/window content. The
 * GLB has no UV attribute, so each patched material generates its own UVs
 * in the vertex shader from object-space position:
 *
 * - PLANAR: dominant-normal-axis planar projection (a per-vertex triplanar
 *   select — every cabin part is box-like, so each face picks one clean
 *   plane) scaled by `uvScale`. Carpets, fabric, panels, metal, leather.
 * - BOUNDS: the primitive's own bounding box mapped to 0..1 along its
 *   longest horizontal axis (`u`) and its vertical extent (`v`). Seat-back
 *   screens and window panes — one texture per pane, whatever its size.
 * - COCKPIT: the merged flight-deck displays, whose four main screens sit
 *   at known lateral offsets (blender/interior_blockout.py: x = ±1.08,
 *   ±1.77, 0.58 wide, y 1.11–1.45) — the PFD half of the atlas lands on
 *   each of those; every other display face samples the systems half.
 *
 * Object space here is the *loaded* one (before InteriorAsset's +90° X
 * group rotation): x lateral, y along the cabin (nose → tail), z = −height.
 */
export type UvMode = 'planar' | 'bounds' | 'cockpit'

export interface InteriorTextureKit {
  carpetAisle: SurfaceKit
  carpetFloor: SurfaceKit
  fabric: SurfaceKit
  leather: SurfaceKit
  metal: SurfaceKit
  panel: SurfaceKit
  cockpitAtlas: Texture
  ife: Texture
  windowView: Texture
  dispose(): void
}

export function createInteriorTextureKit(): InteriorTextureKit {
  const weave = createWeaveMaps(128, 20)
  const fineWeave = createWeaveMaps(128, 32)
  const carpetAisle: SurfaceKit = { albedo: createCarpetAlbedo(128, [52, 66, 88], [92, 104, 120], 0.14), ...weave }
  const carpetFloor: SurfaceKit = { albedo: createCarpetAlbedo(128, [38, 44, 54], [50, 56, 66], 0.08), ...weave }
  const fabric: SurfaceKit = { albedo: createCarpetAlbedo(128, [28, 62, 92], [64, 110, 138], 0.1), ...fineWeave }
  const leather = createLeatherMaps(128)
  const metal = createBrushedMetalMaps(128)
  const panel = createPanelMaps(128)
  const cockpitAtlas = createCockpitDisplayAtlas()
  const ife = createIfeScreenTexture()
  const windowView = createWindowViewTexture(512, 128)
  const all: Texture[] = [
    carpetAisle.albedo!,
    carpetFloor.albedo!,
    fabric.albedo!,
    weave.normal!,
    weave.roughness!,
    fineWeave.normal!,
    fineWeave.roughness!,
    leather.normal!,
    leather.roughness!,
    metal.normal!,
    metal.roughness!,
    panel.normal!,
    panel.roughness!,
    cockpitAtlas,
    ife,
    windowView,
  ]
  return {
    carpetAisle,
    carpetFloor,
    fabric,
    leather,
    metal,
    panel,
    cockpitAtlas,
    ife,
    windowView,
    dispose: () => all.forEach((t) => t.dispose()),
  }
}

const UV_PARS = /* glsl */ `
uniform float uvScale;
uniform vec3 uvOrigin;
uniform vec3 uvSize;
uniform float uvAlongAxis;
uniform float uvInstanceShift;
`

// Replaces three's uv_vertex chunk (r185: one varying per map, each with
// its own transform) — same assignments, different source coordinate.
const UV_BODY = /* glsl */ `
vec3 mAbsN = abs( normal );
vec2 meridianUv;
#if MERIDIAN_UV_MODE == 1
	float alongCoord = uvAlongAxis < 0.5 ? position.x : position.y;
	float alongOrigin = uvAlongAxis < 0.5 ? uvOrigin.x : uvOrigin.y;
	float alongSize = uvAlongAxis < 0.5 ? uvSize.x : uvSize.y;
	meridianUv = vec2( ( alongCoord - alongOrigin ) / alongSize, ( uvOrigin.z - position.z ) / uvSize.z );
	#ifdef USE_INSTANCING
		meridianUv.x += instanceMatrix[3][1] * uvInstanceShift;
	#endif
#elif MERIDIAN_UV_MODE == 2
	// uvOrigin carries the node chain's translation, so p is the blockout's
	// own cockpit frame (x lateral, y along, z = -height) regardless of which
	// joined node this primitive ended up under.
	vec3 p = position + uvOrigin;
	if ( mAbsN.y >= mAbsN.x && mAbsN.y >= mAbsN.z && -p.z > 1.05 && -p.z < 1.5 && abs( p.x ) > 0.75 ) {
		float f = fract( ( abs( p.x ) - 0.79 ) / 0.69 ) * 1.19;
		float u = p.x < 0.0 ? 1.0 - f : f;
		meridianUv = vec2( clamp( u, 0.0, 1.0 ) * 0.5, clamp( ( -p.z - 1.11 ) / 0.34, 0.0, 1.0 ) );
	} else {
		vec2 planar = ( mAbsN.x >= mAbsN.y && mAbsN.x >= mAbsN.z ) ? p.yz : ( mAbsN.y >= mAbsN.z ? p.xz : p.xy );
		meridianUv = vec2( 0.5 + fract( planar.x * 2.4 ) * 0.5, fract( planar.y * 2.4 ) );
	}
#else
	vec2 planar = ( mAbsN.x >= mAbsN.y && mAbsN.x >= mAbsN.z ) ? position.yz : ( mAbsN.y >= mAbsN.z ? position.xz : position.xy );
	meridianUv = planar * uvScale;
#endif
#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = meridianUv;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( meridianUv, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( meridianUv, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( meridianUv, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( meridianUv, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( meridianUv, 1 ) ).xy;
#endif
`

interface UvUniforms {
  uvScale: { value: number }
  uvOrigin: { value: Vector3 }
  uvSize: { value: Vector3 }
  uvAlongAxis: { value: number }
  uvInstanceShift: { value: number }
}

function installGeneratedUv(material: MeshStandardMaterial, mode: UvMode, uniforms: UvUniforms, cacheKey: string) {
  const modeIndex = mode === 'bounds' ? 1 : mode === 'cockpit' ? 2 : 0
  material.defines = { ...(material.defines ?? {}), MERIDIAN_UV_MODE: modeIndex }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_pars_vertex>', `#include <uv_pars_vertex>\n${UV_PARS}`)
      .replace('#include <uv_vertex>', UV_BODY)
  }
  material.customProgramCacheKey = () => `meridian-interior-${cacheKey}-${modeIndex}`
  material.needsUpdate = true
}

function uvUniforms(scale: number): UvUniforms {
  return {
    uvScale: { value: scale },
    uvOrigin: { value: new Vector3() },
    uvSize: { value: new Vector3(1, 1, 1) },
    uvAlongAxis: { value: 0 },
    uvInstanceShift: { value: 0 },
  }
}

/** Sum of node translations from `mesh` up to (not including) `root` — the blockout frame offset of a joined primitive. */
function nodeOffset(mesh: Mesh, root: Object3D | null): Vector3 {
  const offset = new Vector3()
  let current: Object3D | null = mesh
  while (current && current !== root) {
    offset.add(current.position)
    current = current.parent
  }
  return offset
}

function boundsUniforms(mesh: Mesh, instanceShift = 0): UvUniforms {
  const geometry = mesh.geometry
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const box = geometry.boundingBox ?? new Box3()
  const size = new Vector3().subVectors(box.max, box.min)
  const uniforms = uvUniforms(1)
  uniforms.uvOrigin.value.set(box.min.x, box.min.y, box.max.z)
  uniforms.uvSize.value.set(Math.max(1e-4, size.x), Math.max(1e-4, size.y), Math.max(1e-4, size.z))
  uniforms.uvAlongAxis.value = size.x >= size.y ? 0 : 1
  uniforms.uvInstanceShift.value = instanceShift
  return uniforms
}

function applyKit(material: MeshStandardMaterial, kit: SurfaceKit, normalScale: number) {
  if (kit.albedo) material.map = kit.albedo
  if (kit.normal) {
    material.normalMap = kit.normal
    material.normalScale = new Vector2(normalScale, normalScale)
  }
  if (kit.roughness) {
    material.roughnessMap = kit.roughness
    material.roughness = 1
  }
}

function isInstanced(mesh: Mesh): mesh is InstancedMesh {
  return (mesh as InstancedMesh).isInstancedMesh === true
}

/**
 * Mutates `material` (already a per-mesh clone, InteriorAsset.tsx) for the
 * mesh it is attached to. Returns true when the material was recognised.
 */
export function upgradeInteriorMaterial(mesh: Mesh, material: MeshStandardMaterial, kit: InteriorTextureKit, root: Object3D | null = null): boolean {
  const instanced = isInstanced(mesh)
  switch (material.name) {
    case 'Mat_Aisle': {
      material.color.set('#cfd6e0')
      applyKit(material, kit.carpetAisle, 0.55)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.45), 'aisle')
      return true
    }
    case 'Mat_Floor': {
      material.color.set('#b8bcc4')
      applyKit(material, kit.carpetFloor, 0.45)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.42), 'floor')
      return true
    }
    case 'Mat_Seat': {
      material.color.set('#c8d6e8')
      applyKit(material, kit.fabric, 0.7)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.22), 'seat')
      return true
    }
    case 'Mat_Leather': {
      material.color.set('#5a3a22')
      applyKit(material, kit.leather, 0.6)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.3), 'leather')
      return true
    }
    case 'Mat_SeatShell': {
      material.color.set('#1a2129')
      material.roughness = 0.36
      applyKit(material, { normal: kit.panel.normal }, 0.2)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.5), 'seatshell')
      return true
    }
    case 'Mat_ShellLight': {
      material.color.set('#b9bcbd')
      applyKit(material, kit.panel, 0.35)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 1.2), 'panel')
      return true
    }
    case 'Mat_Ceiling': {
      material.color.set('#cfd0cb')
      applyKit(material, { normal: kit.panel.normal, roughness: kit.panel.roughness }, 0.25)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 1.5), 'ceiling')
      return true
    }
    case 'Mat_Galley': {
      material.color.set('#9aa1a7')
      material.metalness = 0.25
      applyKit(material, { normal: kit.metal.normal, roughness: kit.panel.roughness }, 0.2)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.8), 'galley')
      return true
    }
    case 'Mat_Metal': {
      material.color.set('#c8ccd0')
      material.metalness = 0.88
      applyKit(material, kit.metal, 0.35)
      installGeneratedUv(material, 'planar', uvUniforms(1 / 0.35), 'metal')
      return true
    }
    case 'Mat_Display': {
      material.color.set('#05070a')
      material.roughness = 0.18
      material.metalness = 0.05
      material.emissive = new Color('#ffffff')
      if (instanced) {
        material.emissiveMap = kit.ife
        material.emissiveIntensity = 1.35
        installGeneratedUv(material, 'bounds', boundsUniforms(mesh), 'ife')
      } else {
        material.emissiveMap = kit.cockpitAtlas
        material.emissiveIntensity = 1.5
        const uniforms = uvUniforms(1)
        uniforms.uvOrigin.value.copy(nodeOffset(mesh, root))
        installGeneratedUv(material, 'cockpit', uniforms, 'pfd')
      }
      return true
    }
    case 'Mat_Glass': {
      // Window panes become the view outside: an emissive sky panorama on
      // an opaque, lightly reflective surface. The published material was
      // transmission glass (KHR_materials_transmission) — a per-frame
      // scene-to-texture pass — showing nothing but the dark hull behind
      // it; this is both cheaper and what a cabin window looks like.
      material.color.set('#0c1420')
      material.roughness = 0.14
      material.metalness = 0.12
      material.emissive = new Color('#ffffff')
      material.emissiveMap = kit.windowView
      material.emissiveIntensity = instanced ? 1.45 : 1.25
      material.opacity = 1
      material.alphaTest = 0
      const physical = material as MeshStandardMaterial & { transmission?: number; ior?: number }
      if ('transmission' in physical) physical.transmission = 0
      installGeneratedUv(material, 'bounds', boundsUniforms(mesh, instanced ? 0.028 : 0), 'window')
      return true
    }
    case 'Mat_Emissive': {
      material.emissiveIntensity = 3.6
      return true
    }
    case 'Mat_WindowGlow': {
      material.emissive.set('#8fc4ff')
      material.emissiveIntensity = 1.8
      return true
    }
    case 'Mat_SafetyAccent': {
      material.emissiveIntensity = 1.6
      return true
    }
    default:
      return false
  }
}
