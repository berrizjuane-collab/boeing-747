import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh as InstancedMeshImpl,
  Object3D,
  Points as PointsImpl,
  ShaderMaterial,
  StaticDrawUsage,
  UniformsLib,
  UniformsUtils,
} from 'three'
import { createAirportGroundPlanGeometry } from '../lib/airportGroundPlan'
import { getAircraftPose } from '../lib/aircraftPose'
import { generateGrassField, seededRandom } from '../lib/grassField'
import {
  APRON,
  createRunwayMarkingsGeometry,
  HANGARS,
  RUNWAY_LENGTH,
  RUNWAY_SURFACE_Y,
  RUNWAY_WIDTH,
} from '../lib/runwayGeometry'
import { SECTIONS } from '../lib/sections'
import { createTreeClumpGeometry } from '../lib/treeGeometry'
import { generateTreeField } from '../lib/treeField'
import { TIER_SETTINGS, type QualityTier, useQualityStore } from '../state/qualityStore'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function Runway() {
  const markingsGeometry = useMemo(createRunwayMarkingsGeometry, [])

  return (
    <group name="Airport · Runway">
      <mesh name="Runway · Asphalt" position={[0, -0.045, 0]} receiveShadow>
        <boxGeometry args={[RUNWAY_WIDTH, 0.13, RUNWAY_LENGTH]} />
        <meshStandardMaterial color="#394043" roughness={0.94} metalness={0.02} />
      </mesh>
      <mesh name="Runway · Horizontal markings" geometry={markingsGeometry} receiveShadow>
        <meshStandardMaterial
          color="#e9e5d8"
          roughness={0.86}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  )
}

/**
 * plan3.md E4: 1 draw call, ~200 triangles. Taxiways, apron border, holding
 * point and parcel boundaries, all one merged geometry sharing
 * RUNWAY_SURFACE_Y and the runway's own coordinates (runwayGeometry.ts) —
 * see the mirror test of B4 in tests/environment.test.mjs.
 */
function AirportGroundPlan() {
  const geometry = useMemo(createAirportGroundPlanGeometry, [])

  return (
    <mesh name="Airport · Taxiways and ground markings" geometry={geometry} receiveShadow>
      <meshStandardMaterial
        roughness={0.9}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
        vertexColors
      />
    </mesh>
  )
}

