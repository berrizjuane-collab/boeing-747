import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points as PointsImpl,
  ShaderMaterial,
} from 'three'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

/** Soft radial falloff so billboard discs read as clouds, not cut-out circles. */
function createSoftDiscMaterial() {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5));
        float falloff = 1.0 - smoothstep(0.15, 0.5, d);
        gl_FragColor = vec4(1.0, 1.0, 1.0, falloff * opacity);
      }
    `,
  })
}

const DUST_SECTION_END = SECTIONS[1].end // fades out after S2 (taxi/takeoff)
const CLOUD_SECTION = SECTIONS[2] // fades in across S3 (climb)
const CLOUD_FADE_OUT_END = SECTIONS[3].end // ...and back out by the end of S4 (threshold) — see the bug note below

/** Dashed centerline + edge lines. Static geometry, no per-frame cost. */
function RunwayMarkings() {
  const stripes = useMemo(() => {
    const items: { z: number }[] = []
    for (let z = -60; z <= 60; z += 10) items.push({ z })
    return items
  }, [])

  return (
    <group position={[0, 0.02, 0]}>
      {stripes.map((s) => (
        <mesh key={s.z} position={[0, 0, s.z]}>
          <planeGeometry args={[0.5, 6]} />
          <meshStandardMaterial color="#e8e4d8" roughness={0.9} />
        </mesh>
      ))}
      {[-11, 11].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <planeGeometry args={[0.35, 400]} />
          <meshStandardMaterial color="#e8e4d8" roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

/** A handful of box hangars and a control tower, distant silhouettes for S1 per PLAN.md §3. */
function DistantAirport() {
  const buildings = useMemo(
    () => [
      { pos: [-140, 6, -20] as const, size: [40, 12, 30] as const },
      { pos: [-150, 5, 30] as const, size: [30, 10, 24] as const },
      { pos: [160, 7, -30] as const, size: [46, 14, 32] as const },
    ],
    [],
  )

  return (
    <group>
      {buildings.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#5a5f66" roughness={0.85} />
        </mesh>
      ))}
      {/* control tower: shaft + head */}
      <mesh position={[190, 20, 10]}>
        <cylinderGeometry args={[2.2, 2.6, 40, 8]} />
        <meshStandardMaterial color="#6b7078" roughness={0.8} />
      </mesh>
      <mesh position={[190, 41, 10]}>
        <cylinderGeometry args={[5, 5, 4, 8]} />
        <meshStandardMaterial color="#8fa3ad" roughness={0.6} />
      </mesh>
    </group>
  )
}

/** Drifting dust motes near the runway, visible through S1-S2 and faded out by S3. */
function DustParticles() {
  const pointsRef = useRef<PointsImpl>(null)
  const geometry = useMemo(() => {
    const count = 400
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100
      positions[i * 3 + 1] = 0.3 + Math.random() * 7
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return geo
  }, [])

  useFrame(({ clock }) => {
    const points = pointsRef.current
    if (!points) return
    const { progress } = useScrollStore.getState()
    const fade = 1 - Math.min(1, Math.max(0, (progress - DUST_SECTION_END) / 0.05))
    const material = points.material as import('three').PointsMaterial
    material.opacity = 0.3 * fade
    points.visible = fade > 0.01
    points.rotation.y = clock.elapsedTime * 0.01
  })

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#f2e6cf"
        size={0.16}
        transparent
        opacity={0.3}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}

/**
 * Cheap billboard cloud layer for S3 — planes with a soft radial-alpha
 * shader, not volumetrics, per PLAN.md §3 S3. Kept well off the S2->S3
 * camera flight corridor (roughly x:[0,100], z:[-220,-40]) — the first pass
 * put clouds directly in that corridor and the camera flew close enough
 * that flat-opacity discs read as hard geometric panels, not clouds.
 */
function CloudLayer() {
  const groupRef = useRef<import('three').Group>(null)
  const material = useMemo(() => createSoftDiscMaterial(), [])
  const clouds = useMemo(
    () => [
      { pos: [-170, 40, -120] as const, scale: 70 },
      { pos: [190, 55, -160] as const, scale: 85 },
      { pos: [-140, 20, -220] as const, scale: 90 },
      { pos: [160, 15, -260] as const, scale: 75 },
      { pos: [-200, 70, -280] as const, scale: 100 },
      { pos: [40, 90, -300] as const, scale: 110 },
    ],
    [],
  )

  useFrame(() => {
    const group = groupRef.current
    if (!group) return
    const { progress } = useScrollStore.getState()
    // Fade in across S3, hold, fade back out across S4 — a first pass only
    // ever ramped IN and clamped at 1, so the clouds stayed visible all the
    // way through the interior and into the footer. Caught by scrolling the
    // *whole* page during verification, not just the section they're meant
    // for — worth remembering next time something is "fade in" only.
    const fadeIn = Math.min(1, Math.max(0, (progress - (CLOUD_SECTION.start - 0.04)) / 0.1))
    const fadeOut = Math.min(1, Math.max(0, (CLOUD_FADE_OUT_END - progress) / 0.1))
    const t = Math.min(fadeIn, fadeOut)
    group.visible = t > 0.01
    material.uniforms.opacity.value = 0.4 * t
  })

  return (
    <group ref={groupRef}>
      {clouds.map((c, i) => (
        <Billboard key={i} position={c.pos}>
          <mesh material={material}>
            <planeGeometry args={[c.scale, c.scale]} />
          </mesh>
        </Billboard>
      ))}
    </group>
  )
}

export function RunwayEnvironment() {
  return (
    <>
      <RunwayMarkings />
      <DistantAirport />
      <DustParticles />
      <CloudLayer />
    </>
  )
}
