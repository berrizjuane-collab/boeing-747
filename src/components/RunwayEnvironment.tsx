import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh as InstancedMeshImpl,
  MeshStandardMaterial,
  Object3D,
  Points as PointsImpl,
  ShaderMaterial,
  StaticDrawUsage,
  UniformsLib,
  UniformsUtils,
} from 'three'
import { Forest } from './Forest'
import { getAircraftPose } from '../lib/aircraftPose'
import { createAirportGroundPlanGeometry } from '../lib/airportGroundPlan'
import { createControlTowerBodyGeometry } from '../lib/controlTowerGeometry'
import { createHangarFacadeMap } from '../lib/hangarSurfaceMap'
import { ensureNeutralColorAttribute } from '../lib/instanceColorAttribute'
import { seededRandom } from '../lib/proceduralRandom'
import { createRunwayMarkingsGeometry, RUNWAY_LENGTH, RUNWAY_SURFACE_Y, RUNWAY_WIDTH } from '../lib/runwayGeometry'
import { createRunwaySurfaceMap } from '../lib/runwaySurfaceMap'
import { SECTIONS } from '../lib/sections'
import { duskColorMix } from '../lib/thresholdLighting'
import { createGrassClumpGeometry } from '../lib/vegetationGeometry'
import { buildVegetationInstances, VEGETATION_MAX } from '../lib/vegetationLayout'
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
  const groundPlanGeometry = useMemo(createAirportGroundPlanGeometry, [])
  const wearMap = useMemo(createRunwaySurfaceMap, [])

  return (
    <group name="Airport · Runway">
      {/* D3: tone variation + rubber deposits at the touchdown zones,
          world-XZ-aligned via the box's own default UV (see
          runwaySurfaceMap.ts) — the markings above stay a flat, untextured
          color so B4's vertex/normal contract is untouched. */}
      <mesh name="Runway · Asphalt" position={[0, -0.045, 0]} receiveShadow>
        <boxGeometry args={[RUNWAY_WIDTH, 0.13, RUNWAY_LENGTH]} />
        <meshStandardMaterial map={wearMap} color="#394043" roughness={0.94} metalness={0.02} />
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
      {/* E4/D5: taxiways connecting the runway to the apron/hangar cluster,
          one merged draw call sharing this exact RUNWAY_SURFACE_Y/normal
          contract (see airportGroundPlan.ts) via vertex colors instead of a
          second material. */}
      <mesh name="Airport · Ground plan" geometry={groundPlanGeometry} receiveShadow>
        <meshStandardMaterial roughness={0.92} vertexColors />
      </mesh>
    </group>
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

// plan3.md bug #11: `low` used to carry a nonzero count (144) that never
// mattered — the whole mesh is hidden in that tier (`visible={tier !==
// 'low'}` below), so whatever `count` it was passed drew nothing. 0 is the
// number that actually describes what low renders.
const VEGETATION_COUNT: Record<QualityTier, number> = { high: 720, mid: 360, low: 0 }

// E1 (plan3.md §4 Fase E piece 3): the hero airport group used to vanish
// whole at 30.5% scroll, which is what hid the runway from every section
// that flies over it. Grass blades are the one part of that group that
// genuinely earns a distance cutoff on their own terms — at ~1.6 units tall
// they're already sub-pixel by the time the camera is this far out (§1.8)
// — so they keep a cutoff, just one scoped to grass alone instead of the
// whole environment. Held a little past S2's own end (0.28) so the fade
// finishes inside the same window the old hard cut used to sit in (0.305),
// which is why it doesn't introduce a new visible jump — it's the region
// already proven imperceptible.
const GRASS_VISIBLE_END = SECTIONS[1].end + 0.025

interface GrassShaderUniforms {
  windTime: { value: number }
  windStrength: { value: number }
}

function createGrassMaterial() {
  const material = new MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#314431',
    emissiveIntensity: 0.42,
    roughness: 1,
    side: DoubleSide,
    vertexColors: true,
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = { value: 0 }
    shader.uniforms.windStrength = { value: 0 }
    material.userData.shader = shader as unknown as { uniforms: GrassShaderUniforms }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;\nuniform float windStrength;')
      .replace(
        '#include <begin_vertex>',
        // C2: per-instance phase read straight from instanceMatrix's own
        // translation column (always available under USE_INSTANCING) —
        // needs no extra per-instance attribute. transformed.y is 0 at the
        // blade base and 1 at the tip (createGrassClumpGeometry), so
        // squaring it keeps the base planted and sways the tip the most,
        // the way a real blade bends from its root.
        '#include <begin_vertex>\n#ifdef USE_INSTANCING\n  float windPhase = dot(instanceMatrix[3].xz, vec2(0.15, 0.11));\n  transformed.x += sin(windTime * 1.7 + windPhase) * windStrength * transformed.y * transformed.y;\n#endif',
      )
  }
  return material
}