function createAircraftShadowMaterial() {
  return new ShaderMaterial({
    name: 'Airport · Analytical aircraft shadow material',
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 0.25 } },
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
        vec2 p = vUv - vec2(0.5);
        float fuselage = 1.0 - smoothstep(0.82, 1.0, length(vec2(p.x / 0.105, p.y / 0.49)));
        float wings = 1.0 - smoothstep(0.78, 1.0, length(vec2(p.x / 0.49, p.y / 0.115)));
        float tail = 1.0 - smoothstep(0.74, 1.0, length(vec2(p.x / 0.25, (p.y - 0.31) / 0.075)));
        float silhouette = max(fuselage, max(wings, tail));
        gl_FragColor = vec4(0.025, 0.035, 0.04, silhouette * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

/**
 * One-draw replacement for the exterior shadow map. It follows the actual
 * aircraft pose and offsets along the key-light vector as altitude grows,
 * preserving S2's moving-shadow cue without redrawing 100+ aircraft meshes.
 */
function AircraftGroundShadow() {
  const meshRef = useRef<import('three').Mesh>(null)
  const material = useMemo(createAircraftShadowMaterial, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const progress = useScrollStore.getState().progress
    const pose = getAircraftPose(progress)
    const altitude = Math.max(0, pose.position.y)
    const runwayPresence = 1 - smoothstep(SECTIONS[1].end - 0.025, SECTIONS[1].end + 0.025, progress)
    const altitudeFade = 1 - smoothstep(8, 48, altitude)

    mesh.position.set(pose.position.x - altitude * 0.8, RUNWAY_SURFACE_Y + 0.003, pose.position.z - altitude * 0.4)
    mesh.rotation.z = -pose.pitchRad
    mesh.scale.set(80 + altitude * 0.24, 74 + altitude * 0.2, 1)
    mesh.visible = runwayPresence > 0.01
    material.uniforms.opacity.value = 0.26 * runwayPresence * (0.35 + altitudeFade * 0.65)
  })

  return (
    <mesh
      ref={meshRef}
      name="Airport · Moving aircraft ground shadow"
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      renderOrder={1}
    >
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

const VEGETATION_MAX = 720
// plan3.md bug #11: `low` used to carry a nonzero count (144) that never
// mattered — the whole mesh is hidden in that tier (`visible={tier !==
// 'low'}` below), so whatever `count` it was passed drew nothing. 0 is the
// number that actually describes what low renders.
const VEGETATION_COUNT: Record<QualityTier, number> = { high: 720, mid: 360, low: 0 }

function createGrassClumpGeometry() {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = (blade / 3) * Math.PI
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const first = positions.length / 3
    // plan3.md C2/§1.1: a vertical blade's true face normal is horizontal
    // (perpendicular to its own plane, N.y=0) — it can never catch a key
    // light that's 74% overhead, which is the direct cause of grass
    // reading as near-black. Foliage shading fakes the normal instead of
    // using computeVertexNormals()'s geometrically-correct one: mostly up,
    // blended with a little of the blade's own outward lean so the three
    // crossed blades in one clump still shade slightly differently.
    const outward = [sin, 0, cos]
    const fakeNormal = [outward[0] * 0.25, 0.75, outward[2] * 0.25]
    const length = Math.hypot(fakeNormal[0], fakeNormal[1], fakeNormal[2])
    const nx = fakeNormal[0] / length
    const ny = fakeNormal[1] / length
    const nz = fakeNormal[2] / length
    for (const [x, y] of [[-0.24, 0], [0.24, 0], [0, 1]] as const) {
      positions.push(x * cos, y, -x * sin)
      normals.push(nx, ny, nz)
    }
    indices.push(first, first + 1, first + 2)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

// plan3.md E1/E3: grass is the one subsystem inside the old hero-airport
// group that's genuinely sub-pixel past S1/S2 (blades ~1.6u tall at 200+u
// out) — everything else in that group (runway, hangars, tower) now stays
// visible past the old 30.5% group cutoff, but grass keeps a fade roughly
// where that cutoff used to sit, as its own concern rather than a group-wide
// gate.
const GRASS_FADE_END = 0.305

/** One low-poly instanced grass field; tier changes alter instance count, never draw calls. */
function VegetationBands() {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const tier = useQualityStore((state) => state.tier)
  const grassGeometry = useMemo(createGrassClumpGeometry, [])
  const windUniform = useMemo(() => ({ value: 0 }), [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    const coolGreen = new Color('#52664c')
    const sunlitGreen = new Color('#96a269')
    const instanceColor = new Color()

    const placements = generateGrassField(VEGETATION_MAX, 0xa38026)
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    placements.forEach((placement, index) => {
      dummy.position.set(placement.side * placement.lateral, RUNWAY_SURFACE_Y, placement.z)
      dummy.rotation.set(0, placement.rotationY, 0)
      dummy.scale.set(placement.scaleXZ, placement.height, placement.scaleXZ)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.copy(coolGreen).lerp(sunlitGreen, placement.colorMix))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh) mesh.visible = tier !== 'low' && useScrollStore.getState().progress < GRASS_FADE_END
    // Same "stop advancing, don't reset" reduced-motion convention as
    // DustParticles below — a frozen phase, not a forced-upright pose.
    if (!reducedMotionState.active) windUniform.value = performance.now() / 1000
  })

  return (
    <instancedMesh
      ref={meshRef}
      name="Airport · Instanced grass bands"
      args={[grassGeometry, undefined, VEGETATION_MAX]}
      count={VEGETATION_COUNT[tier]}
      receiveShadow
    >
      <meshStandardMaterial
        color="#ffffff"
        emissive="#314431"
        emissiveIntensity={0.42}
        roughness={1}
        side={DoubleSide}
        vertexColors
        onBeforeCompile={(shader) => {
          // plan3.md C2: wind sway. `windUniform` is the same object mutated
          // every frame in the useFrame above, so later frames update this
          // shader's uniform without a recompile. Phase is derived from each
          // instance's own world offset so clumps don't sway in lockstep;
          // displacement is scaled by local `position.y` (0 at the blade
          // base, 1 at the tip) so blades stay planted and lean at the top.
          shader.uniforms.windTime = windUniform
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float windTime;')
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
              #ifdef USE_INSTANCING
                float windPhase = windTime * 2.2 + (instanceMatrix[3].x + instanceMatrix[3].z) * 0.35;
                float bladeLean = position.y;
                transformed.x += sin(windPhase) * 0.06 * bladeLean;
                transformed.z += cos(windPhase * 0.8) * 0.05 * bladeLean;
              #endif`,
            )
        }}
      />
    </instancedMesh>
  )
}

const TREE_NEAR_MAX = 42
const TREE_FAR_MAX = 96
const TREE_COUNT: Record<QualityTier, { near: number; far: number }> = {
  high: { near: TREE_NEAR_MAX, far: TREE_FAR_MAX },
  mid: { near: 26, far: 56 },
  low: { near: 14, far: 28 },
}
const TREE_FIELD = generateTreeField(TREE_NEAR_MAX, TREE_FAR_MAX, 0x7ee5a1)
const TREE_NEAR_PLACEMENTS = TREE_FIELD.filter((tree) => tree.band === 'near')
const TREE_FAR_PLACEMENTS = TREE_FIELD.filter((tree) => tree.band === 'far')

interface TreeBandProps {
  placements: readonly ReturnType<typeof generateTreeField>[number][]
  max: number
  count: number
  geometry: BufferGeometry
  name: string
}

/** One instanced draw per band (near/far) — see generateTreeField for why
 * the two bands aren't merged into a single draw. */
function TreeBand({ placements, max, count, geometry, name }: TreeBandProps) {
  const meshRef = useRef<InstancedMeshImpl>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const random = seededRandom(0x1eaf00 ^ max)
    const dummy = new Object3D()
    const deepGreen = new Color('#25311f')
    const sunlitGreen = new Color('#5c6e3f')
    const instanceColor = new Color()

    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    placements.forEach((tree, index) => {
      dummy.position.set(tree.x, RUNWAY_SURFACE_Y, tree.z)
      dummy.rotation.set(0, tree.rotationY, 0)
      const treeHeight = 4.2 * tree.scale
      dummy.scale.set(treeHeight, treeHeight, treeHeight)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.copy(deepGreen).lerp(sunlitGreen, random()))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [placements, max, geometry])

  return (
    <instancedMesh ref={meshRef} name={name} args={[geometry, undefined, max]} count={count} receiveShadow>
      <meshStandardMaterial color="#ffffff" roughness={1} side={DoubleSide} vertexColors />
    </instancedMesh>
  )
}

/**
 * plan3.md C1 (near, identifiable trees east of the runway) + C4 (far
 * treeline ringing both sides, breaking the horizon that the ground disc's
 * fog dissolve — EnvironmentPlaceholder.tsx — otherwise leaves empty).
 * Always visible: at tree scale (~4u), nothing in this scene is far enough
 * for them to go sub-pixel the way grass blades do (see GRASS_FADE_END).
 */
function TreeField() {
  const tier = useQualityStore((state) => state.tier)
  const geometry = useMemo(createTreeClumpGeometry, [])
  const counts = TREE_COUNT[tier]

  return (
    <group name="Environment · Trees">
      <TreeBand placements={TREE_NEAR_PLACEMENTS} max={TREE_NEAR_MAX} count={counts.near} geometry={geometry} name="Environment · Near treeline" />
      <TreeBand placements={TREE_FAR_PLACEMENTS} max={TREE_FAR_MAX} count={counts.far} geometry={geometry} name="Environment · Far treeline" />
    </group>
  )
}

function createGableRoofGeometry() {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 0.5, 0.5,
        -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 0.5, -0.5,
      ],
      3,
    ),
  )
  geometry.setIndex([
    0, 1, 2,
    5, 4, 3,
    0, 2, 5, 0, 5, 3,
    2, 1, 4, 2, 4, 5,
    1, 0, 3, 1, 3, 4,
  ])
  geometry.computeVertexNormals()
  return geometry
}

