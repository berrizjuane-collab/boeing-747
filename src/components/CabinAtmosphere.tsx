import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh as InstancedMeshImpl,
  Object3D,
  Points as PointsImpl,
  PointsMaterial,
  ShaderMaterial,
  StaticDrawUsage,
  Vector3,
} from 'three'
import { createSoftDotTexture } from '../lib/interiorSurfaceMaps'
import { interiorToWorld, INTERIOR_MANIFEST, FLYING_POSE } from '../lib/sceneLayout'
import { useQualityStore, TIER_SETTINGS } from '../state/qualityStore'
import { SECTIONS } from '../lib/sections'
import { seededRandom } from '../lib/seededRandom'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

/**
 * Round 5: what the cabin air does — sun shafts raking in through the
 * starboard windows (and a cooler sky wash through the port ones), dust
 * motes drifting in them, and the passenger-service-unit reading lights
 * over every seat. Four draw calls, all faded by the same cabin factor
 * InteriorLighting.tsx uses so nothing is visible outside S4–S6.
 *
 * Window positions are the blockout's own (blender/interior_blockout.py:
 * main deck 13 rows at z = 9.05 + 1.95 i, x = ±3.01, y = 1.40; upper deck
 * 9 rows at z = 41.05 + 1.90 i, x = ±2.665, y = 3.56), mapped through
 * INTERIOR_OFFSET the same way sceneLayout.ts maps the zone anchors.
 */
function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
function cabinFactor(progress: number) {
  const entry = smoothstep(SECTIONS[3].start, SECTIONS[4].start, progress)
  const exit = 1 - smoothstep(SECTIONS[5].start, SECTIONS[5].end, progress)
  return Math.min(entry, exit)
}

interface WindowSpec {
  x: number
  y: number
  z: number
  side: 1 | -1
}

function windowSpecs(): WindowSpec[] {
  return INTERIOR_MANIFEST.windows as WindowSpec[]
}

function toWorld([x, y, z]: readonly [number, number, number]): [number, number, number] {
  return interiorToWorld([x, y, z])
}

