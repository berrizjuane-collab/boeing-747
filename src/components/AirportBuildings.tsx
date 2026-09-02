import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  Color,
  CylinderGeometry,
  InstancedMesh as InstancedMeshImpl,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  StaticDrawUsage,
  Vector2,
} from 'three'
import {
  airfieldLights,
  APRON,
  CONTROL_TOWER_HEIGHT,
  CONTROL_TOWER_POSITION,
  CONTROL_TOWER_ROOF_RADIUS,
  createAirportMarkingsGeometry,
  FLOODLIGHT_MASTS,
  FUEL_FARM,
  HANGARS,
  JET_BRIDGE_Z,
  TAXIWAY,
  TAXIWAY_LINKS,
  TERMINAL,
  WINDSOCK_POSITION,
} from '../lib/airportLayout'
import { createConcreteSurfaceMaps, createGlazingMaps, createRibbedPanelMaps } from '../lib/airportSurfaceMaps'
import { RUNWAY_WIDTH } from '../lib/runwayGeometry'
import { useQualityStore } from '../state/qualityStore'
import { reducedMotionState } from '../state/reducedMotion'

/**
 * Round 5 (plan3.md Fase D, brought forward): the built aerodrome behind
 * the hero — parallel taxiway with links and painted centrelines, concrete
 * apron with stand markings, a glass-fronted terminal with jet bridges and
 * a lit roof band, three barrel-roofed hangars with ribbed doors, a
 * detailed control tower (tapered shaft, balcony, glazed cab, radar and a
 * breathing beacon), a fuel farm, floodlight masts, a windsock and the
 * airfield lighting (runway edge/threshold/centreline, taxiway edge) as one
 * instanced draw call. Every footprint comes from airportLayout.ts so the
 * vegetation keep-out (aerodromeKeepOut.ts) never disagrees with what is on
 * screen. Roughly 30 draw calls at High, fewer on Low (details gated).
 */
type InstanceFill = (mesh: InstancedMeshImpl, dummy: Object3D) => number

/** Fills an InstancedMesh once on mount; `fill` returns the instance count it wrote. */
function useInstances(fill: InstanceFill) {
  const ref = useRef<InstancedMeshImpl>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    mesh.count = fill(mesh, dummy)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [fill])
  return ref
}

function place(dummy: Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0) {
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, rotY, 0)
  dummy.scale.set(sx, sy, sz)
  dummy.updateMatrix()
}

function ApronAndTaxiways() {
  const concrete = useMemo(() => createConcreteSurfaceMaps(256, 4), [])
  const markings = useMemo(createAirportMarkingsGeometry, [])
  const apronMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#c9c7c0', roughness: 1, metalness: 0 })
    material.map = concrete.albedo
    material.normalMap = concrete.normal
    material.normalScale = new Vector2(0.5, 0.5)
    material.roughnessMap = concrete.roughness
    for (const map of [concrete.albedo, concrete.normal, concrete.roughness]) {
      map.wrapS = RepeatWrapping
      map.wrapT = RepeatWrapping
      map.repeat.set(APRON.size[0] / 32, APRON.size[1] / 32)
    }
    return material
  }, [concrete])
  const taxiMaterial = useMemo(() => new MeshStandardMaterial({ color: '#4b5054', roughness: 0.96, metalness: 0.02 }), [])
  useEffect(
    () => () => {
      concrete.albedo.dispose()
      concrete.normal.dispose()
      concrete.roughness.dispose()
      apronMaterial.dispose()
      taxiMaterial.dispose()
    },
    [concrete, apronMaterial, taxiMaterial],
  )

  const linkRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        TAXIWAY_LINKS.forEach((link, index) => {
          const from = TAXIWAY.x + TAXIWAY.width / 2 - 1
          const to = -RUNWAY_WIDTH / 2 + 1
          place(dummy, (from + to) / 2, TAXIWAY.surfaceY, link.z, Math.abs(to - from), 1, link.width)
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return TAXIWAY_LINKS.length
      },
      [],
    ),
  )

  return (
    <group name="Airport · Apron and taxiways">
      <mesh name="Airport · Apron" rotation={[-Math.PI / 2, 0, 0]} position={APRON.position} material={apronMaterial} receiveShadow>
        <planeGeometry args={APRON.size} />
      </mesh>
      <mesh name="Airport · Parallel taxiway" position={[TAXIWAY.x, TAXIWAY.surfaceY - 0.05, 0]} material={taxiMaterial} receiveShadow>
        <boxGeometry args={[TAXIWAY.width, 0.1, TAXIWAY.length]} />
      </mesh>
      <instancedMesh ref={linkRef} name="Airport · Taxiway links" args={[undefined, taxiMaterial, TAXIWAY_LINKS.length]} receiveShadow>
        <boxGeometry args={[1, 0.1, 1]} />
      </instancedMesh>
      <mesh name="Airport · Taxiway and apron markings" geometry={markings} receiveShadow>
        <meshStandardMaterial color="#e2c23a" roughness={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
    </group>
  )
}

