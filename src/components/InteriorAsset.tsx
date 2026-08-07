import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Group, Material, Mesh, Vector3 } from 'three'
import { INTERIOR_OFFSET } from '../lib/sceneLayout'

useGLTF.setDecoderPath('/draco/')

// Opaque below FADE_START, smoothstep opacity fade FADE_START -> FADE_END,
// invisible (and shadow-casting off) beyond FADE_END — PLAN.md §6.1 asks for
// "fade-out de las filas lejanas", not a pop; FADE_END keeps the previously
// measured/tuned 42-unit draw-call and shadow-cost boundary, this just adds
// the ramp instead of an instant cut.
const INTERIOR_LOD_FADE_START = 30
const INTERIOR_LOD_FADE_END = 42

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

interface LodNode {
  mesh: Mesh
  // Computed after the loaded scene is attached to the transformed group.
  // Box3 therefore stores a world-space center for the camera distance test.
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

      // Several nodes reuse the same glTF mesh/material (mirrored pairs like
      // the two cockpit consoles, the four cockpit windows, the two economy
      // overhead bins — confirmed by inspecting interior.glb directly, not
      // assumed). Fading opacity per-node needs a material each node owns
      // outright, or writing one node's computed opacity would stomp its
      // mirror's in the same frame. Cloned once and marked via userData,
      // not on every mount: useGLTF caches the loaded scene by URL, so the
      // same Mesh objects come back on every InteriorGate remount, and
      // re-cloning each time would leak the previous mount's clone.
      if (!mesh.userData.lodMaterialCloned && !Array.isArray(mesh.material)) {
        mesh.material = (mesh.material as Material).clone()
        mesh.userData.lodMaterialCloned = true
      }
      const material = mesh.material as Material
      material.transparent = true

      const center = new Box3().setFromObject(mesh).getCenter(new Vector3())
      lodNodes.push({ mesh, center })
    })
    lodNodesRef.current = lodNodes

    return () => {
      for (const { mesh } of lodNodes) {
        mesh.visible = true
        mesh.castShadow = true
        if (!Array.isArray(mesh.material)) (mesh.material as Material).opacity = 1
      }
      lodNodesRef.current = []
    }
  }, [scene])

  useFrame(() => {
    for (const { mesh, center } of lodNodesRef.current) {
      const distance = camera.position.distanceTo(center)
      const opacity = 1 - smoothstep(INTERIOR_LOD_FADE_START, INTERIOR_LOD_FADE_END, distance)
      if (!Array.isArray(mesh.material)) (mesh.material as Material).opacity = opacity
      mesh.visible = opacity > 0.01
      // Stop casting shadows a bit before the mesh is fully invisible, not
      // at the same instant: a half-transparent mesh still casting a
      // full-strength shadow reads as a dark shape floating past its own
      // faded-out geometry.
      mesh.castShadow = opacity > 0.5
    }
  })

  return (
    <group ref={groupRef} rotation={[Math.PI / 2, 0, 0]} position={INTERIOR_OFFSET}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/interior.glb')
