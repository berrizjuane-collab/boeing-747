import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { authoringState } from './authoringState'

/**
 * Dev-only: free-fly camera for hand-placing keyframes. Mounted inside the
 * Canvas only while debug mode is on (see App.tsx) — takes over from
 * CameraRig entirely rather than fighting it for control of the camera.
 */
export function KeyframeAuthoringTool() {
  const controlsRef = useRef<OrbitControlsImpl | null>(null)

  useFrame(({ camera }) => {
    authoringState.position.copy(camera.position)
    if (controlsRef.current) {
      authoringState.target.copy(controlsRef.current.target)
    }
    authoringState.fov = (camera as PerspectiveCamera).fov ?? authoringState.fov
  })

  return <OrbitControls ref={controlsRef} makeDefault />
}
