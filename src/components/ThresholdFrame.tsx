import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group, MeshStandardMaterial } from 'three'
import { EXIT_PORTAL, NOSE_PORTAL, type PortalWindow, frameVisibility, portalRadius } from '../lib/thresholdPortals'
import { useScrollStore } from '../state/scrollStore'

const RING_RADIUS = 15.2 // just outside maxRadius (14) + the shader's edge glow band
const TRIM_RADIUS = 14.5
const SILL_WIDTH = 8
const SILL_Y = -14.4

/**
 * PLAN.md Fase 4's remaining scope: "geometría de detalle (puertas, marco
 * del umbral)" — a physical frame around each dissolve portal (thresholdPortals.ts)
 * so the crossing reads as passing through a built doorway, not just a
 * shrinking hole in a featureless hull. Deliberately not part of the "A380"
 * hull mesh dissolveHullMaterial targets: a separate, solid, never-dissolving
 * mesh, positioned directly at the portals' fixed world-space centers.
 *
 * Circular, not a literal rectangular airline door: dissolveHullMaterial's
 * mask is a 3D Euclidean-distance sphere around a point (see its
 * `portalMask`), so the actual hole it cuts through the curved fuselage is
 * already a round opening — a rounded-rectangle frame would visibly float
 * clear of the hole it's supposed to surround. Safe to place at these fixed
 * centers with no pose transform of its own: both portal windows fall
 * entirely within progress >= S2's end, where getAircraftPose holds the
 * aircraft dead still at FLYING_POSE (see aircraftPose.ts) — the same
 * assumption thresholdPortals.ts's own world-space centers already rely on.
 */
function DoorFrame({ window }: { window: PortalWindow }) {
  const groupRef = useRef<Group>(null)
  const ringMatRef = useRef<MeshStandardMaterial>(null)
  const trimMatRef = useRef<MeshStandardMaterial>(null)
  const sillMatRef = useRef<MeshStandardMaterial>(null)

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    const visibility = frameVisibility(progress, window)
    if (groupRef.current) groupRef.current.visible = visibility > 0.01

    // Trim glow intensifies as the hole actually opens, echoing
    // dissolveHullMaterial's own edge glow instead of just sitting static.
    const openness = portalRadius(progress, window) / window.maxRadius
    if (ringMatRef.current) ringMatRef.current.opacity = visibility
    if (trimMatRef.current) {
      trimMatRef.current.opacity = visibility
      trimMatRef.current.emissiveIntensity = 0.4 + openness * 2.2
    }
    if (sillMatRef.current) sillMatRef.current.opacity = visibility
  })

  return (
    <group ref={groupRef} position={window.center}>
      <mesh>
        <torusGeometry args={[RING_RADIUS, 0.55, 16, 48]} />
        <meshStandardMaterial ref={ringMatRef} color="#2a2c30" metalness={0.75} roughness={0.4} transparent />
      </mesh>
      <mesh position={[0, 0, 0.2]}>
        <torusGeometry args={[TRIM_RADIUS, 0.16, 12, 48]} />
        <meshStandardMaterial
          ref={trimMatRef}
          color="#8fd8ff"
          emissive="#8fd8ff"
          emissiveIntensity={0.4}
          transparent
        />
      </mesh>
      {/* The literal "umbral": a lit sill bar across the bottom of the frame. */}
      <mesh position={[0, SILL_Y, 0.35]}>
        <boxGeometry args={[SILL_WIDTH, 0.7, 1.3]} />
        <meshStandardMaterial
          ref={sillMatRef}
          color="#d9a566"
          emissive="#c98a4a"
          emissiveIntensity={0.5}
          metalness={0.15}
          roughness={0.55}
          transparent
        />
      </mesh>
    </group>
  )
}

export function ThresholdFrame() {
  return (
    <>
      <DoorFrame window={NOSE_PORTAL} />
      <DoorFrame window={EXIT_PORTAL} />
    </>
  )
}
