import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { sampleCamera } from '../lib/cameraPath'
import { SECTIONS, localProgress } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

const UP = new Vector3(0, 1, 0)
const PARALLAX_POSITION = new Vector3()
const PARALLAX_TARGET = new Vector3()

/**
 * Drives the camera from the scroll-progress curve every frame. Reads
 * `useScrollStore.getState()` (transient, not the hook) so this never
 * triggers a React re-render — see scrollStore.ts.
 *
 * Disabled while the keyframe authoring tool owns the camera (OrbitControls
 * takes over in that mode); see KeyframeAuthoringTool.tsx.
 *
 * The hero adds a deliberately small mouse parallax. It is applied after the
 * scroll sample, fades out before S1 ends, and is disabled for
 * prefers-reduced-motion so it cannot compete with the scroll narrative.
 */
export function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()
  const pointer = useRef({ x: 0, y: 0 })
  const reducedMotion = useRef(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => {
      reducedMotion.current = media.matches
    }
    const onPointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = 1 - (event.clientY / window.innerHeight) * 2
    }

    updateMotionPreference()
    media.addEventListener('change', updateMotionPreference)
    window.addEventListener('pointermove', onPointerMove, { passive: true })

    return () => {
      media.removeEventListener('change', updateMotionPreference)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [])

  useFrame(() => {
    if (!enabled) return
    const { progress } = useScrollStore.getState()
    const { position, target, fov, rollRad } = sampleCamera(progress)

    // Hero-only parallax: it fades to zero at the S1/S2 boundary, so entering
    // the tracking shot cannot cause a positional discontinuity.
    const heroProgress = localProgress(progress, SECTIONS[0])
    const parallaxStrength = progress < SECTIONS[0].end ? 1 - heroProgress : 0
    if (!reducedMotion.current && parallaxStrength > 0) {
      PARALLAX_POSITION.set(
        pointer.current.x * 1.25 * parallaxStrength,
        pointer.current.y * 0.55 * parallaxStrength,
        0,
      )
      PARALLAX_TARGET.set(
        pointer.current.x * 0.3 * parallaxStrength,
        pointer.current.y * 0.18 * parallaxStrength,
        0,
      )
    } else {
      PARALLAX_POSITION.set(0, 0, 0)
      PARALLAX_TARGET.set(0, 0, 0)
    }

    camera.position.copy(position).add(PARALLAX_POSITION)
    camera.up.copy(UP)
    camera.lookAt(target.add(PARALLAX_TARGET))
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