/** Recognisable hangars and control tower, repositioned into the S1 hero frustum. */
function DistantAirport() {
  const wallsRef = useRef<InstancedMeshImpl>(null)
  const roofsRef = useRef<InstancedMeshImpl>(null)
  const roofGeometry = useMemo(createGableRoofGeometry, [])
  const tier = useQualityStore((state) => state.tier)
  const showLowPriorityDetails = tier !== 'low'

  useLayoutEffect(() => {
    const walls = wallsRef.current
    const roofs = roofsRef.current
    if (!walls || !roofs) return
    const dummy = new Object3D()
    const instanceColor = new Color()

    HANGARS.forEach((hangar, index) => {
      const [width, height, depth] = hangar.size
      dummy.position.set(hangar.position[0], hangar.position[1], hangar.position[2])
      dummy.scale.set(width, height, depth)
      dummy.updateMatrix()
      walls.setMatrixAt(index, dummy.matrix)
      walls.setColorAt(index, instanceColor.set(hangar.color))

      dummy.position.set(hangar.position[0], hangar.position[1] + height / 2, hangar.position[2])
      dummy.scale.set(width * 1.06, 5, depth * 1.08)
      dummy.updateMatrix()
      roofs.setMatrixAt(index, dummy.matrix)
    })
    walls.instanceMatrix.setUsage(StaticDrawUsage)
    roofs.instanceMatrix.setUsage(StaticDrawUsage)
    walls.instanceMatrix.needsUpdate = true
    roofs.instanceMatrix.needsUpdate = true
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true
    walls.computeBoundingSphere()
    roofs.computeBoundingSphere()
  }, [])

  return (
    <group name="Airport · Terminal silhouettes" visible={tier !== 'low'}>
      {showLowPriorityDetails && (
        <mesh
          name="Airport · Apron"
          rotation={[-Math.PI / 2, 0, 0]}
          position={[APRON.centerX, 0.012, APRON.centerZ]}
          receiveShadow
        >
          <planeGeometry args={[APRON.width, APRON.depth]} />
          <meshStandardMaterial color="#454b4c" roughness={0.98} />
        </mesh>
      )}
      <instancedMesh ref={wallsRef} name="Airport · Hangar walls" args={[undefined, undefined, HANGARS.length]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#606970" roughness={0.82} vertexColors />
      </instancedMesh>
      <instancedMesh
        ref={roofsRef}
        name="Airport · Hangar roofs"
        args={[roofGeometry, undefined, HANGARS.length]}
        receiveShadow
        visible={showLowPriorityDetails}
      >
        <meshStandardMaterial color="#7b858a" roughness={0.76} metalness={0.08} />
      </instancedMesh>

      <group name="Airport · Control tower" position={[-82, 0, -18]}>
        <mesh name="Control tower · Shaft" position={[0, 13, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[2.2, 3.3, 26, 10]} />
          <meshStandardMaterial color="#727b7f" roughness={0.8} />
        </mesh>
        <mesh name="Control tower · Cab" position={[0, 28, 0]} castShadow>
          <cylinderGeometry args={[5.8, 4.8, 4.2, 10]} />
          <meshStandardMaterial color="#7893a1" roughness={0.38} metalness={0.16} />
        </mesh>
        {showLowPriorityDetails && (
          <>
            <mesh name="Control tower · Window band" position={[0, 28.6, 0]}>
              <cylinderGeometry args={[5.88, 5.88, 1.25, 10]} />
              <meshStandardMaterial color="#20343f" emissive="#172a34" emissiveIntensity={0.18} roughness={0.24} />
            </mesh>
            <mesh name="Control tower · Roof" position={[0, 30.7, 0]}>
              <cylinderGeometry args={[6.6, 5.5, 0.55, 10]} />
              <meshStandardMaterial color="#4d5559" roughness={0.7} />
            </mesh>
            <mesh name="Control tower · Beacon" position={[0, 31.45, 0]}>
              <sphereGeometry args={[0.32, 8, 6]} />
              <meshBasicMaterial color="#d77b62" toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
    </group>
  )
}

const DUST_COUNT = 400
const DUST_SECTION_END = SECTIONS[1].end

/** Drifting dust near the runway, deterministic and tiered like the original. */
function DustParticles() {
  const pointsRef = useRef<PointsImpl>(null)
  const geometry = useMemo(() => {
    const random = seededRandom(0xd057)
    const positions = new Float32Array(DUST_COUNT * 3)
    for (let index = 0; index < DUST_COUNT; index += 1) {
      positions[index * 3] = (random() - 0.5) * 100
      positions[index * 3 + 1] = 0.3 + random() * 7
      positions[index * 3 + 2] = (random() - 0.5) * 100
    }
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return result
  }, [])

  useFrame(({ clock }) => {
    const points = pointsRef.current
    if (!points) return
    const { progress } = useScrollStore.getState()
    const fade = 1 - smoothstep(DUST_SECTION_END - 0.01, DUST_SECTION_END + 0.05, progress)
    const material = points.material as import('three').PointsMaterial
    material.opacity = 0.2 * fade
    const particlesPct = TIER_SETTINGS[useQualityStore.getState().tier].particlesPct
    points.geometry.setDrawRange(0, Math.floor(DUST_COUNT * particlesPct))
    points.visible = fade > 0.01 && particlesPct > 0
    if (!reducedMotionState.active) points.rotation.y = clock.elapsedTime * 0.01
  })

  return (
    <points ref={pointsRef} name="Airport · Runway dust" geometry={geometry}>
      <pointsMaterial
        color="#ead9bf"
        size={0.14}
        transparent
        opacity={0.2}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}

interface CloudSpec {
  position: readonly [number, number, number]
  scale: readonly [number, number]
  rotation: number
}

function createSoftCloudMaterial(color: string) {
  return new ShaderMaterial({
    name: 'Environment · Soft cloud material',
    transparent: true,
    depthWrite: false,
    fog: true,
    // ShaderMaterial does not inject fog uniforms automatically. Merging
    // UniformsLib.fog is required before enabling `fog: true`; omitting it
    // makes WebGLRenderer dereference an absent fogDensity uniform in S3/S6.
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        opacity: { value: 0 },
        cloudColor: { value: new Color(color) },
      },
    ]),
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 localPosition = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          localPosition = instanceMatrix * localPosition;
        #endif
        vec4 mvPosition = modelViewMatrix * localPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      uniform vec3 cloudColor;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      float ellipseDistance(vec2 point, vec2 center, vec2 radius) {
        return length((point - center) / radius);
      }
      void main() {
        vec2 p = vUv - vec2(0.5);
        float base = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(0.0, -0.09), vec2(0.48, 0.18)));
        float leftLobe = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(-0.2, 0.015), vec2(0.25, 0.24)));
        float crown = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(0.01, 0.1), vec2(0.29, 0.31)));
        float rightLobe = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(0.235, 0.0), vec2(0.23, 0.22)));
        float body = max(base, max(leftLobe, max(crown, rightLobe)));
        float detail = 0.92 + 0.08 * sin(vUv.x * 19.0) * sin(vUv.y * 13.0);
        float alpha = body * detail * opacity;
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(cloudColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  })
}

