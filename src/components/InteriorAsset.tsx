import { CabinAtmosphere } from './CabinAtmosphere'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Group, type InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { createInteriorTextureKit, upgradeInteriorMaterial } from '../lib/interiorMaterials'
import { FLYING_POSE, INTERIOR_LOCAL_OFFSET, interiorToWorld, INTERIOR_MANIFEST } from '../lib/sceneLayout'
import { qaView, qaWireframe, qaZoneColors } from '../lib/qaConfig'
import { useAssetState } from '../state/assetState'
import { useScrollStore } from '../state/scrollStore'

useGLTF.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
// Cache ownership matches useGLTF's URL cache. No per-mount disposal of a
// shared kit. StrictMode and repeated visits reuse the same LIVE resources.
const prepared = new WeakMap<Group, { scene: Group; seats: Vector3[] }>()
function prepare(source: Group) {
  const cached = prepared.get(source)
  if (cached) return cached
  const scene = source.clone(true)
  const kit = createInteriorTextureKit()
  scene.traverse((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    mesh.geometry = mesh.geometry.clone() // UV preparation must not mutate loader cache.
    const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const material = sourceMaterial.clone() as MeshStandardMaterial
    mesh.material = material
    if (material.isMeshStandardMaterial) upgradeInteriorMaterial(mesh, material, kit, scene)
    material.transparent = false
    material.opacity = 1
    material.depthWrite = true
    material.wireframe = qaWireframe
    if (qaZoneColors) {
      const colors: Record<string,string> = { Cockpit:'#ff8566', Economy:'#56b8da', Stair:'#ffc857', UpperDeck:'#b594ed' }
      let zone = mesh.userData.zone
      mesh.traverseAncestors(parent => { zone ??= parent.userData.zone })
      material.color.set(colors[zone] ?? '#999999')
      material.emissive.set('#000000')
      material.map = null
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
  })
  const resource = { scene, seats: [] as Vector3[] }
  prepared.set(source, resource)
  return resource
}

export function InteriorAsset() {
  const { scene: source } = useGLTF(`${import.meta.env.BASE_URL}models/interior.glb`)
  const resource = useMemo(() => prepare(source), [source])
  const seats = useMemo(() => {
    const result: Vector3[] = []
    for (const [deck, start, floor] of [[INTERIOR_MANIFEST.main, 8.9, 0], [INTERIOR_MANIFEST.upper, 32.9, 2.45]] as const) {
      for (let row=0; row<deck.rows; row++) for (const x of deck.centers) result.push(new Vector3(...interiorToWorld([x, floor, start+row*deck.pitch])))
    }
    return result
  }, [])
  const group = useRef<Group>(null)
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let live = true
    const status = useAssetState.getState()
    status.set('interior', 'decoded')
    group.current?.updateWorldMatrix(true, true)
    resource.seats.length = 0
    resource.scene.traverse((object) => {
      const mesh = object as InstancedMesh
      if (!mesh.isInstancedMesh || (mesh.material as MeshStandardMaterial).name !== 'Mat_Seat') return
      const matrix = new Matrix4()
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix)
        resource.seats.push(new Vector3().setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld))
      }
    })
    status.set('interior', 'prepared')
    // Upload textures and compile the prepared materials before releasing
    // the threshold. Scene is still invisible to the user behind S0/S4.
    const textures = new Set<unknown>()
    resource.scene.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined
      if (!material) return
      for (const value of Object.values(material)) {
        if (value?.isTexture && !textures.has(value)) { textures.add(value); gl.initTexture(value) }
      }
    })
    gl.compileAsync(resource.scene, camera, scene).then(() => {
      if (live) status.set('interior', 'ready')
    }).catch((error: Error) => { if (live) status.set('interior', 'error', error.message) })
    return () => { live = false }
  }, [resource, gl, camera, scene])
  useFrame(() => {
    if (!group.current) return
    const p = useScrollStore.getState().progress
    group.current.visible = qaView !== 'hull' && (qaView === 'interior' || qaView === 'both' || (p >= 0.4 && p <= 0.9))
  }, -60)
  return (
    <>
    <group ref={group} name="Interior · registered" position={FLYING_POSE.position} rotation={[FLYING_POSE.pitchDeg * Math.PI / 180, 0, 0]} dispose={null}>
      <group position={INTERIOR_LOCAL_OFFSET} rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={resource.scene} />
      </group>

    </group>
    {qaView !== 'hull' && <CabinAtmosphere seatWorldPositions={seats} />}
    </>
  )
}
