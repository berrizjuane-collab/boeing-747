import { useAssetState } from '../state/assetState'
import { qaView, qaWireframe } from '../lib/qaConfig'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Matrix4, Mesh, Object3D, Vector3 } from 'three'
// three-stdlib's mergeBufferGeometries is broken: its per-geometry
// consistency checks live inside a `geometries.forEach` callback, so their
// `return null` on mismatch only skips that forEach iteration — it can't
// abort the outer function, which keeps going and hands back a
// silently-corrupted geometry instead of failing loud (hit this directly
// merging the 115 LandingGear parts below: a position array whose length
// wasn't a multiple of 3, NaN'ing the mesh with no error until
// computeBoundingSphere read past the buffer end). three/examples/jsm's
// mergeGeometries is the current, actively-maintained implementation
// shipped with this exact three.js version — used here instead.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { KTX2Loader, type GLTFLoader } from 'three-stdlib'
import { getAircraftPose } from '../lib/aircraftPose'
import { AircraftNavLights, type AircraftExtremes } from './AircraftNavLights'
import { createDissolveHullMaterial, type DissolveHullMaterial } from '../lib/dissolveHullMaterial'
import { EXTERIOR_LOCAL_OFFSET } from '../lib/sceneLayout'
import { SECTIONS, localProgress } from '../lib/sections'
import { EXIT_PORTAL, NOSE_PORTAL, nearPlaneCornerDistance, portalRadius } from '../lib/thresholdPortals'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

// import.meta.env.BASE_URL, not a bare '/': see vite.config.ts's `base` comment.
// GitHub Pages serves this repo as a project site under /boeing-747/, so an
// absolute path here 404s in production.
useGLTF.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

const TAXI_SECTION = SECTIONS[1]