/** One low-poly instanced grass field; tier changes alter instance count, never draw calls. */
function VegetationBands() {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const tier = useQualityStore((state) => state.tier)
  const grassGeometry = useMemo(createGrassClumpGeometry, [])
  const grassMaterial = useMemo(createGrassMaterial, [])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (mesh) mesh.visible = tier !== 'low' && useScrollStore.getState().progress < GRASS_VISIBLE_END
    // C2: wind sway, bypassed under prefers-reduced-motion by zeroing the
    // amplitude rather than freezing windTime — same "keep the value alive,
    // stop it from ever being visible" shape the codebase already uses for
    // taxi jitter and dust drift (ExteriorAsset.tsx, DustParticles above).
    const shader = (grassMaterial.userData.shader as { uniforms: GrassShaderUniforms } | undefined)?.uniforms
    if (shader) {
      shader.windTime.value = clock.elapsedTime
      shader.windStrength.value = reducedMotionState.active ? 0 : 0.16
    }
  })

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const instances = buildVegetationInstances()
    const dummy = new Object3D()
    const coolGreen = new Color('#52664c')
    const sunlitGreen = new Color('#96a269')
    const instanceColor = new Color()

    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    instances.forEach((instance, index) => {
      dummy.position.set(instance.x, RUNWAY_SURFACE_Y, instance.z)
      dummy.rotation.set(0, instance.rotationY, 0)
      dummy.scale.set(instance.scaleXZ, instance.scaleY, instance.scaleXZ)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
      mesh.setColorAt(index, instanceColor.copy(coolGreen).lerp(sunlitGreen, instance.colorT))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [])

  return (
    <instancedMesh
      ref={meshRef}
      name="Airport · Instanced grass bands"
      args={[grassGeometry, grassMaterial, VEGETATION_MAX]}
      count={VEGETATION_COUNT[tier]}
      receiveShadow
    />
  )
}

const HANGARS = [
  { position: [-105, 6, -35] as const, size: [38, 12, 30] as const, color: '#596168' },
  { position: [-101, 5, 4] as const, size: [30, 10, 24] as const, color: '#697078' },
  { position: [-24, 7, -102] as const, size: [44, 14, 34] as const, color: '#515a62' },
] as const

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

/** Recognisable hangars, repositioned into the S1 hero frustum. Tier-gated —
 * the control tower below is a separate, always-visible group (D2). */
function DistantAirport() {
  const wallsRef = useRef<InstancedMeshImpl>(null)
  const roofsRef = useRef<InstancedMeshImpl>(null)
  const roofGeometry = useMemo(createGableRoofGeometry, [])
  // instanceColorAttribute.ts: setColorAt-driven tint needs a real, neutral
  // geometry color attribute or three.js's USE_COLOR path reads an unbound
  // attribute (silently zero) and kills it before instanceColor multiplies in.
  const wallGeometry = useMemo(() => ensureNeutralColorAttribute(new BoxGeometry(1, 1, 1)), [])
  const facadeMap = useMemo(createHangarFacadeMap, [])
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
        <mesh name="Airport · Apron" rotation={[-Math.PI / 2, 0, 0]} position={[-58, 0.012, -45]} receiveShadow>
          <planeGeometry args={[162, 112]} />
          <meshStandardMaterial color="#454b4c" roughness={0.98} />
        </mesh>
      )}
      {/* D1: doors/windows/cladding, painted identically on every face of the
          stock box (see hangarSurfaceMap.ts's comment on why) — still one
          instanced draw call, still per-hangar vertex-color tinted. */}
      <instancedMesh ref={wallsRef} name="Airport · Hangar walls" args={[wallGeometry, undefined, HANGARS.length]} receiveShadow>
        <meshStandardMaterial map={facadeMap} color="#606970" roughness={0.82} vertexColors />
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
    </group>
  )
}

const TOWER_POSITION: readonly [number, number, number] = [-82, 0, -18]
const TOWER_BEACON_POSITION: readonly [number, number, number] = [0, 31.45, 0]

/**
 * D2: the tower is its own always-visible group (unlike the tier-gated
 * hangars above) — the whole point of consolidating it to 1-2 draw calls
 * was to afford showing it on Mobile Low, which used to hide it entirely
 * along with everything else in "Terminal silhouettes" (plan3.md §3.1's own
 * budget table lists this as a deliberate +1 line for that tier).
 */
