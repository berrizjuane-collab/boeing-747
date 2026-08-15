import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Frustum, InstancedMesh, Matrix4, Mesh, type Camera, type Scene } from 'three'
import { ACTIVE_TONE_MAPPING_LABEL } from '../lib/postFxConfig'
import { perfStats } from '../state/perfStats'

declare global {
  interface Window {
    __MERIDIAN_PERF__?: {
      fps: number
      drawCalls: number
      /** Visible scene geometry once, matching PLAN.md's "triangles on screen" budget. */
      triangles: number
      /** All submitted triangles across scene/shadow/post passes, retained as a diagnostic. */
      submittedTriangles: number
      /** plan3.md A1: lets visual QA assert the applied curve matches PostFX.tsx's
       * declared one instead of trusting the source comment. */
      toneMappingMode: string
      /** plan3.md A4: lets visual QA sweep scroll and assert this is never null. */
      sceneEnvironmentIsNull: boolean
    }
  }
}

function visibleSceneTriangles(scene: Scene, camera: Camera, frustum: Frustum, projection: Matrix4) {
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(projection)
  let triangles = 0

  scene.traverseVisible((object) => {
    if (!(object as Mesh).isMesh) return
    const mesh = object as Mesh
    if (mesh.frustumCulled && !frustum.intersectsObject(mesh)) return
    const geometry = mesh.geometry
    const availableElements = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0
    const drawStart = Math.min(geometry.drawRange.start, availableElements)
    const drawCount = Number.isFinite(geometry.drawRange.count)
      ? Math.min(geometry.drawRange.count, availableElements - drawStart)
      : availableElements - drawStart
    const instances = (mesh as InstancedMesh).isInstancedMesh ? (mesh as InstancedMesh).count : 1
    triangles += (Math.max(0, drawCount) / 3) * instances
  })

  return Math.round(triangles)
}

/**
 * Writes performance stats into the module-level perfStats object every frame.
 * Never touches React state — see perfStats.ts.
 *
 * Runs at priority 2, after PostFX's EffectComposer (priority 1, its
 * default): `gl.info.autoReset` defaults to true, and three.js resets
 * `info.render` at the start of *every* `renderer.render()` call, not once
 * per frame — a multi-pass composer calls it several times per frame (one
 * per internal pass), so reading gl.info at the default priority (which
 * runs before the composer's own render call) only ever captured whatever
 * was left over from the *previous* frame's final pass: a 1-triangle,
 * 1-draw-call fullscreen composite, regardless of real scene complexity.
 * Confirmed via the Fase 7 Playwright pass — draw calls read as 1
 * everywhere despite screenshots showing the scene rendering correctly.
 * SceneCanvas.tsx sets `gl.info.autoReset = false` to stop the automatic
 * per-render-call reset; this component resets it manually once per frame,
 * after the composer has finished and every pass's counts have accumulated.
 * Draw calls retain that submitted-work meaning. The plan's triangle column,
 * however, explicitly says "triangles on screen", so that value is measured
 * from visible/frustum-intersecting scene meshes once; the accumulated GPU
 * submission count remains exposed separately for diagnosis.
 */
export function StatsCollector() {
  const { camera, gl, scene } = useThree()
  const lastTime = useRef(performance.now())
  const frames = useRef(0)
  const frustum = useRef(new Frustum())
  const projection = useRef(new Matrix4())

  useFrame(() => {
    frames.current += 1
    const now = performance.now()
    const elapsed = now - lastTime.current
    if (elapsed >= 250) {
      perfStats.fps = Math.round((frames.current * 1000) / elapsed)
      frames.current = 0
      lastTime.current = now
    }
    perfStats.drawCalls = gl.info.render.calls
    perfStats.triangles = visibleSceneTriangles(scene, camera, frustum.current, projection.current)
    // Production visual QA cannot mount the dev-only DebugHud. A tiny
    // read-only snapshot gives Playwright the same renderer counters without
    // affecting React state or adding any visible instrumentation.
    window.__MERIDIAN_PERF__ = {
      fps: perfStats.fps,
      drawCalls: perfStats.drawCalls,
      triangles: perfStats.triangles,
      submittedTriangles: gl.info.render.triangles,
      toneMappingMode: ACTIVE_TONE_MAPPING_LABEL,
      sceneEnvironmentIsNull: scene.environment === null,
    }
    gl.info.reset()
  }, 2)

  return null
}