const GLASS_PROPS = { metalness: 0.55, roughness: 0.18 } as const

function Terminal() {
  const [width, height, depth] = TERMINAL.size
  const [x, , z] = TERMINAL.position
  const glazing = useMemo(() => createGlazingMaps(256, 6, 2, 0.4), [])
  const glassMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#ffffff', ...GLASS_PROPS, emissive: '#ffffff', emissiveIntensity: 0.9 })
    material.map = glazing.albedo
    material.emissiveMap = glazing.emissive
    for (const map of [glazing.albedo, glazing.emissive]) map.repeat.set(depth / 12, 1)
    return material
  }, [glazing, depth])
  useEffect(
    () => () => {
      glazing.albedo.dispose()
      glazing.emissive.dispose()
      glassMaterial.dispose()
    },
    [glazing, glassMaterial],
  )
  const eastFace = x + width / 2

  const columnRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        let count = 0
        for (let cz = z - depth / 2 + 4; cz <= z + depth / 2 - 4; cz += 8) {
          place(dummy, eastFace + 3.2, height * 0.45, cz, 1, height * 0.9, 1)
          mesh.setMatrixAt(count, dummy.matrix)
          count += 1
        }
        return count
      },
      [z, depth, eastFace, height],
    ),
  )

  const bridgeRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        JET_BRIDGE_Z.forEach((bz, index) => {
          place(dummy, eastFace + 14, 6.2, bz, 24, 3, 3.2, 0)
          dummy.rotation.z = -0.06
          dummy.updateMatrix()
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return JET_BRIDGE_Z.length
      },
      [eastFace],
    ),
  )

  const legRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        let count = 0
        for (const bz of JET_BRIDGE_Z) {
          for (const dz of [-0.9, 0.9]) {
            place(dummy, eastFace + 22, 2.3, bz + dz, 0.5, 4.6, 0.5)
            mesh.setMatrixAt(count, dummy.matrix)
            count += 1
          }
        }
        return count
      },
      [eastFace],
    ),
  )

  const rotundaRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        JET_BRIDGE_Z.forEach((bz, index) => {
          place(dummy, eastFace + 2.6, 6.4, bz, 2.6, 4.4, 2.6)
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return JET_BRIDGE_Z.length
      },
      [eastFace],
    ),
  )

  const unitRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        let count = 0
        for (let index = 0; index < 7; index += 1) {
          const uz = z - depth / 2 + 12 + index * 16
          place(dummy, x - 6 + (index % 2) * 10, height + 1.4, uz, 4 + (index % 3), 2.4, 3.4)
          mesh.setMatrixAt(count, dummy.matrix)
          count += 1
        }
        return count
      },
      [x, z, depth, height],
    ),
  )

  return (
    <group name="Airport · Terminal">
      <mesh name="Terminal · Plinth" position={[x, 0.7, z]} receiveShadow>
        <boxGeometry args={[width + 8, 1.4, depth + 6]} />
        <meshStandardMaterial color="#8d9094" roughness={0.9} />
      </mesh>
      <mesh name="Terminal · Body" position={[x - 2, height / 2 + 1, z]} castShadow receiveShadow>
        <boxGeometry args={[width - 4, height - 2, depth]} />
        <meshStandardMaterial color="#d8dadb" roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh name="Terminal · Curtain wall" position={[eastFace - 0.6, height / 2 + 1, z]} material={glassMaterial}>
        <boxGeometry args={[1.2, height - 3, depth - 2]} />
      </mesh>
      <mesh name="Terminal · Roof" position={[x, height + 0.5, z]} castShadow>
        <boxGeometry args={[width + 2, 1, depth + 2]} />
        <meshStandardMaterial color="#3d4347" roughness={0.75} metalness={0.1} />
      </mesh>
      <mesh name="Terminal · Canopy" position={[eastFace + 3, height - 0.2, z]} castShadow>
        <boxGeometry args={[8, 0.7, depth + 2]} />
        <meshStandardMaterial color="#c8ccd0" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh name="Terminal · Roof edge light band" position={[eastFace + 6.9, height - 0.2, z]}>
        <boxGeometry args={[0.25, 0.45, depth + 1]} />
        <meshBasicMaterial color="#ffd9a6" toneMapped={false} />
      </mesh>
      <instancedMesh ref={columnRef} name="Terminal · Canopy columns" args={[undefined, undefined, 20]} castShadow>
        <cylinderGeometry args={[0.45, 0.5, 1, 10]} />
        <meshStandardMaterial color="#b9bec2" roughness={0.6} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={rotundaRef} name="Terminal · Jet bridge rotundas" args={[undefined, undefined, JET_BRIDGE_Z.length]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial color="#c2c6c9" roughness={0.5} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={bridgeRef} name="Terminal · Jet bridges" args={[undefined, undefined, JET_BRIDGE_Z.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d4d7d9" roughness={0.45} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={legRef} name="Terminal · Jet bridge legs" args={[undefined, undefined, JET_BRIDGE_Z.length * 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#6b7175" roughness={0.6} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={unitRef} name="Terminal · Rooftop units" args={[undefined, undefined, 7]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#9a9ea1" roughness={0.7} metalness={0.2} />
      </instancedMesh>
    </group>
  )
}

function createBarrelRoofGeometry() {
  // Half-cylinder lying along Z: unit radius, unit length, open ends.
  const geometry = new CylinderGeometry(1, 1, 1, 18, 1, true, 0, Math.PI)
  geometry.rotateX(Math.PI / 2)
  geometry.rotateY(Math.PI / 2)
  return geometry
}

function Hangars() {
  const roofGeometry = useMemo(createBarrelRoofGeometry, [])
  const ribbed = useMemo(() => createRibbedPanelMaps(128, 10), [])
  const doorMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.35, vertexColors: true })
    material.map = ribbed.albedo
    material.normalMap = ribbed.normal
    material.normalScale = new Vector2(0.8, 0.8)
    ribbed.albedo.repeat.set(4, 1)
    ribbed.normal.repeat.set(4, 1)
    return material
  }, [ribbed])
  useEffect(
    () => () => {
      ribbed.albedo.dispose()
      ribbed.normal.dispose()
      doorMaterial.dispose()
    },
    [ribbed, doorMaterial],
  )

  const wallsRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        const color = new Color()
        HANGARS.forEach((hangar, index) => {
          const [w, h, d] = hangar.size
          place(dummy, hangar.position[0], h / 2, hangar.position[2], w, h, d)
          mesh.setMatrixAt(index, dummy.matrix)
          mesh.setColorAt(index, color.set(hangar.color))
        })
        return HANGARS.length
      },
      [],
    ),
  )

  const roofsRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        HANGARS.forEach((hangar, index) => {
          const [w, h, d] = hangar.size
          place(dummy, hangar.position[0], h, hangar.position[2], w / 2, h * 0.42, d + 1)
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return HANGARS.length
      },
      [],
    ),
  )

  const doorsRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        const color = new Color()
        HANGARS.forEach((hangar, index) => {
          const [w, h, d] = hangar.size
          // Doors face the runway (south, +z).
          place(dummy, hangar.position[0], h * 0.42, hangar.position[2] + d / 2 + 0.2, w * 0.82, h * 0.8, 0.4)
          mesh.setMatrixAt(index, dummy.matrix)
          mesh.setColorAt(index, color.set(hangar.doorColor))
        })
        return HANGARS.length
      },
      [],
    ),
  )

  const stripRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        HANGARS.forEach((hangar, index) => {
          const [w, h, d] = hangar.size
          place(dummy, hangar.position[0], h * 0.9, hangar.position[2] + d / 2 + 0.25, w * 0.86, 1.1, 0.2)
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return HANGARS.length
      },
      [],
    ),
  )

  return (
    <group name="Airport · Hangars">
      <instancedMesh ref={wallsRef} name="Hangar · Walls" args={[undefined, undefined, HANGARS.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.78} metalness={0.08} vertexColors />
      </instancedMesh>
      <instancedMesh ref={roofsRef} name="Hangar · Barrel roofs" args={[roofGeometry, undefined, HANGARS.length]} castShadow>
        <meshStandardMaterial color="#6e767c" roughness={0.5} metalness={0.35} side={2} />
      </instancedMesh>
      <instancedMesh ref={doorsRef} name="Hangar · Ribbed doors" args={[undefined, doorMaterial, HANGARS.length]}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={stripRef} name="Hangar · Clerestory strips" args={[undefined, undefined, HANGARS.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5c7f96" emissive="#3d5c72" emissiveIntensity={0.7} roughness={0.25} metalness={0.4} />
      </instancedMesh>
    </group>
  )
}

function ControlTower() {
  const [x, , z] = CONTROL_TOWER_POSITION
  const glazing = useMemo(() => createGlazingMaps(128, 10, 1, 0.6), [])
  const cabMaterial = useMemo(() => {
    const material = new MeshStandardMaterial({ color: '#ffffff', ...GLASS_PROPS, emissive: '#ffffff', emissiveIntensity: 0.8 })
    material.map = glazing.albedo
    material.emissiveMap = glazing.emissive
    for (const map of [glazing.albedo, glazing.emissive]) map.repeat.set(2, 1)
    return material
  }, [glazing])
  const beaconMaterial = useMemo(() => new MeshBasicMaterial({ color: '#ff4a3a', toneMapped: false }), [])
  useEffect(
    () => () => {
      glazing.albedo.dispose()
      glazing.emissive.dispose()
      cabMaterial.dispose()
      beaconMaterial.dispose()
    },
    [glazing, cabMaterial, beaconMaterial],
  )
  const beaconColor = useMemo(() => new Color('#ff4a3a'), [])
  useFrame(({ clock }) => {
    // A slow breathing rotation beacon, steady under prefers-reduced-motion.
    const pulse = reducedMotionState.active ? 1 : 0.55 + 0.45 * Math.max(0, Math.sin(clock.elapsedTime * 2.6))
    beaconMaterial.color.copy(beaconColor).multiplyScalar(0.4 + pulse * 1.6)
  })

  const shaftHeight = CONTROL_TOWER_HEIGHT - 9
  const cabBase = shaftHeight + 2.4

  return (
    <group name="Airport · Control tower" position={[x, 0, z]}>
      <mesh name="Control tower · Base block" position={[0, 2.6, 0]} castShadow receiveShadow>
        <boxGeometry args={[16, 5.2, 13]} />
        <meshStandardMaterial color="#9ca1a5" roughness={0.8} />
      </mesh>
      <mesh name="Control tower · Base glazing" position={[0, 2.8, 6.6]}>
        <boxGeometry args={[13, 2.2, 0.3]} />
        <meshStandardMaterial color="#6f8ea3" emissive="#3a5468" emissiveIntensity={0.6} roughness={0.2} metalness={0.5} />
      </mesh>
      <mesh name="Control tower · Shaft" position={[0, shaftHeight / 2 + 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.1, 4.4, shaftHeight, 18]} />
        <meshStandardMaterial color="#c4c8cb" roughness={0.72} />
      </mesh>
      <mesh name="Control tower · Shaft stripe" position={[0, shaftHeight * 0.55, 0]}>
        <cylinderGeometry args={[3.72, 3.9, 2.2, 18, 1, true]} />
        <meshStandardMaterial color="#c8502f" roughness={0.6} side={2} />
      </mesh>
      <mesh name="Control tower · Balcony" position={[0, shaftHeight + 1.2, 0]} castShadow>
        <cylinderGeometry args={[5.9, 5.2, 0.9, 18]} />
        <meshStandardMaterial color="#5a6165" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh name="Control tower · Cab floor rim" position={[0, cabBase - 0.3, 0]} castShadow>
        <cylinderGeometry args={[CONTROL_TOWER_ROOF_RADIUS, 6.4, 0.7, 12]} />
        <meshStandardMaterial color="#3f464b" roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh name="Control tower · Cab glazing" position={[0, cabBase + 2.3, 0]} material={cabMaterial}>
        <cylinderGeometry args={[6.6, 6.1, 4.6, 12, 1, true]} />
      </mesh>
      <mesh name="Control tower · Cab core" position={[0, cabBase + 2.3, 0]}>
        <cylinderGeometry args={[5.4, 5.0, 4.4, 12]} />
        <meshStandardMaterial color="#1a2229" roughness={0.9} />
      </mesh>
      <mesh name="Control tower · Roof" position={[0, cabBase + 4.9, 0]} castShadow>
        <cylinderGeometry args={[6.2, 6.9, 0.9, 12]} />
        <meshStandardMaterial color="#454c51" roughness={0.65} metalness={0.2} />
      </mesh>
      <mesh name="Control tower · Radar dome" position={[0, cabBase + 6.7, 0]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshStandardMaterial color="#e8eaec" roughness={0.45} />
      </mesh>
      <mesh name="Control tower · Antenna mast" position={[0, cabBase + 9.2, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 5.6, 6]} />
        <meshStandardMaterial color="#7c8388" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh name="Control tower · Beacon" position={[0, cabBase + 12.3, 0]} material={beaconMaterial}>
        <sphereGeometry args={[0.45, 10, 8]} />
      </mesh>
    </group>
  )
}

function AirfieldLights() {
  const lights = useMemo(airfieldLights, [])
  const ref = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        const color = new Color()
        lights.forEach((light, index) => {
          place(dummy, light.x, 0.32, light.z, 1, 1, 1)
          mesh.setMatrixAt(index, dummy.matrix)
          mesh.setColorAt(index, color.set(light.color))
        })
        return lights.length
      },
      [lights],
    ),
  )
  return (
    <instancedMesh ref={ref} name="Airport · Airfield lights" args={[undefined, undefined, lights.length]}>
      <boxGeometry args={[0.55, 0.4, 0.55]} />
      <meshBasicMaterial color="#ffffff" vertexColors toneMapped={false} />
    </instancedMesh>
  )
}