interface CloudLayerProps {
  name: string
  color: string
  clouds: readonly CloudSpec[]
  opacity: number
  visibility: (progress: number) => number
}

/** Camera-facing cloud instances: one draw call per narrative cloud layer. */
function CloudLayer({ name, color, clouds, opacity, visibility }: CloudLayerProps) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const material = useMemo(() => createSoftCloudMaterial(color), [color])
  const dummy = useMemo(() => new Object3D(), [])

  useLayoutEffect(() => {
    if (meshRef.current) meshRef.current.instanceMatrix.setUsage(DynamicDrawUsage)
  }, [])

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const factor = visibility(useScrollStore.getState().progress)
    mesh.visible = factor > 0.01
    material.uniforms.opacity.value = opacity * factor
    if (!mesh.visible) return

    clouds.forEach((cloud, index) => {
      dummy.position.set(...cloud.position)
      dummy.quaternion.copy(camera.quaternion)
      dummy.rotateZ(cloud.rotation)
      dummy.scale.set(cloud.scale[0], cloud.scale[1], 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      name={name}
      args={[undefined, material, clouds.length]}
      frustumCulled={false}
      renderOrder={-2}
    >
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

const HIGH_ALTITUDE_CLOUDS: readonly CloudSpec[] = [
  { position: [-148, 72, -16], scale: [112, 52], rotation: -0.16 },
  { position: [142, 88, 24], scale: [126, 58], rotation: 0.12 },
  { position: [-108, 24, 82], scale: [134, 64], rotation: 0.08 },
  { position: [122, 34, 118], scale: [106, 52], rotation: -0.1 },
  { position: [-206, 108, 96], scale: [144, 70], rotation: 0.18 },
  { position: [38, 126, 158], scale: [158, 76], rotation: -0.06 },
]

const SUNSET_CLOUDS: readonly CloudSpec[] = [
  { position: [-132, 76, -236], scale: [154, 62], rotation: -0.1 },
  { position: [80, 104, -262], scale: [132, 54], rotation: 0.12 },
  { position: [-192, 48, -142], scale: [118, 50], rotation: 0.2 },
  { position: [74, 52, -202], scale: [108, 44], rotation: -0.16 },
  { position: [-48, 128, -322], scale: [174, 70], rotation: 0.04 },
  { position: [154, 118, -224], scale: [126, 48], rotation: -0.2 },
]

const highAltitudeCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.24, 0.31, progress), 1 - smoothstep(0.39, 0.49, progress))

const sunsetCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.805, 0.85, progress), 1 - smoothstep(0.95, 1, progress))

