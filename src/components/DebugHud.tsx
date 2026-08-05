import { useEffect, useRef } from 'react'
import { SECTIONS } from '../lib/sections'
import { perfStats } from '../state/perfStats'
import { useScrollStore } from '../state/scrollStore'

/**
 * Debug HUD. `activeIndex` is read via the store hook — safe, it only
 * changes 6 times across the whole page (see scrollStore.ts). Everything
 * that changes every frame (progress %, fps, draw calls, triangles) is
 * written straight into the DOM via its own rAF loop, never through React
 * state, so this component never re-renders on scroll or on frame tick.
 */
export function DebugHud() {
  const activeIndex = useScrollStore((s) => s.activeIndex)
  const progressRef = useRef<HTMLSpanElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const callsRef = useRef<HTMLSpanElement>(null)
  const trisRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { progress } = useScrollStore.getState()
      if (progressRef.current) progressRef.current.textContent = `${Math.round(progress * 100)}%`
      if (fpsRef.current) fpsRef.current.textContent = String(perfStats.fps)
      if (callsRef.current) callsRef.current.textContent = String(perfStats.drawCalls)
      if (trisRef.current) trisRef.current.textContent = perfStats.triangles.toLocaleString('es-AR')
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="debug-hud">
      <div>{SECTIONS[activeIndex].label}</div>
      <div>
        scroll <span ref={progressRef}>0%</span>
      </div>
      <div>
        fps <span ref={fpsRef}>0</span>
      </div>
      <div>
        draw calls <span ref={callsRef}>0</span>
      </div>
      <div>
        triángulos <span ref={trisRef}>0</span>
      </div>
    </div>
  )
}
