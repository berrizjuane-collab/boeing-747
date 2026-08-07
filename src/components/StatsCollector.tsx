import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { perfStats } from '../state/perfStats'

/**
 * Writes renderer stats into the module-level perfStats object every frame.
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
 */
export function StatsCollector() {
  const { gl } = useThree()
  const lastTime = useRef(performance.now())
  const frames = useRef(0)

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
    perfStats.triangles = gl.info.render.triangles
    gl.info.reset()
  }, 2)

  return null
}
