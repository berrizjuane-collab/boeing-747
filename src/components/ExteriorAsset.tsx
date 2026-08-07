import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { Group, Mesh, type MeshStandardMaterial, Object3D } from 'three'
import { KTX2Loader, type GLTFLoader } from 'three-stdlib'
import { getAircraftPose } from '../lib/aircraftPose'
import { createDissolveHullMaterial, type DissolveUniforms } from '../lib/dissolveHullMaterial'
import { EXTERIOR_LOCAL_OFFSET } from '../lib/sceneLayout'
import { SECTIONS, localProgress } from '../lib/sections'
import { EXIT_PORTAL, NOSE_PORTAL, portalRadius } from '../lib/thresholdPortals'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

// import.meta.env.BASE_URL, not a bare '/': see vite.config.ts's `base` comment.
useGLTF.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

const TAXI_SECTION = SECTIONS[1]

// Gear stays down through taxi and the initial rotation off the runway, then
// retracts (rises + hides) across the back half of S2 (*local* progress —
// comparing these against raw global progress was the first-pass bug: S2 is
// only global [0.12,0.28], so gear stayed down all the way to global 0.5)
// so it's fully tucked away before S3 starts climbing — this scrollytelling
// never lands, so gear only ever needs to go up, once.
const GEAR_RETRACT_START = 0.5
const GEAR_RETRACT_END = 0.78
const GEAR_RETRACT_RISE = 3

/**
 * Real exterior asset (Fase 0 audit + Blender pipeline, reproduced this
 * session against the provided A380.blend source — see PROGRESS.md).
 * Replaces the Fase 2/3 box-and-wings AircraftPlaceholder now that real
 * geometry exists: a single "A380" fuselage/wing/tail mesh plus a
 * "LandingGear" group of 115 individually-modeled parts, both under one
 * shared textured material (no separate wheel material to key off — the
 * dissolve swap below targets the "A380" mesh object by name instead).
 *
 * Axis note: verified empirically against the actual processed GLB (see
 * EXTERIOR_LOCAL_OFFSET in sceneLayout.ts for the full derivation) — the
 * raw export has Y=length and Z=-height, and prepare_exterior.py's own
 * Exterior_Root(-90°X) is already part of that raw file, not something to
 * separately undo. A candidate +90°X wrapper here was checked against the
 * file's real node hierarchy with three.js's own Matrix4 composition
 * (translations DO carry through nested rotations in ways that aren't safe
 * to eyeball — first-pass hand algebra on this got the composition wrong),
 * confirming it lands the model exactly where the already-tuned camera path,
 * dissolve portals, and interior anchors expect it: nose at world
 * z=-115, main deck floor at world y=37, both at FLYING_POSE.
 */
export function ExteriorAsset() {
  const { gl } = useThree()
  // exterior.glb's albedo texture is now real KTX2/Basis (scripts/process-glb.mjs,
  // PROGRESS.md Fase 3) — GLTFLoader throws "setKTX2Loader must be called
  // before loading KTX2 textures" without this, it doesn't fail silently.
  // Self-hosted transcoder in public/basis/, same reasoning as /draco/ below:
  // no runtime CDN dependency.
  const extendLoader = useCallback(
    (loader: GLTFLoader) => {
      const ktx2Loader = new KTX2Loader().setTranscoderPath(`${import.meta.env.BASE_URL}basis/`).detectSupport(gl)
      loader.setKTX2Loader(ktx2Loader)
    },
    [gl],
  )
  const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/exterior.glb`, true, true, extendLoader)
  const groupRef = useRef<Group>(null)
  const dissolveRef = useRef<DissolveUniforms | null>(null)
  const gearRef = useRef<Object3D | null>(null)

  useEffect(() => {
    let gear: Object3D | null = null
    scene.traverse((obj) => {
      if (obj.name === 'A380' && (obj as Mesh).isMesh) {
        const mesh = obj as Mesh
        // Extends the mesh's own loaded MeshStandardMaterial (real
        // baseColorTexture + roughness/metalness from the glTF) instead of
        // replacing it with a from-scratch unlit shader — see
        // dissolveHullMaterial.ts's doc comment for why that distinction
        // matters (the earlier version made the fuselage flat gray outside
        // the dissolve band, i.e. for the entire site except a few seconds
        // of S4/S6).
        const { material, uniforms } = createDissolveHullMaterial(mesh.material as MeshStandardMaterial)
        mesh.material = material
        dissolveRef.current = uniforms
        mesh.castShadow = true
        mesh.receiveShadow = true
      } else if ((obj as Mesh).isMesh) {
        const mesh = obj as Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
      if (obj.name === 'LandingGear') gear = obj
    })
    gearRef.current = gear
  }, [scene])

  useFrame(({ clock }) => {
    const group = groupRef.current
    if (!group) return
    const { progress } = useScrollStore.getState()
    const { position, pitchRad } = getAircraftPose(progress)

    // Cosmetic taxi vibration: time-driven (not scroll-indexed), fades out
    // as progress nears the end of S2 to read as "gear unloading" — same
    // treatment the old placeholder used. This is the "vibración de cámara
    // en S2" PLAN.md §8.1 asks to remove under reduced motion — the plan's
    // own §3 attributes the shake to the aircraft's pose, not a separate
    // camera-side effect, and since the camera tracks alongside the
    // aircraft through S2 the two read as the same shake to the viewer.
    let jitter = 0
    if (!reducedMotionState.active && progress >= TAXI_SECTION.start && progress < TAXI_SECTION.end) {
      const fadeOut = 1 - (progress - TAXI_SECTION.start) / (TAXI_SECTION.end - TAXI_SECTION.start)
      jitter = Math.sin(clock.elapsedTime * 40) * 0.08 * fadeOut
    }

    group.position.set(position.x, position.y + jitter, position.z)
    group.rotation.x = pitchRad

    const dissolve = dissolveRef.current
    if (dissolve) {
      dissolve.portal1Radius.value = portalRadius(progress, NOSE_PORTAL)
      dissolve.portal2Radius.value = portalRadius(progress, EXIT_PORTAL)
    }

    const gear = gearRef.current
    if (gear) {
      const taxiLocal = localProgress(progress, TAXI_SECTION)
      const t = Math.min(1, Math.max(0, (taxiLocal - GEAR_RETRACT_START) / (GEAR_RETRACT_END - GEAR_RETRACT_START)))
      gear.position.y = t * GEAR_RETRACT_RISE
      gear.visible = t < 1
    }
  })

  return (
    <group ref={groupRef}>
      <group rotation={[Math.PI / 2, 0, 0]} position={EXTERIOR_LOCAL_OFFSET}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

// No useGLTF.preload() here: preloading runs at module scope, before any
// <Canvas> (and its WebGLRenderer) exists, and the KTX2Loader extendLoader
// above needs a live renderer for detectSupport(gl) — preloading without it
// would hit the exact "setKTX2Loader must be called" error this component
// works around. The Suspense boundary in SceneCanvas.tsx around
// <ExteriorAsset /> still covers the load; this only gives up the head start
// preload would have provided.
