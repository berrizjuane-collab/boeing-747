import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import { EXIT_PORTAL, NOSE_PORTAL, type PortalWindow, frameVisibility } from '../lib/thresholdPortals'
import { useScrollStore } from '../state/scrollStore'

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
  const { camera } = useThree()
  const groupRef = useRef<Group>(null)
  const ringMatRef = useRef<MeshBasicMaterial>(null)
  const trimMatRef = useRef<MeshBasicMaterial>(null)
  const sillMatRef = useRef<MeshBasicMaterial>(null)
  const doorPanelRef = useRef<Mesh>(null)
  const cameraForward = useRef(new Vector3())
  const framePosition = useMemo(
    () => window.center.clone().addScaledVector(window.traversalNormal, -0.12),
    [window],
  )
  const frameQuaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), window.traversalNormal),
    [window],
  )
  const ringRadius = window.maxRadius + 0.65
  const trimRadius = window.maxRadius + 0.25
  const sillWidth = window.maxRadius * 0.86
  const sillY = -window.maxRadius + 0.45
  const isExit = window === EXIT_PORTAL

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    camera.getWorldDirection(cameraForward.current)
    const visibility = frameVisibility(progress, window, camera.position, cameraForward.current)
    if (groupRef.current) groupRef.current.visible = visibility > 0.01

    // Trim glow intensifies as the hole actually opens, echoing
    // dissolveHullMaterial's own edge glow instead of just sitting static.
    if (ringMatRef.current) ringMatRef.current.opacity = visibility
    if (trimMatRef.current) trimMatRef.current.opacity = visibility
    if (sillMatRef.current) sillMatRef.current.opacity = visibility

    if (doorPanelRef.current && isExit) {
      const rawOpen = Math.min(1, Math.max(0, (progress - 0.805) / 0.023))
      const open = rawOpen * rawOpen * (3 - 2 * rawOpen)
      doorPanelRef.current.position.y = open * 2.8
      doorPanelRef.current.visible = open < 0.995
    }
  })

  return (
    <group
      ref={groupRef}
      name="Threshold · Camera-gated frame"
      position={framePosition}
      quaternion={frameQuaternion}
    >
      {isExit ? (
        <>
          {[-1.08, 1.08].map((x) => (
            <mesh key={x} name="Threshold frame · Door jamb" position={[x, 0, 0.08]}>
              <boxGeometry args={[0.18, 2.05, 0.24]} />
              <meshBasicMaterial color="#17232c" side={DoubleSide} toneMapped={false} />
            </mesh>
          ))}
          <mesh name="Threshold frame · Door header" position={[0, 1, 0.08]}>
            <boxGeometry args={[2.25, 0.18, 0.24]} />
            <meshBasicMaterial color="#17232c" side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh name="Threshold frame · Door trim" position={[0, 0.84, -0.08]}>
            <boxGeometry args={[1.92, 0.065, 0.08]} />
            <meshBasicMaterial color="#8fd8ff" side={DoubleSide} toneMapped={false} />
          </mesh>
          <mesh name="Threshold frame · Door sill" position={[0, -1, 0.12]}>
            <boxGeometry args={[2.25, 0.18, 0.34]} />
            <meshBasicMaterial color="#d9a566" side={DoubleSide} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <>
          <mesh name="Threshold frame · Structural ring">
            <torusGeometry args={[ringRadius, 0.42, 16, 48]} />
            <meshBasicMaterial
              ref={ringMatRef}
              color="#17232c"
              transparent
              depthWrite={false}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
          <mesh name="Threshold frame · Emissive trim" position={[0, 0, 0.2]}>
            <torusGeometry args={[trimRadius, 0.13, 12, 48]} />
            <meshBasicMaterial
              ref={trimMatRef}
              color="#8fd8ff"
              transparent
              depthWrite={false}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
          {/* The literal "umbral": a lit sill bar across the bottom of the frame. */}
          <mesh name="Threshold frame · Sill" position={[0, sillY, 0.35]}>
            <boxGeometry args={[sillWidth, 0.52, 0.9]} />
            <meshBasicMaterial
              ref={sillMatRef}
              color="#d9a566"
              transparent
              depthWrite={false}
              side={DoubleSide}
              toneMapped={false}
            />
          </mesh>
        </>
      )}
      {isExit && (
        <mesh ref={doorPanelRef} name="Threshold · Upper-deck sliding door" position={[0, 0, -0.16]}>
          <boxGeometry args={[1.92, 1.72, 0.12]} />
          <meshBasicMaterial
            color="#d8d2c7"
            side={DoubleSide}
          />
        </mesh>
      )}
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
