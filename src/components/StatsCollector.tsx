import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Frustum, InstancedMesh, Matrix4, Mesh, type Camera, type Scene } from 'three'
import { perfStats } from '../state/perfStats'
import { imagePipelineDiagnostics, type ImagePipelineDiagnostics } from '../state/imagePipelineDiagnostics'

declare global {
  interface Window {
    __MERIDIAN_GRADE_QA__?: {
      setEnabled: (enabled: boolean) => void
    }
    __MERIDIAN_ENVIRONMENT_QA__?: {
      sample: (progress: number) => {
        environmentSource: 'golden' | 'high-altitude' | 'cabin' | 'sunset'
        environmentBound: boolean
      }
    }
    __MERIDIAN_GEAR_QA__?: {
      setMode: (mode: 'merged' | 'source') => void
    }
    __MERIDIAN_PERF__?: {
      fps: number
      frameTimeMedianMs: number
      drawCalls: number
      /** Visible scene geometry once, matching PLAN.md's "triangles on screen" budget. */
      triangles: number
      /** All submitted triangles across scene/shadow/post passes, retained as a diagnostic. */
      submittedTriangles: number
    }
    __MERIDIAN_IMAGE_PIPELINE__?: ImagePipelineDiagnostics
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
  const previousFrameTime = useRef(performance.now())
  const frameDeltas = useRef<number[]>([])
  const frameTimeMedianMs = useRef(0)
  const frames = useRef(0)
  const frustum = useRef(new Frustum())
  const projection = useRef(new Matrix4())

  useFrame(() => {
    frames.current += 1
    const now = performance.now()
    const frameDelta = now - previousFrameTime.current
    previousFrameTime.current = now
    if (frameDelta > 0 && frameDelta < 5_000) {
      frameDeltas.current.push(frameDelta)
      if (frameDeltas.current.length > 31) frameDeltas.current.shift()
      const sorted = [...frameDeltas.current].sort((a, b) => a - b)
      frameTimeMedianMs.current = sorted[Math.floor(sorted.length / 2)]
    }
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
      frameTimeMedianMs: Number(frameTimeMedianMs.current.toFixed(3)),
      drawCalls: perfStats.drawCalls,
      triangles: perfStats.triangles,
      submittedTriangles: gl.info.render.triangles,
    }
    window.__MERIDIAN_IMAGE_PIPELINE__ = { ...imagePipelineDiagnostics }
    gl.info.reset()
  }, 2)

  return null
}
