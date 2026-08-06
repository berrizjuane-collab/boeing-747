import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Group, Mesh, Vector3 } from 'three'
import { INTERIOR_OFFSET } from '../lib/sceneLayout'

useGLTF.setDecoderPath('/draco/')

const INTERIOR_LOD_DISTANCE = 42

interface LodNode {
  mesh: Mesh
  center: Vector3
}

/**
 * Real procedural interior blockout (Fase 0, `blender/interior_blockout.py`,
 * reproduced this session — see PROGRESS.md Fase 3 notes) compressed through
 * the Fase 3 asset pipeline (`scripts/process-glb.mjs`): 733KB -> 55KB via
 * prune/dedup/weld/Draco. No KTX2 stage — the blockout is solid-color
 * materials, no textures to compress.
 *
 * Axis note: the Blender script authors geometry with Y as vertical and Z as
 * the cockpit->tail length axis (i.e. already "Three.js-shaped" internally),
 * but Blender's own glTF export always converts FROM Blender's native Z-up
 * convention, which swaps those two axes on the way out. Rotating +90° about
 * X on load undoes exactly that swap, so this group's local space matches the
 * interior_blockout.py source coordinates directly — see the anchor math in
 * cameraPath.ts, which relies on that.
 */
export function InteriorAsset() {
  const { scene } = useGLTF('/models/interior.glb')
  const { camera } = useThree()
  const groupRef = useRef<Group>(null)
  const lodNodesRef = useRef<LodNode[]>([])

  useEffect(() => {
    scene.updateWorldMatrix(true, true)
    groupRef.current?.updateWorldMatrix(true, true)

    const lodNodes: LodNode[] = []
    scene.traverse((obj) => {
      if (!('isMesh' in obj) || !obj.isMesh) return
      const mesh = obj as Mesh
      mesh.castShadow = true
      mesh.receiveShadow = true

      const center = new Box3().setFromObject(mesh).getCenter(new Vector3())
      lodNodes.push({ mesh, center })
    })
    lodNodesRef.current = lodNodes

    return () => {
      for (const { mesh } of lodNodes) {
        mesh.visible = true
        mesh.castShadow = true
      }
      lodNodesRef.current = []
    }
  }, [scene])

  useFrame(() => {
    for (const { mesh, center } of lodNodesRef.current) {
      const distance = camera.position.distanceTo(center)
      const inCorridorRange = distance <= INTERIOR_LOD_DISTANCE
      mesh.visible = inCorridorRange
      mesh.castShadow = inCorridorRange
    }
  })

  return (
    <group ref={groupRef} rotation={[Math.PI / 2, 0, 0]} position={INTERIOR_OFFSET}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/interior.glb')
