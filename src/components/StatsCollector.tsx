import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { perfStats } from '../state/perfStats'

/** Writes renderer stats into the module-level perfStats object every frame. Never touches React state — see perfStats.ts. */
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
  })

  return null
}