function ControlTower() {
  const bodyGeometry = useMemo(createControlTowerBodyGeometry, [])
  const beaconRef = useRef<import('three').Mesh>(null)
  const tier = useQualityStore((state) => state.tier)

  useFrame(({ clock }) => {
    const beacon = beaconRef.current
    if (!beacon) return
    const material = beacon.material as import('three').MeshBasicMaterial
    // A slow, steady rotating-beacon flash rather than a static glow — the
    // one thing §1.4's audit flagged this light for ("no parpadea").
    material.opacity = reducedMotionState.active ? 0.75 : 0.35 + 0.65 * Math.max(0, Math.sin(clock.elapsedTime * 2.4))
  })

  return (
    <group name="Airport · Control tower" position={TOWER_POSITION}>
      {/* No castShadow: bug #7 established no exterior light ever casts one
          (see EnvironmentPlaceholder.tsx's EXTERIOR_LIGHTS), and this
          project already treats that flag as dead weight worth not
          reintroducing. receiveShadow kept for consistency with every
          sibling mesh in this file, which still carries it. */}
      <mesh name="Control tower · Body" geometry={bodyGeometry} receiveShadow>
        <meshStandardMaterial roughness={0.5} vertexColors />
      </mesh>
      {/* Kept as its own draw call (5 -> 2, not 5 -> 1): MeshBasicMaterial's
          toneMapped=false is what lets the beacon read as a genuine light
          source at every exposure level instead of a merely bright-colored
          surface — folding it into the body's lit, tone-mapped material
          would lose exactly that property. Documented tradeoff per D2's own
          verification column. */}
      {tier !== 'low' && (
        <mesh ref={beaconRef} name="Control tower · Beacon" position={TOWER_BEACON_POSITION}>
          <sphereGeometry args={[0.32, 8, 6]} />
          <meshBasicMaterial color="#ff5a3c" toneMapped={false} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  )
}

// D4: edge lights every ~24 units down both sides of the runway, stopping
// short of the very ends (EDGE_MARGIN) the way real runway edge lighting
// does. PAPI is a 4-light bar just outside the western threshold — 2
// red/2 white is the "on glidepath" signature; this scene doesn't simulate
// a real glide angle, so the pattern is fixed rather than computed.
const EDGE_LIGHT_SPACING = 24
const EDGE_LIGHT_MARGIN = 6
const EDGE_LIGHT_HALF_LENGTH = RUNWAY_LENGTH / 2 - EDGE_LIGHT_MARGIN
const PAPI_Z = -240
const PAPI_X_START = 19
const PAPI_X_STEP = 2.4

interface RunwayLightPosition {
  x: number
  z: number
}

function buildEdgeLightPositions(): RunwayLightPosition[] {
  const instances: RunwayLightPosition[] = []
  for (let z = -EDGE_LIGHT_HALF_LENGTH; z <= EDGE_LIGHT_HALF_LENGTH; z += EDGE_LIGHT_SPACING) {
    instances.push({ x: -(RUNWAY_WIDTH / 2 + 0.6), z })
    instances.push({ x: RUNWAY_WIDTH / 2 + 0.6, z })
  }
  return instances
}

function buildPapiPositions(startIndex: number, count: number): RunwayLightPosition[] {
  return Array.from({ length: count }, (_, offset) => ({ x: PAPI_X_START + (startIndex + offset) * PAPI_X_STEP, z: PAPI_Z }))
}

// D4: emissive glow is a uniform material property (not a per-vertex
// attribute), so red vs white here is two small InstancedMeshes with their
// own fixed emissive color rather than one mesh with vertexColors — vertex
// colors only ever multiply *diffuse* albedo (three.js's color_fragment
// chunk), never emissive, so a single vertexColors mesh could not have made
// the PAPI bar read red in the first place. Also sidesteps
// instanceColorAttribute.ts's trap entirely for this component.
function createRunwayLightMaterial(color: string) {
  return new MeshStandardMaterial({ emissive: color, emissiveIntensity: 1, toneMapped: true })
}

function useRunwayLightInstancing(positions: RunwayLightPosition[]) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const dummy = new Object3D()
    positions.forEach((position, index) => {
      dummy.position.set(position.x, RUNWAY_SURFACE_Y + 0.15, position.z)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    })
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [positions])
  return meshRef
}

/** D4: edge lights + PAPI, two draw calls (white / red) — coherent with the
 * hour of day via a shared brightness curve applied to both materials. */
