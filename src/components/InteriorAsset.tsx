import { useGLTF } from '@react-three/drei'
import { useEffect } from 'react'
import { INTERIOR_OFFSET } from '../lib/sceneLayout'

useGLTF.setDecoderPath('/draco/')

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
 * X on load undoes exactly that swap, so this group's local space matches
 * the interior_blockout.py source coordinates directly — see the anchor
 * math in cameraPath.ts, which relies on that.
 */
export function InteriorAsset() {
  const { scene } = useGLTF('/models/interior.glb')

  useEffect(() => {
    scene.traverse((obj) => {
      if ('isMesh' in obj && obj.isMesh) {
        obj.castShadow = false
        obj.receiveShadow = true
      }
    })
  }, [scene])

  return (
    <group rotation={[Math.PI / 2, 0, 0]} position={INTERIOR_OFFSET}>
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/interior.glb')
