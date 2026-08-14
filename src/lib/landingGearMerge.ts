import { Matrix4, Mesh, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const MERGED_LANDING_GEAR_NAME = 'LandingGear_Merged'

export interface LandingGearMergeResult {
  mesh: Mesh
  sourceMeshCount: number
  sourceTriangleCount: number
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
export function mergeLandingGearMeshes(gear: Object3D): LandingGearMergeResult {
  const existing = gear.getObjectByName(MERGED_LANDING_GEAR_NAME)
  if (existing && (existing as Mesh).isMesh) {
    const mesh = existing as Mesh
    return {
      mesh,
      sourceMeshCount: Number(mesh.userData.sourceMeshCount ?? 1),
      sourceTriangleCount: Number(mesh.userData.sourceTriangleCount ?? 0),
    }
  }

  gear.updateWorldMatrix(true, true)
  const gearWorldInverse = gear.matrixWorld.clone().invert()
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
    mesh.updateWorldMatrix(true, false)
    const geometry = mesh.geometry.clone()
    transform.multiplyMatrices(gearWorldInverse, mesh.matrixWorld)
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

  for (const mesh of sourceMeshes) {
    mesh.removeFromParent()
    mesh.geometry.dispose()
  }
  gear.add(mergedMesh)

  return { mesh: mergedMesh, sourceMeshCount: sourceMeshes.length, sourceTriangleCount }
}