function RunwayLights() {
  const whiteMaterial = useMemo(() => createRunwayLightMaterial('#fff2d8'), [])
  const redMaterial = useMemo(() => createRunwayLightMaterial('#ff3b30'), [])
  const whitePositions = useMemo(() => [...buildEdgeLightPositions(), ...buildPapiPositions(2, 2)], [])
  const redPositions = useMemo(() => buildPapiPositions(0, 2), [])
  const whiteRef = useRunwayLightInstancing(whitePositions)
  const redRef = useRunwayLightInstancing(redPositions)

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    // Coherent with the hour of day: a modest daytime glow, brightening
    // toward S6's dusk using the same duskColorMix curve the sun/fog
    // already ramp on, so lights, sky and key light all warm up together.
    const intensity = 0.55 + duskColorMix(progress) * 2.1
    whiteMaterial.emissiveIntensity = intensity
    redMaterial.emissiveIntensity = intensity
  })

  return (
    <group name="Airport · Runway lighting">
      <instancedMesh ref={whiteRef} name="Airport · Runway lighting · White" args={[undefined, whiteMaterial, whitePositions.length]}>
        <sphereGeometry args={[0.28, 8, 6]} />
      </instancedMesh>
      <instancedMesh ref={redRef} name="Airport · Runway lighting · PAPI red" args={[undefined, redMaterial, redPositions.length]}>
        <sphereGeometry args={[0.28, 8, 6]} />
      </instancedMesh>
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
        // F1: two smaller puffs breaking up what used to be a too-smooth
        // 4-ellipse silhouette — still one draw call, still analytic.
        float puffA = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(-0.34, -0.04), vec2(0.14, 0.13)));
        float puffB = 1.0 - smoothstep(0.78, 1.0, ellipseDistance(p, vec2(0.36, -0.02), vec2(0.13, 0.12)));
        float body = max(base, max(leftLobe, max(crown, max(rightLobe, max(puffA, puffB)))));
        float detail = 0.92 + 0.08 * sin(vUv.x * 19.0) * sin(vUv.y * 13.0);
        float coverage = body * detail;
        float alpha = coverage * opacity;
        if (alpha < 0.002) discard;

        // F1: "form and light of their own" instead of flat color — the
        // billboard's own top (vUv.y towards 1) reads as sun-catching, its
        // base as shadowed, and the silhouette's own edge (where coverage
        // falls off fastest, not the fully-transparent exterior already
        // discarded above) gets a thin warm rim brighten. Camera-facing
        // billboards don't have a stable world-space normal to light
        // properly, so vUv.y stands in as "up" — true whenever the camera
        // isn't rolled, which this project's own camera path never does.
        float topLight = 0.72 + 0.42 * clamp(vUv.y, 0.0, 1.0);
        float edge = (1.0 - smoothstep(0.0, 0.22, coverage)) * step(0.05, coverage);
        vec3 shaded = cloudColor * topLight + vec3(1.0, 0.96, 0.9) * edge * 0.35;

        gl_FragColor = vec4(shaded, alpha);
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

// F2 (plan3.md §1.5: "En S1 y S2 el cielo está completamente vacío"):
// present from the very start, fading out across the S2/S3 boundary in the
// same window golden-hour's own HDRI weight does (hdriTheme.ts's
// GOLDEN_TO_HIGH_ALT +/- FADE_HALF = 0.28 +/- 0.02) — the sky and its
// clouds hand off to S3's thinner high-altitude deck together.
//
// Positioned deliberately, not reused from HIGH_ALTITUDE_CLOUDS: S1/S2's
// camera (cameraPath.ts, [59,8,53] panning to [100,70,-50], forward
// elevation -1deg sweeping to -19deg) is a much narrower, lower window than
// S3's wide orbit, and a first attempt copying that layer's broad spread
// placed every cloud outside it (verified with an actual capture — an
// empty sky at both 0.01 and 0.15). These sit inside both endpoints' FOV
// instead (checked against camera forward/elevation at each, then confirmed
// with sampleCamera()'s own NDC projection so the check isn't hand-trig
// again — every cloud lands inside [-1,1] at both 0.01 and 0.15).
//
// Repositioning alone still rendered an empty sky, though: a temporary
// full-opacity/magenta swap on this layer proved the instances *were* in
// the right place, so the real cause was CLOUD_LAYER_OPACITY's original
// 0.3 combined with a cream tone against a sky that's already nearly as
// pale — direct pixel sampling of the un-boosted render measured a ~1-2/255
// RGB difference between "under a cloud" and "clear sky" at the same
// screen height, i.e. imperceptible, not merely subtle. SUNSET_CLOUDS
// turned out to share the exact same two problems independently (S6's own
// F1/F4 evidence frame, 0.88) — same fix applied to both below rather than
// letting one layer stay invisible while the other got tuned.
const GOLDEN_HOUR_CLOUDS: readonly CloudSpec[] = [
  { position: [-70, 45, -60], scale: [130, 56], rotation: -0.14 },
  { position: [-40, 60, -110], scale: [124, 54], rotation: 0.1 },
  { position: [-110, 38, -20], scale: [116, 50], rotation: 0.07 },
  { position: [10, 55, -140], scale: [128, 56], rotation: -0.09 },
  { position: [-140, 50, -90], scale: [138, 60], rotation: 0.16 },
]