// How far the gear travels into the bay. The retraction *schedule* lives in
// aircraftPose.ts with the rest of the takeoff, so the legs cannot start
// folding before the aircraft has left the ground; this file only turns the
// resulting extension into a transform.
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
  const { scene: source } = useGLTF(`${import.meta.env.BASE_URL}models/exterior.glb`, true, true, extendLoader)
  const scene = useMemo(() => source.clone(true), [source])
  const groupRef = useRef<Group>(null)
  const poseGroupRef = useRef<Group>(null)
  const dissolveMaterialRef = useRef<DissolveHullMaterial | null>(null)
  const gearRef = useRef<Object3D | null>(null)
  const [extremes, setExtremes] = useState<AircraftExtremes | null>(null)

  useEffect(() => {
    // plan3.md bug #7: castShadow/receiveShadow used to be forced true on
    // every exterior mesh here, but none of the three exterior lights ever
    // casts a shadow (environmentTheme.ts's EXTERIOR_LIGHTS are all
    // castsShadow: false — the A380 is 100+ meshes and a real shadow pass
    // broke the draw-call budget, replaced by RunwayEnvironment.tsx's
    // one-draw analytical contact shadow). Removed rather than left set:
    // with no caster, neither flag ever does anything on these meshes.
    const restores: (() => void)[] = []
    let gear: Object3D | null = null
    scene.traverse((obj) => {
      if (obj.name === 'A380' && (obj as Mesh).isMesh) {
        const mesh = obj as Mesh
        const sourceMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        const dissolveMaterial = createDissolveHullMaterial(sourceMaterial)
        mesh.material = dissolveMaterial
        dissolveMaterial.wireframe = qaWireframe
        restores.push(() => { mesh.material = sourceMaterial })
        dissolveMaterialRef.current = dissolveMaterial
      }
      if (obj.name === 'LandingGear') gear = obj
    })

    // Fase 0 item 02 (plan3.md §3.1/§4): the 115 LandingGear_Part_* siblings
    // share one material and identical attributes (verified in the plan3
    // audit) and are 92 of the Mobile Low hero's 99 draw calls. Merged here
    // at runtime rather than via process-glb.mjs's --join-draw-calls, which
    // would fuse the gear into the shared-material hull mesh too and break
    // both the dissolve swap above and gear retraction (§3.2). Each part's
    // transform is baked relative to `gear` via the full matrixWorld chain
    // (not just its immediate parent), so the merged mesh renders at exactly
    // the same world-space vertices — a pure draw-call optimization.
    scene.updateMatrixWorld(true)
    if (gear) {
      const gearGroup: Object3D = gear
      const gearInverse = new Matrix4().copy(gearGroup.matrixWorld).invert()
      const gearMeshes: Mesh[] = []
      gearGroup.traverse((child) => {
        if ((child as Mesh).isMesh) gearMeshes.push(child as Mesh)
      })
      if (gearMeshes.length > 1) {
        const relativeGeometries = gearMeshes.map((mesh) =>
          mesh.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(gearInverse, mesh.matrixWorld)),
        )
        const merged = mergeGeometries(relativeGeometries, false)
        relativeGeometries.forEach((geometry) => geometry.dispose())
        const gearMaterial = Array.isArray(gearMeshes[0].material) ? gearMeshes[0].material[0] : gearMeshes[0].material
        const mergedMesh = new Mesh(merged, gearMaterial)
        mergedMesh.name = 'LandingGear_Merged'
        // Shared GLTF geometries belong to the loader cache.
        for (const child of [...gearGroup.children]) gearGroup.remove(child)
        gearGroup.add(mergedMesh)
      }
    }

    gearRef.current = gear

    // Round 5: measure the hull's real extremes in the pose group's local
    // space (i.e. after the +90°X / EXTERIOR_LOCAL_OFFSET registration) so
    // AircraftNavLights sits on the actual wingtips, fin tip, crown and
    // belly instead of guessed offsets. One pass over ~70k vertices, once.
    const poseGroup = poseGroupRef.current
    let hull: Mesh | null = null
    scene.traverse((obj) => {
      if (obj.name === 'A380' && (obj as Mesh).isMesh) hull = obj as Mesh
    })
    if (poseGroup && hull) {
      const hullMesh: Mesh = hull
      poseGroup.updateWorldMatrix(true, true)
      const toPose = new Matrix4().copy(poseGroup.matrixWorld).invert().multiply(hullMesh.matrixWorld)
      const position = hullMesh.geometry.getAttribute('position')
      const v = new Vector3()
      const port = new Vector3(Number.POSITIVE_INFINITY, 0, 0)
      const starboard = new Vector3(Number.NEGATIVE_INFINITY, 0, 0)
      const fin = new Vector3(0, Number.NEGATIVE_INFINITY, 0)
      const tail = new Vector3(0, 0, Number.NEGATIVE_INFINITY)
      let crownY = Number.NEGATIVE_INFINITY
      let bellyY = Number.POSITIVE_INFINITY
      for (let index = 0; index < position.count; index += 1) {
        v.fromBufferAttribute(position, index).applyMatrix4(toPose)
        if (v.x < port.x) port.copy(v)
        if (v.x > starboard.x) starboard.copy(v)
        if (v.y > fin.y) fin.copy(v)
        if (v.z > tail.z) tail.copy(v)
        // Fuselage crown/belly: sampled on the centreline near the wing root.
        if (Math.abs(v.x) < 0.6 && v.z > -12 && v.z < -4) {
          crownY = Math.max(crownY, v.y)
          bellyY = Math.min(bellyY, v.y)
        }
      }
      setExtremes({
        portWingtip: [port.x, port.y, port.z],
        starboardWingtip: [starboard.x, starboard.y, starboard.z],
        finTip: [fin.x, fin.y, fin.z],
        tailCone: [tail.x, tail.y, tail.z],
        crown: [0, crownY + 0.25, -8],
        belly: [0, bellyY - 0.25, -8],
      })
    }
    useAssetState.getState().set('exterior', 'prepared')
    return () => {
      restores.forEach((restore) => restore())
      const dissolveMaterial = dissolveMaterialRef.current
      dissolveMaterial?.userData.aircraftSurfaceMaps.normal.dispose()
      dissolveMaterial?.userData.aircraftSurfaceMaps.roughness.dispose()
      dissolveMaterial?.dispose()
      dissolveMaterialRef.current = null
    }
  }, [scene])

  useFrame(({ camera, clock }) => {
    const group = groupRef.current
    if (!group) return
    const { progress } = useScrollStore.getState()
    const { position, pitchRad, gearExtension } = getAircraftPose(progress)

    // Cosmetic taxi vibration: time-driven (not scroll-indexed). It is the
    // "vibración de cámara en S2" PLAN.md §8.1 asks to remove under reduced
    // motion — the plan's own §3 attributes the shake to the aircraft's
    // pose, not a separate camera-side effect, and since the camera tracks
    // alongside the aircraft through S2 the two read as the same shake.
    //
    // plan6 3.5 / A05: the amplitude is a window, not a ramp that starts at
    // full. It used to be 1 at the exact instant S2 began, so the shake
    // switched on hard at the boundary; now it rises with the ground roll
    // and is gone by the time the wheels leave the runway, which is also
    // when a real airframe stops being shaken by the surface.
    let jitter = 0
    if (!reducedMotionState.active && progress >= TAXI_SECTION.start && progress < TAXI_SECTION.end) {
      const u = localProgress(progress, TAXI_SECTION)
      const envelope = Math.sin(Math.PI * Math.min(1, u / 0.56)) ** 2
      jitter = Math.sin(clock.elapsedTime * 40) * 0.08 * envelope
    }

    group.position.set(position.x, position.y + jitter, position.z)
    group.rotation.x = pitchRad
    group.visible = qaView !== 'interior'
    group.updateMatrixWorld(true)

    const dissolveUniforms = dissolveMaterialRef.current?.userData.dissolveUniforms
    if (dissolveUniforms) {
      // plan6 4.5: the opening follows the crossing, so it needs the camera
      // the rig has already posed this frame (CameraRig runs at -80, this at
      // -70) and the reach of its own near plane.
      const perspective = camera as import('three').PerspectiveCamera
      const nearCorner = nearPlaneCornerDistance(perspective.fov, perspective.aspect, perspective.near)
      dissolveUniforms.portal1Radius.value = portalRadius(progress, NOSE_PORTAL, camera.position, nearCorner)
      dissolveUniforms.portal2Radius.value = portalRadius(progress, EXIT_PORTAL, camera.position, nearCorner)
    }

    const gear = gearRef.current
    if (gear) {
      gear.position.y = (1 - gearExtension) * GEAR_RETRACT_RISE
      // Hidden only once fully stowed — removing the legs while any part of
      // them is still outside the bay is what leaves a hole in the belly
      // silhouette (plan6 3.6, "contorno final").
      gear.visible = gearExtension > 0
    }
  }, -70)

  return (
    <group ref={groupRef}>
      <group ref={poseGroupRef} rotation={[Math.PI / 2, 0, 0]} position={EXTERIOR_LOCAL_OFFSET}>
        <primitive object={scene} dispose={null} />
      </group>
      {extremes && <AircraftNavLights extremes={extremes} />}
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
