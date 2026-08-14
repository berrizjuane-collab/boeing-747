import { Matrix4, Mesh, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const MERGED_LANDING_GEAR_NAME = 'LandingGear_Merged'

export interface LandingGearMergeResult {
  mesh: Mesh
  sourceMeshCount: number
  sourceTriangleCount: number
}

export interface LandingGearMergeOptions {
  /** Keep the source meshes hidden so visual QA can compare both render paths. */
  preserveSourceMeshes?: boolean
}

const preservedSourceMeshes = new WeakMap<Object3D, Mesh[]>()

function matrixRelativeToAncestor(object: Object3D, ancestor: Object3D, target: Matrix4) {
  const matrices: Matrix4[] = []
  let current: Object3D | null = object
  while (current && current !== ancestor) {
    current.updateMatrix()
    matrices.unshift(current.matrix)
    current = current.parent
  }
  if (current !== ancestor) throw new Error(`${object.name || '(unnamed mesh)'} is not below ${ancestor.name || '(root)'}`)
  target.identity()
  for (const matrix of matrices) target.multiply(matrix)
  return target
}

/** Switches the preserved QA hierarchy without changing production behavior. */
export function setLandingGearMergeMode(gear: Object3D, mode: 'merged' | 'source') {
  const merged = gear.getObjectByName(MERGED_LANDING_GEAR_NAME) as Mesh | undefined
  const sources = preservedSourceMeshes.get(gear)
  if (!merged || !sources) throw new Error('LandingGear source meshes were not preserved for comparison')
  merged.visible = mode === 'merged'
  for (const source of sources) source.visible = mode === 'source'
}

/**
 * Collapses every opaque landing-gear mesh into the coordinate system of the
 * `LandingGear` group. The result is pixel-equivalent to the source hierarchy:
 * vertex positions, normals, UVs and the shared material are preserved, while
 * the renderer submits one draw call instead of one per part.
 *
 * This deliberately runs after GLTF loading rather than in process-glb.mjs.
 * Joining the binary there would also join the named A380 hull because all 116
 * primitives share one material, which would break both the hull dissolve and
 * the independently animated gear retraction.
 */
export function mergeLandingGearMeshes(gear: Object3D, options: LandingGearMergeOptions = {}): LandingGearMergeResult {
  const existing = gear.getObjectByName(MERGED_LANDING_GEAR_NAME)
  if (existing && (existing as Mesh).isMesh) {
    const mesh = existing as Mesh
    return {
      mesh,
      sourceMeshCount: Number(mesh.userData.sourceMeshCount ?? 1),
      sourceTriangleCount: Number(mesh.userData.sourceTriangleCount ?? 0),
    }
  }

  const sourceMeshes: Mesh[] = []
  gear.traverse((object) => {
    if (object !== gear && (object as Mesh).isMesh) sourceMeshes.push(object as Mesh)
  })
  if (sourceMeshes.length === 0) throw new Error('LandingGear contains no mergeable meshes')

  const material = sourceMeshes[0].material
  if (Array.isArray(material)) throw new Error('LandingGear uses a material array and cannot be merged losslessly')
  for (const mesh of sourceMeshes) {
    if (Array.isArray(mesh.material) || mesh.material !== material) {
      throw new Error(`LandingGear material mismatch at ${mesh.name || '(unnamed mesh)'}`)
    }
  }

  const transform = new Matrix4()
  let sourceTriangleCount = 0
  const transformed = sourceMeshes.map((mesh) => {
    const geometry = mesh.geometry.clone()
    // Compose only the local matrices below LandingGear. Using
    // inverse(gear.matrixWorld) * mesh.matrixWorld is algebraically equal,
    // but its extra world-space round trips moved three edge pixels in the
    // Mobile Low reference. The local chain is also exactly what the source
    // hierarchy contributes before LandingGear's own animated transform.
    matrixRelativeToAncestor(mesh, gear, transform)
    geometry.applyMatrix4(transform)
    const index = geometry.getIndex()
    sourceTriangleCount += index ? index.count / 3 : geometry.getAttribute('position').count / 3
    return geometry
  })

  const mergedGeometry = mergeGeometries(transformed, false)
  for (const geometry of transformed) geometry.dispose()
  if (!mergedGeometry) throw new Error('LandingGear geometries could not be merged')
  mergedGeometry.name = 'MERIDIAN_A380_landing_gear_merged'
  mergedGeometry.computeBoundingBox()
  mergedGeometry.computeBoundingSphere()

  const mergedMesh = new Mesh(mergedGeometry, material as Material)
  mergedMesh.name = MERGED_LANDING_GEAR_NAME
  mergedMesh.castShadow = sourceMeshes.some((mesh) => mesh.castShadow)
  mergedMesh.receiveShadow = sourceMeshes.some((mesh) => mesh.receiveShadow)
  mergedMesh.userData.sourceMeshCount = sourceMeshes.length
  mergedMesh.userData.sourceTriangleCount = sourceTriangleCount

  if (options.preserveSourceMeshes) {
    preservedSourceMeshes.set(gear, sourceMeshes)
    for (const mesh of sourceMeshes) mesh.visible = false
  } else {
    for (const mesh of sourceMeshes) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
    }
  }
  gear.add(mergedMesh)

  return { mesh: mergedMesh, sourceMeshCount: sourceMeshes.length, sourceTriangleCount }
}