// plan3.md E1/E3: this used to be a single group-level `visible = progress <
// 0.305` gate. The runway, hangars and tower are resolved enough to read at
// any scroll position past S2 (§1.8) — they stay mounted unconditionally now.
// Only the subsystems that are genuinely sub-pixel at distance fade
// themselves: VegetationBands owns its own GRASS_FADE_END, DustParticles
// already fades independently at DUST_SECTION_END, and AircraftGroundShadow's
// runwayPresence fade never re-triggers past S2 by construction.
function HeroAirportEnvironment() {
  return (
    <group name="Environment · Hero airport">
      <Runway />
      <AirportGroundPlan />
      <AircraftGroundShadow />
      <VegetationBands />
      <TreeField />
      <DistantAirport />
      <DustParticles />
    </group>
  )
}

export function RunwayEnvironment() {
  return (
    <group name="Environment · Airport and clouds">
      <HeroAirportEnvironment />
      <CloudLayer
        name="Environment · S3 high-altitude clouds"
        color="#eef5fb"
        clouds={HIGH_ALTITUDE_CLOUDS}
        opacity={0.3}
        visibility={highAltitudeCloudVisibility}
      />
      <CloudLayer
        name="Environment · S6 sunset clouds"
        color="#f7d9c8"
        clouds={SUNSET_CLOUDS}
        opacity={0.3}
        visibility={sunsetCloudVisibility}
      />
    </group>
  )
}
