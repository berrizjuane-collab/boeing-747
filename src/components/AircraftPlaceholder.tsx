import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, Group, Mesh } from 'three'
import { getAircraftPose } from '../lib/aircraftPose'
import { createDissolveHullMaterial } from '../lib/dissolveHullMaterial'
import { FUSELAGE } from '../lib/sceneLayout'
import { SECTIONS } from '../lib/sections'
import { EXIT_PORTAL, NOSE_PORTAL, portalRadius } from '../lib/thresholdPortals'
import { useScrollStore } from '../state/scrollStore'

const TAXI_SECTION = SECTIONS[1]

/**
 * Box-and-wings stand-in for the A380. The fuselage uses the Fase 4 dissolve
 * shader (see dissolveHullMaterial.ts) so the camera can fly through two
 * fixed "portals" — the S4 nose entry and the S6 exit — instead of the whole
 * hull being permanently see-through. Wings/tail stay opaque plain
 * DoubleSide boxes; they aren't part of the threshold narrative.
 *
 * The portal centers are fixed world-space points. That only stays correct
 * because the aircraft itself is frozen from S3 onward (see
 * aircraftPose.ts) — the portals only ever open at progress >= 0.40, well
 * inside that frozen window, so there's no case where a moving fuselage
 * would carry the hole away from where the camera expects it.
 */
export function AircraftPlaceholder() {
  const groupRef = useRef<Group>(null)
  const fuselageRef = useRef<Mesh>(null)
  const dissolveMaterial = useMemo(() => createDissolveHullMaterial(), [])

  useFrame(({ clock }) => {
    const group = groupRef.current
    if (!group) return
    const { progress } = useScrollStore.getState()
    const { position, pitchRad } = getAircraftPose(progress)

    // Cosmetic taxi vibration: time-driven (not scroll-indexed), fades out
    // as progress nears the end of S2 to read as "gear unloading".
    let jitter = 0
    if (progress >= TAXI_SECTION.start && progress < TAXI_SECTION.end) {
      const fadeOut = 1 - (progress - TAXI_SECTION.start) / (TAXI_SECTION.end - TAXI_SECTION.start)
      jitter = Math.sin(clock.elapsedTime * 40) * 0.08 * fadeOut
    }

    group.position.set(position.x, position.y + jitter, position.z)
    group.rotation.x = pitchRad

    dissolveMaterial.uniforms.portal1Radius.value = portalRadius(progress, NOSE_PORTAL)
    dissolveMaterial.uniforms.portal2Radius.value = portalRadius(progress, EXIT_PORTAL)
  })

  return (
    <group ref={groupRef}>
      <mesh ref={fuselageRef} material={dissolveMaterial}>
        <boxGeometry args={[FUSELAGE.width, FUSELAGE.height, FUSELAGE.length]} />
      </mesh>
      <mesh position={[0, 0, -5]}>
        <boxGeometry args={[80, 1, 9]} />
        <meshStandardMaterial color="#c7cbd1" side={DoubleSide} roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, FUSELAGE.height * 0.7, 32]}>
        <boxGeometry args={[24, 1, 6]} />
        <meshStandardMaterial color="#c7cbd1" side={DoubleSide} roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  )
}