// Deliberately deeper/more saturated than a photo-real cloud would be in
// isolation — against this scene's own near-desaturated pale sky (measured
// ~#f0f4f5 at S6's evidence frame, nowhere near SECTION_ENVIRONMENT's raw
// '#27344e' background swatch once exposure/ACES have run) a true
// photo-real tone reproduces the same invisibility this was meant to fix.
// Pixel-sampled the un-boosted render directly rather than guessing: a
// cloud-covered pixel measured ~1-2/255 away from clear sky at the same
// screen height, both at S1 (0.3-opacity cream) and S3 (0.3-opacity pale
// blue) — not a per-layer fluke, so all three layers get the same
// treatment rather than leaving one on a formula already shown not to
// read. Each stays inside its section's own hue family (warm golden/dusk
// per PLAN.md §10.1, cool pale blue for S3's thinner high-altitude deck) —
// pulled down in value only, so the shader's own topLight/edge shaping
// (createSoftCloudMaterial above) has real contrast to work with instead
// of white-on-white or pale-blue-on-pale-blue.
const GOLDEN_HOUR_CLOUD_COLOR = '#f0b57e'
const HIGH_ALTITUDE_CLOUD_COLOR = '#a9c6de'
const SUNSET_CLOUD_COLOR = '#e8935f'
const CLOUD_LAYER_OPACITY = 0.62

const highAltitudeCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.24, 0.31, progress), 1 - smoothstep(0.39, 0.49, progress))

const sunsetCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.805, 0.85, progress), 1 - smoothstep(0.95, 1, progress))

const goldenHourCloudVisibility = (progress: number) => 1 - smoothstep(0.26, 0.3, progress)

/**
 * E1 (plan3.md bug found in §1.8): this whole group used to disappear at
 * `progress < 0.305` in one shot, which is the reason nothing below the
 * horizon survived into S3-S7 even though the camera spends all of that
 * time looking down at it (§1.8's pitch table). Per-subsystem visibility
 * instead: the runway, ground plan and hangars/tower are real, in-budget
 * geometry the camera can legitimately see from altitude (§1.8 measured
 * 5.3 px/unit at 36%, plenty of resolution), so they stay mounted for the
 * whole page. AircraftGroundShadow and DustParticles already fade
 * themselves out on their own schedule (`runwayPresence` / `DUST_SECTION_END`,
 * both tied to `SECTIONS[1].end`) and don't need a second gate here.
 * VegetationBands keeps the one cutoff that's actually earned by scale —
 * see GRASS_VISIBLE_END above.
 */
function AirportEnvironment() {
  return (
    <group name="Environment · Airport">
      <Runway />
      <AircraftGroundShadow />
      <VegetationBands />
      <DistantAirport />
      <ControlTower />
      <RunwayLights />
      <DustParticles />
      <Forest />
    </group>
  )
}

export function RunwayEnvironment() {
  return (
    <group name="Environment · Airport and clouds">
      <AirportEnvironment />
      <CloudLayer
        name="Environment · S1-S2 golden-hour clouds"
        color={GOLDEN_HOUR_CLOUD_COLOR}
        clouds={GOLDEN_HOUR_CLOUDS}
        opacity={CLOUD_LAYER_OPACITY}
        visibility={goldenHourCloudVisibility}
      />
      <CloudLayer
        name="Environment · S3 high-altitude clouds"
        color={HIGH_ALTITUDE_CLOUD_COLOR}
        clouds={HIGH_ALTITUDE_CLOUDS}
        opacity={CLOUD_LAYER_OPACITY}
        visibility={highAltitudeCloudVisibility}
      />
      <CloudLayer
        name="Environment · S6 sunset clouds"
        color={SUNSET_CLOUD_COLOR}
        clouds={SUNSET_CLOUDS}
        opacity={CLOUD_LAYER_OPACITY}
        visibility={sunsetCloudVisibility}
      />
    </group>
  )
}
