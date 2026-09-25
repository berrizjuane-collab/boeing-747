import { qaTime } from '../lib/qaConfig'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { PerspectiveCamera as PerspectiveCameraImpl, Vector3 } from 'three'
import { sampleCamera } from '../lib/cameraPath'
import { approachEnvelope, walkSwayTarget } from '../lib/cameraEnvelopes'
import { framingShift, horizontalPreservingFov } from '../lib/shotFraming'
import { SECTIONS, localProgress } from '../lib/sections'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

const UP = new Vector3(0, 1, 0)
const PARALLAX_POSITION = new Vector3()
const PARALLAX_TARGET = new Vector3()
const WALK_OSCILLATION = new Vector3()

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

// Time constants for the two envelopes, in seconds. The gait settles slowly
// enough that a wheel notch does not flicker it; the pointer follows fast
// enough to feel connected while removing the raw per-event jitter.
const WALK_ENVELOPE_TAU = 0.32
const POINTER_TAU = 0.12

/**
 * Drives the camera from the scroll-progress curve every frame. Reads
 * `useScrollStore.getState()` (transient, not the hook) so this never
 * triggers a React re-render — see scrollStore.ts.
 *
 * Disabled while the keyframe authoring tool owns the camera (OrbitControls
 * takes over in that mode); see KeyframeAuthoringTool.tsx.
 *
 * Two small motion layers sit on top of the scroll-driven pose, both muted
 * under prefers-reduced-motion (§8.1) so neither can compete with or
 * substitute for the scroll narrative: a hero-only mouse parallax, and the
 * S5 walking sway. Both are enveloped rather than switched — plan6 3.5 — so
 * they follow how fast the visitor is actually advancing instead of a
 * boolean that is equally true while scrolling and while parked.
 */
export function CameraRig({ enabled }: { enabled: boolean }) {
  const { camera, size } = useThree()
  const pointerTarget = useRef({ x: 0, y: 0 })
  const pointer = useRef({ x: 0, y: 0 })
  const walkEnvelope = useRef(0)
  const lastProgress = useRef<number | null>(null)

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.current.x = (event.clientX / window.innerWidth) * 2 - 1
      pointerTarget.current.y = 1 - (event.clientY / window.innerHeight) * 2
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', onPointerMove)
  }, [])

  useFrame(({ clock }, delta) => {
    if (!enabled) return
    const { progress } = useScrollStore.getState()
    const { position, target, fov, rollRad } = sampleCamera(progress)
    const reducedMotion = reducedMotionState.active

    const previous = lastProgress.current
    lastProgress.current = progress
    const progressRate = previous === null || delta <= 0 ? 0 : Math.abs(progress - previous) / delta

    // Pointer is smoothed by frame delta rather than read raw: the browser
    // delivers pointermove in bursts, and feeding those straight into a
    // camera offset put a visible step in the hero every time one landed.
    if (qaTime === null && !reducedMotion) {
      pointer.current.x = approachEnvelope(pointer.current.x, pointerTarget.current.x, delta, POINTER_TAU)
      pointer.current.y = approachEnvelope(pointer.current.y, pointerTarget.current.y, delta, POINTER_TAU)
    } else {
      pointer.current.x = 0
      pointer.current.y = 0
    }

    // Hero-only parallax: it fades to zero at the S1/S2 boundary, so entering
    // the tracking shot cannot cause a positional discontinuity.
    const heroProgress = localProgress(progress, SECTIONS[0])
    const parallaxStrength = progress < SECTIONS[0].end ? 1 - heroProgress : 0
    if (parallaxStrength > 0) {
      PARALLAX_POSITION.set(pointer.current.x * 1.25 * parallaxStrength, pointer.current.y * 0.55 * parallaxStrength, 0)
      PARALLAX_TARGET.set(pointer.current.x * 0.3 * parallaxStrength, pointer.current.y * 0.18 * parallaxStrength, 0)
    } else {
      PARALLAX_POSITION.set(0, 0, 0)
      PARALLAX_TARGET.set(0, 0, 0)
    }

    const walkTarget = walkSwayTarget(progress, progressRate, reducedMotion)
    walkEnvelope.current = approachEnvelope(walkEnvelope.current, walkTarget, delta, WALK_ENVELOPE_TAU)

    if (walkEnvelope.current > 1e-3) {
      const t = clock.elapsedTime
      WALK_OSCILLATION.set(
        Math.sin(t * WALK_LATERAL_HZ) * WALK_LATERAL_AMPLITUDE * walkEnvelope.current,
        Math.sin(t * WALK_VERTICAL_HZ) * WALK_VERTICAL_AMPLITUDE * walkEnvelope.current,
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
      // plan6 3.7: the shot sheet's framing is authored against a landscape
      // frame. Vertical FOV alone would crop the subject horizontally as the
      // viewport narrows, so narrower-than-reference aspects open the lens to
      // hold the authored horizontal field instead of stretching or cutting.
      camera.fov = horizontalPreservingFov(fov, size.width / size.height)
      // Lens shift that composes the subject into the side the copy leaves
      // free (shotFraming.ts framingShift). setViewOffset moves the window,
      // so a picture shift of +s NDC is an offset of -s * width / 2.
      const shift = framingShift(progress, size.width / size.height)
      if (Math.abs(shift) > 1e-4) camera.setViewOffset(size.width, size.height, (-shift * size.width) / 2, 0, size.width, size.height)
      else if (camera.view?.enabled) camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld(true)
  }, -80)

  return null
}