function createShaftMaterial(color: string) {
  return new ShaderMaterial({
    name: 'Cabin · Light shaft',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: { opacity: { value: 0 }, shaftColor: { value: new Color(color) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * localPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform vec3 shaftColor;
      varying vec2 vUv;
      void main() {
        // v runs from the window (1) into the cabin (0); u across the beam.
        float along = pow(vUv.y, 1.6);
        float across = 1.0 - smoothstep(0.55, 1.0, abs(vUv.x - 0.5) * 2.0);
        float a = along * across * opacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(shaftColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

const SHAFT_LENGTH = 4.6
const SHAFT_WIDTH = 1.15
const SHAFT_DROP_ANGLE = 0.62 // radians below horizontal

export function LightShafts({ side, color, strength }: { side: 1 | -1; color: string; strength: number }) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const material = useMemo(() => createShaftMaterial(color), [color])
  useEffect(() => () => material.dispose(), [material])
  const windows = useMemo(() => windowSpecs().filter((w) => w.side === side), [side])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    windows.forEach((w, index) => {
      const [wx, wy, wz] = toWorld([w.x, w.y, w.z])
      // Plane: local +y points from the beam's end back toward the window.
      // Position at the beam's centre, tilted down and inward from the pane.
      const inward = -w.side
      const centreX = wx + inward * Math.cos(SHAFT_DROP_ANGLE) * SHAFT_LENGTH * 0.5
      const centreY = wy - Math.sin(SHAFT_DROP_ANGLE) * SHAFT_LENGTH * 0.5
      dummy.position.set(centreX, centreY, wz)
      dummy.rotation.set(0, 0, inward * (Math.PI / 2 - SHAFT_DROP_ANGLE) * -1)
      dummy.scale.set(SHAFT_WIDTH, SHAFT_LENGTH, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [windows])

  useFrame(() => {
    const factor = cabinFactor(useScrollStore.getState().progress)
    material.uniforms.opacity.value = factor * strength
    if (meshRef.current) meshRef.current.visible = factor > 0.01
  })

  return (
    <instancedMesh ref={meshRef} name={`Cabin · Light shafts (${side > 0 ? 'starboard' : 'port'})`} args={[undefined, material, windows.length]} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

const DUST_COUNT = 900

function DustMotes() {
  const pointsRef = useRef<PointsImpl>(null)
  const sprite = useMemo(() => createSoftDotTexture(32), [])
  const geometry = useMemo(() => {
    const random = seededRandom(0xca81)
    const positions = new Float32Array(DUST_COUNT * 3)
    const phases = new Float32Array(DUST_COUNT)
    for (let index = 0; index < DUST_COUNT; index += 1) {
      const upper = index % 4 === 0
      const local: [number, number, number] = upper
        ? [(random() - 0.5) * 4.6, 2.55 + random() * 1.7, 40.5 + random() * 17]
        : [(random() - 0.5) * 5.6, 0.25 + random() * 1.85, 1 + random() * 32]
      const [x, y, z] = toWorld(local)
      positions[index * 3] = x
      positions[index * 3 + 1] = y
      positions[index * 3 + 2] = z
      phases[index] = random() * Math.PI * 2
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.setAttribute('aPhase', new Float32BufferAttribute(phases, 1))
    result.computeBoundingSphere()
    return result
  }, [])
  const material = useMemo(
    () =>
      new PointsMaterial({
        map: sprite,
        color: '#ffe3bd',
        size: 0.055,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    [sprite],
  )
  const basePositions = useMemo(() => (geometry.getAttribute('position').array as Float32Array).slice(), [geometry])
  const particleFraction = useQualityStore(s => TIER_SETTINGS[s.tier].particlesPct)
  useEffect(() => () => { geometry.dispose(); material.dispose(); sprite.dispose() }, [geometry, material, sprite])

  useFrame(({ clock }) => {
    const points = pointsRef.current
    if (!points) return
    const factor = cabinFactor(useScrollStore.getState().progress)
    material.opacity = factor * 0.55
    points.visible = factor > 0.01 && particleFraction > 0
    geometry.setDrawRange(0, Math.floor(DUST_COUNT * particleFraction))
    if (!points.visible || reducedMotionState.active) return
    const t = clock.elapsedTime
    const position = geometry.getAttribute('position')
    const phases = geometry.getAttribute('aPhase')
    const array = position.array as Float32Array
    for (let index = 0; index < DUST_COUNT; index += 1) {
      const phase = phases.getX(index)
      array[index * 3] = basePositions[index * 3] + Math.sin(t * 0.21 + phase) * 0.12
      array[index * 3 + 1] = basePositions[index * 3 + 1] + Math.sin(t * 0.17 + phase * 1.7) * 0.08 - ((t * 0.02 + phase) % 0.6)
      array[index * 3 + 2] = basePositions[index * 3 + 2] + Math.cos(t * 0.13 + phase * 0.6) * 0.1
    }
    position.needsUpdate = true
  })

  return <points ref={pointsRef} name="Cabin · Dust motes" geometry={geometry} material={material} frustumCulled={false} />
}

function ReadingLights({ seatWorldPositions }: { seatWorldPositions: Vector3[] }) {
  const pointsRef = useRef<PointsImpl>(null)
  const sprite = useMemo(() => createSoftDotTexture(32), [])
  const geometry = useMemo(() => {
    const positions = new Float32Array(seatWorldPositions.length * 3)
    seatWorldPositions.forEach((seat, index) => {
      positions[index * 3] = seat.x
      positions[index * 3 + 1] = seat.y + 1.62 * Math.cos(FLYING_POSE.pitchDeg * Math.PI / 180)
      positions[index * 3 + 2] = seat.z + 1.62 * Math.sin(FLYING_POSE.pitchDeg * Math.PI / 180) + 0.12
    })
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    result.computeBoundingSphere()
    return result
  }, [seatWorldPositions])
  const material = useMemo(
    () =>
      new PointsMaterial({
        map: sprite,
        color: '#ffd9a8',
        size: 0.16,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    [sprite],
  )
  useEffect(() => () => { geometry.dispose(); material.dispose(); sprite.dispose() }, [geometry, material, sprite])
  useFrame(() => {
    const factor = cabinFactor(useScrollStore.getState().progress)
    material.opacity = factor * 0.9
    if (pointsRef.current) pointsRef.current.visible = factor > 0.01
  })
  if (seatWorldPositions.length === 0) return null
  return <points ref={pointsRef} name="Cabin · PSU reading lights" geometry={geometry} material={material} frustumCulled={false} />
}

export function CabinAtmosphere({ seatWorldPositions }: { seatWorldPositions: Vector3[] }) {
  return (
    <group name="Cabin · Atmosphere">
      {/* Beam sheets remain disabled until phase 5 optical review. */}
      <DustMotes />
      <ReadingLights seatWorldPositions={seatWorldPositions} />
    </group>
  )
}
