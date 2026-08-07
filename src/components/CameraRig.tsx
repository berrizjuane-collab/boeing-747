import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { sampleCamera } from '../lib/cameraPath'
import { SECTIONS, localProgress } from '../lib/sections'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

const UP = new Vector3(0, 1, 0)
const PARALLAX_POSITION = new Vector3()
const PARALLAX_TARGET = new Vector3()
const WALK_OSCILLATION = new Vector3()

const S5 = SECTIONS[4]
// PLAN.md §3 S5: "avance por el pasillo... con micro-oscilación lateral y
// vertical muy sutil para dar sensación de caminata" — a footstep-cadence
// sway, not a camera shake. Two incommensurate frequencies (2.2, 3.7 Hz) so
// lateral and vertical don't fall into a repeating Lissajous loop within a
// few seconds, small amplitudes (world units, at this scene's real-world
// scale) so it reads as a walking gait rather than turbulence.
const WALK_LATERAL_HZ = 2.2
const WALK_LATERAL_AMPLITUDE = 0.045
const WALK_VERTICAL_HZ = 3.7
const WALK_VERTICAL_AMPLITUDE = 0.025

/**
 * Drives the camera from the scroll-progress curve every frame. Reads
 * `useScrollStore.getState()` (transient, not the hook) so this never
 * triggers a React re-render — see scrollStore.ts.
 *
 * Disabled while the keyframe authoring tool owns the camera (OrbitControls
 * takes over in that mode); see KeyframeAuthoringTool.tsx.
 *
 * Two small motion layers on top of the scroll-driven pose, both muted
 * under prefers-reduced-motion (§8.1) so neither can compete with or
 * substitute for the scroll narrative: a hero-only mouse parallax (fades to
 * zero at the S1/S2 boundary, so entering the tracking shot can't cause a
 * positional discontinuity), and a S5-only walking sway (§3 S5, see
 * WALK_LATERAL_HZ above).
 */
export function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera } = useThree()
  const pointer = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = 1 - (event.clientY / window.innerHeight) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useFrame(({ clock }) => {
    if (!enabled) return
    const { progress } = useScrollStore.getState()
    const { position, target, fov, rollRad } = sampleCamera(progress)
    const reducedMotion = reducedMotionState.active

    // Hero-only parallax: it fades to zero at the S1/S2 boundary, so entering
    // the tracking shot cannot cause a positional discontinuity.
    const heroProgress = localProgress(progress, SECTIONS[0])
    const parallaxStrength = progress < SECTIONS[0].end ? 1 - heroProgress : 0
    if (!reducedMotion && parallaxStrength > 0) {
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

    if (!reducedMotion && progress >= S5.start && progress < S5.end) {
      const t = clock.elapsedTime
      WALK_OSCILLATION.set(
        Math.sin(t * WALK_LATERAL_HZ) * WALK_LATERAL_AMPLITUDE,
        Math.sin(t * WALK_VERTICAL_HZ) * WALK_VERTICAL_AMPLITUDE,
        0,
      )
    } else {
      WALK_OSCILLATION.set(0, 0, 0)
    }

    camera.position.copy(position).add(PARALLAX_POSITION).add(WALK_OSCILLATION)
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
