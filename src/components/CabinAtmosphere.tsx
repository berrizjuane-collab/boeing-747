import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedMesh as InstancedMeshImpl,
  Matrix4,
  Points as PointsImpl,
  PointsMaterial,
  ShaderMaterial,
  StaticDrawUsage,
  Vector3,
} from 'three'
import { finishShafts } from '../lib/qaConfig'
import { SHAFT_DROP_ANGLE, SHAFT_WIDTH, shaftLength } from '../lib/cabinShafts'
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

/**
 * plan6 5.4 (A15). The previous shafts were fixed-orientation additive
 * quads: seen face-on they were slabs, seen edge-on they vanished, and the
 * `smoothstep(0.55, 1.0, …)` cut across them is what read as a hard
 * triangular band. Round 6 phase 2 switched them off pending this review.
 *
 * Three changes make a card behave like a volume of lit air:
 *
 * - It billboards around its own axis, so the beam always presents its
 *   width to the camera and never flips between slab and nothing.
 * - Across the beam it is a smooth bell rather than a clipped edge, and
 *   along it an exponential falloff, which is what light scattering in air
 *   actually does.
 * - It is bounded by the room: each beam's length is solved from its own
 *   window height so it dies at the floor it belongs to instead of passing
 *   through it, and the last part of that length fades out.
 */
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
      varying float vFacing;
      void main() {
        vUv = uv;
        // The instance matrix carries the beam's frame: column 3 is the
        // window end, column 1 the axis and length, column 0 the width.
        vec3 origin = instanceMatrix[3].xyz;
        vec3 axis = instanceMatrix[1].xyz;
        float width = length(instanceMatrix[0].xyz);

        vec3 worldOrigin = (modelMatrix * vec4(origin, 1.0)).xyz;
        vec3 worldAxis = mat3(modelMatrix) * axis;
        vec3 toCamera = cameraPosition - worldOrigin;
        vec3 across = cross(normalize(worldAxis), normalize(toCamera));
        float span = length(across);
        // Looking straight down the beam leaves no width to billboard on;
        // the fragment stage fades it out rather than letting it collapse.
        vFacing = span;
        across = span > 1e-4 ? across / span : vec3(1.0, 0.0, 0.0);

        vec3 worldPosition = worldOrigin + worldAxis * (1.0 - uv.y) + across * ((uv.x - 0.5) * width);
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform vec3 shaftColor;
      varying vec2 vUv;
      varying float vFacing;
      void main() {
        // v: 1 at the window, 0 at the far end. u: across the beam.
        float radial = (vUv.x - 0.5) * 2.0;
        // Gaussian across, not a clipped edge — the edge is where the old
        // version showed its geometry.
        float across = exp(-radial * radial * 3.2);
        // Scattering falls off along the beam, and the tail is faded so the
        // bounded length never ends on a visible line.
        float along = exp(-(1.0 - vUv.y) * 1.9) * smoothstep(0.0, 0.16, vUv.y);
        // A beam seen end-on has no width to scatter across.
        float facing = smoothstep(0.12, 0.45, vFacing);
        float a = across * along * facing * opacity;
        if (a < 0.003) discard;
        gl_FragColor = vec4(shaftColor * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function LightShafts({ side, color, strength }: { side: 1 | -1; color: string; strength: number }) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const material = useMemo(() => createShaftMaterial(color), [color])
  useEffect(() => () => material.dispose(), [material])
  const windows = useMemo(() => windowSpecs().filter((w) => w.side === side), [side])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    windows.forEach((w, index) => {
      // Solved per window against the deck it belongs to (cabinShafts.ts).
      const length = shaftLength(w.y)

      const origin = new Vector3(...toWorld([w.x, w.y, w.z]))
      const inward = -w.side
      // Axis runs from the pane down and inboard, in the same pitched basis
      // the cabin itself is registered in.
      const cabinOrigin = new Vector3(...interiorToWorld([0, 0, 0]))
      const axis = new Vector3(
        ...interiorToWorld([inward * Math.cos(SHAFT_DROP_ANGLE), -Math.sin(SHAFT_DROP_ANGLE), 0]),
      )
        .sub(cabinOrigin)
        .normalize()
        .multiplyScalar(length)

      // Columns the vertex shader reads: width, axis, unused, origin.
      matrix.set(
        SHAFT_WIDTH, axis.x, 0, origin.x,
        0, axis.y, 0, origin.y,
        0, axis.z, 1, origin.z,
        0, 0, 0, 1,
      )
      mesh.setMatrixAt(index, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [windows])

  useFrame(() => {
    const factor = cabinFactor(useScrollStore.getState().progress)
    // Shafts are scattering detail, tiered with the rest of it (plan6 7.4):
    // the tier that draws no dust draws no beams either.
    const tiered = TIER_SETTINGS[useQualityStore.getState().tier].particlesPct
    material.uniforms.opacity.value = factor * strength * tiered * (finishShafts ? 1 : 0)
    if (meshRef.current) meshRef.current.visible = factor > 0.01 && tiered > 0
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
      {/* plan6 5.4: the beams return, rebuilt as bounded cylindrical
          volumes rather than the fixed additive quads A15 identified. Warm
          sun to starboard, a cooler sky wash to port. */}
      <LightShafts side={1} color="#ffd9a8" strength={0.16} />
      <LightShafts side={-1} color="#bdd4f2" strength={0.08} />
      <DustMotes />
      <ReadingLights seatWorldPositions={seatWorldPositions} />
    </group>
  )
}
