import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { DoubleSide, Group } from 'three'
import { getAircraftPose } from '../lib/aircraftPose'
import { FUSELAGE } from '../lib/sceneLayout'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

const TAXI_SECTION = SECTIONS[1]

/**
 * Box-and-wings stand-in for the A380. `DoubleSide` so the camera can fly
 * straight through the hull for the S4 threshold crossing and the S5
 * walkthrough without a separate interior mesh — good enough to validate
 * the camera arc, not a stand-in for the Fase 4 dissolve VFX.
 */
export function AircraftPlaceholder() {
  const groupRef = useRef<Group>(null)

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
  })

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry args={[FUSELAGE.width, FUSELAGE.height, FUSELAGE.length]} />
        <meshStandardMaterial color="#d8dbe0" side={DoubleSide} roughness={0.6} metalness={0.1} />
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