function FloodlightMasts() {
  const mastRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        FLOODLIGHT_MASTS.forEach(([mx, mz], index) => {
          place(dummy, mx, 14, mz, 1, 28, 1)
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return FLOODLIGHT_MASTS.length
      },
      [],
    ),
  )
  const headRef = useInstances(
    useMemo(
      () => (mesh: InstancedMeshImpl, dummy: Object3D) => {
        FLOODLIGHT_MASTS.forEach(([mx, mz], index) => {
          place(dummy, mx, 27.2, mz, 1, 1, 1, Math.atan2(APRON.position[0] - mx, APRON.position[2] - mz))
          mesh.setMatrixAt(index, dummy.matrix)
        })
        return FLOODLIGHT_MASTS.length
      },
      [],
    ),
  )
  return (
    <group name="Airport · Floodlight masts">
      <instancedMesh ref={mastRef} name="Floodlight · Masts" args={[undefined, undefined, FLOODLIGHT_MASTS.length]} castShadow>
        <cylinderGeometry args={[0.28, 0.5, 1, 8]} />
        <meshStandardMaterial color="#8f969b" roughness={0.6} metalness={0.5} />
      </instancedMesh>
      <instancedMesh ref={headRef} name="Floodlight · Heads" args={[undefined, undefined, FLOODLIGHT_MASTS.length]}>
        <boxGeometry args={[3.2, 0.9, 0.7]} />
        <meshBasicMaterial color="#fff1d0" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function FuelFarmAndWindsock() {
  const [fx, , fz] = FUEL_FARM.position
  const sockRef = useRef<import('three').Mesh>(null)
  useFrame(({ clock }) => {
    const sock = sockRef.current
    if (!sock) return
    const t = reducedMotionState.active ? 0 : clock.elapsedTime
    sock.rotation.z = -0.62 + Math.sin(t * 1.3) * 0.12
    sock.rotation.y = 0.9 + Math.sin(t * 0.7) * 0.25
  })
  return (
    <group name="Airport · Fuel farm and windsock">
      {Array.from({ length: FUEL_FARM.count }, (_, index) => (
        <group key={index} position={[fx + (index - (FUEL_FARM.count - 1) / 2) * FUEL_FARM.tankRadius * 2.6, 0, fz]}>
          <mesh name="Fuel farm · Tank" position={[0, FUEL_FARM.tankHeight / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[FUEL_FARM.tankRadius, FUEL_FARM.tankRadius, FUEL_FARM.tankHeight, 20]} />
            <meshStandardMaterial color="#e6e8e9" roughness={0.45} metalness={0.3} />
          </mesh>
          <mesh name="Fuel farm · Tank band" position={[0, FUEL_FARM.tankHeight * 0.55, 0]}>
            <cylinderGeometry args={[FUEL_FARM.tankRadius + 0.08, FUEL_FARM.tankRadius + 0.08, 0.8, 20, 1, true]} />
            <meshStandardMaterial color="#c8502f" roughness={0.6} side={2} />
          </mesh>
        </group>
      ))}
      <mesh name="Fuel farm · Bund wall" position={[fx, 0.6, fz]} receiveShadow>
        <boxGeometry args={[FUEL_FARM.tankRadius * 6, 1.2, FUEL_FARM.tankRadius * 3]} />
        <meshStandardMaterial color="#9da2a6" roughness={0.85} />
      </mesh>
      <group position={WINDSOCK_POSITION}>
        <mesh name="Windsock · Pole" position={[0, 4, 0]}>
          <cylinderGeometry args={[0.08, 0.12, 8, 6]} />
          <meshStandardMaterial color="#d9dcdf" roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh ref={sockRef} name="Windsock · Sock" position={[0, 7.9, 0]}>
          <coneGeometry args={[0.55, 3.2, 8, 1, true]} />
          <meshStandardMaterial color="#ff7a1f" roughness={0.7} side={2} />
        </mesh>
      </group>
    </group>
  )
}

export function AirportBuildings() {
  const tier = useQualityStore((state) => state.tier)
  const showDetails = tier !== 'low'
  return (
    <group name="Airport · Buildings">
      <ApronAndTaxiways />
      <Terminal />
      <Hangars />
      <ControlTower />
      <AirfieldLights />
      {showDetails && <FloodlightMasts />}
      {showDetails && <FuelFarmAndWindsock />}
    </group>
  )
}
