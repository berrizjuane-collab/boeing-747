import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { sampleCamera } from '../lib/cameraPath'
import { useScrollStore } from '../state/scrollStore'

const UP = new Vector3(0, 1, 0)

/**
 * Drives the camera from the scroll-progress curve every frame. Reads
 * `useScrollStore.getState()` (transient, not the hook) so this never
 * triggers a React re-render — see scrollStore.ts.
 *
 * Disabled while the keyframe authoring tool owns the camera (OrbitControls
 * takes over in that mode); see KeyframeAuthoringTool.tsx.
 */
export function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()

  useFrame(() => {
    if (!enabled) return
    const { progress } = useScrollStore.getState()
    const { position, target, fov, rollRad } = sampleCamera(progress)

    camera.position.copy(position)
    camera.up.copy(UP)
    camera.lookAt(target)
    // Roll override applied after lookAt, rotating around the camera's own
    // forward (local Z) axis — see PLAN.md §4.
    camera.rotateZ(rollRad)

    if (camera instanceof PerspectiveCameraImpl) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  })

  return null
}
