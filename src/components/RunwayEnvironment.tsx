import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh as InstancedMeshImpl,
  MeshStandardMaterial,
  Object3D,
  Points as PointsImpl,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from 'three'
import { getAircraftPose } from '../lib/aircraftPose'
import { createRunwaySurfaceMaps } from '../lib/airportSurfaceMaps'
import { canopyMistColor } from '../lib/canopyMist'
import { createRunwayMarkingsGeometry, RUNWAY_LENGTH, RUNWAY_SURFACE_Y, RUNWAY_WIDTH } from '../lib/runwayGeometry'
import { seededRandom } from '../lib/seededRandom'
import { SECTIONS } from '../lib/sections'
import { TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'
import { AirportBuildings } from './AirportBuildings'
import { Forest } from './Forest'
import { GrassField } from './GrassField'

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function Runway() {
  const markingsGeometry = useMemo(createRunwayMarkingsGeometry, [])
  // Round 5 (plan3.md D3): real asphalt — grain, seams, streaking and the
  // rubber deposits of both touchdown zones — instead of one flat colour.
  // Generated once (256×1024, ~0.26 M texels, well under the terrain
  // texture's own measured budget in progress4.md 04-04).
  const surface = useMemo(() => createRunwaySurfaceMaps(256, 1024), [])
  const asphaltMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0.02 })
    material.map = surface.albedo
    material.normalMap = surface.normal
    material.normalScale = new Vector2(0.45, 0.45)
    material.roughnessMap = surface.roughness
    return material
  }, [surface])
  useEffect(
    () => () => {
      surface.albedo.dispose()
      surface.normal.dispose()
      surface.roughness.dispose()
      asphaltMaterial.dispose()
    },
    [surface, asphaltMaterial],
  )

  return (
    <group name="Airport · Runway">
      <mesh name="Runway · Asphalt" position={[0, -0.045, 0]} material={asphaltMaterial} receiveShadow>
        <boxGeometry args={[RUNWAY_WIDTH, 0.13, RUNWAY_LENGTH]} />
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

    // Round 5: +0.06, not +0.003 — the shadow quad now drifts over the
    // parallel taxiway and its links (AirportBuildings.tsx, top surface at
    // y ≈ 0.064) as the aircraft climbs, and a plane below those surfaces
    // was clipped by them along a jagged intersection line. Every flat
    // aerodrome surface (runway 0.02, markings 0.029, apron 0.012, taxiway
    // 0.064) now sits under it.
    mesh.position.set(pose.position.x - altitude * 0.8, RUNWAY_SURFACE_Y + 0.06, pose.position.z - altitude * 0.4)
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

// plan4.md bug #16/§04-03: the aerodrome keep-out (aerodromeKeepOut.ts)
// and the round-4 tests import these four names from this module; they now
// live in airportLayout.ts with the rest of the ground plan and are
// re-exported here unchanged in meaning.
export { APRON, CONTROL_TOWER_POSITION, CONTROL_TOWER_ROOF_RADIUS, HANGARS } from '../lib/airportLayout'

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

function createSoftCloudMaterial(color: string, mist?: { value: Color }) {
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
        mistColor: mist ?? { value: new Color(color) },
      },
    ]),
    // Round 5: hero clouds (S1/S2) dissolve toward the shared canopy mist
    // (canopyMist.ts) like the terrain and forest under them, not toward
    // the darker scene fog colour — otherwise a distant cloud went brown.
    defines: mist ? { USE_MIST_COLOR: '' } : {},
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
      uniform vec3 mistColor;
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
        vec3 shaded = cloudColor * (0.86 + 0.14 * smoothstep(-0.3, 0.35, p.y));
        gl_FragColor = vec4(shaded, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_MIST_COLOR
          #ifdef USE_FOG
            float mistFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
            gl_FragColor.rgb = mix( gl_FragColor.rgb, mistColor, mistFactor );
          #endif
        #else
          #include <fog_fragment>
        #endif
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
  mist?: { value: Color }
}

/** Camera-facing cloud instances: one draw call per narrative cloud layer. */
function CloudLayer({ name, color, clouds, opacity, visibility, mist }: CloudLayerProps) {
  const meshRef = useRef<InstancedMeshImpl>(null)
  const material = useMemo(() => createSoftCloudMaterial(color, mist), [color, mist])
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

// Round 5 (plan3.md F2, brought forward now that the horizon band of
// plan4.md I1 exists to author against): S1/S2 used to have an empty sky.
// Specs are derived from the S1 camera (cameraPath.ts KEYFRAMES[0], at
// [60, 8, 55] looking toward [0, 6, 0] — view azimuth ≈ −137.5°) so every
// cloud lands in the upper third of the hero frame and holds through S2's
// rising tracking shot. With `fog: true` and the canopy mist target, the
// farther ones dissolve into the horizon haze instead of popping.
function heroCloudSpecs(): CloudSpec[] {
  const cameraX = 60
  const cameraZ = 55
  const specs: CloudSpec[] = []
  const layout: Array<[azimuthDeg: number, distance: number, altitude: number, width: number, height: number, roll: number]> = [
    [-182, 700, 185, 300, 96, 0.08],
    [-166, 560, 142, 240, 78, -0.1],
    [-152, 780, 214, 330, 104, 0.05],
    [-140, 620, 165, 260, 84, 0.14],
    [-128, 520, 124, 210, 70, -0.06],
    [-114, 690, 190, 290, 92, 0.1],
    [-98, 560, 138, 230, 74, -0.12],
    [-84, 760, 205, 320, 100, 0.04],
  ]
  for (const [azimuthDeg, distance, altitude, width, height, roll] of layout) {
    const azimuth = (azimuthDeg * Math.PI) / 180
    specs.push({
      position: [cameraX + Math.cos(azimuth) * distance, altitude, cameraZ + Math.sin(azimuth) * distance],
      scale: [width, height],
      rotation: roll,
    })
  }
  return specs
}

const HERO_CLOUDS: readonly CloudSpec[] = heroCloudSpecs()

const heroCloudVisibility = (progress: number) => 1 - smoothstep(0.255, 0.305, progress)

const highAltitudeCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.24, 0.31, progress), 1 - smoothstep(0.39, 0.49, progress))

const sunsetCloudVisibility = (progress: number) =>
  Math.min(smoothstep(0.805, 0.85, progress), 1 - smoothstep(0.95, 1, progress))

function HeroAirportEnvironment() {
  const groupRef = useRef<import('three').Group>(null)

  useFrame(() => {
    if (groupRef.current) groupRef.current.visible = useScrollStore.getState().progress < 0.305
  })

  return (
    <group ref={groupRef} name="Environment · Hero airport">
      <Runway />
      <AircraftGroundShadow />
      <GrassField />
      <Forest />
      <AirportBuildings />
      <DustParticles />
    </group>
  )
}

export function RunwayEnvironment() {
  return (
    <group name="Environment · Airport and clouds">
      <HeroAirportEnvironment />
      <CloudLayer
        name="Environment · S1/S2 hero clouds"
        color="#fff3e4"
        clouds={HERO_CLOUDS}
        opacity={0.58}
        visibility={heroCloudVisibility}
        mist={canopyMistColor}
      />
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
