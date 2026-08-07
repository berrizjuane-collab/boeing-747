import { useProgress } from '@react-three/drei'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { ScrollController } from '../lib/scrollController'
import { SECTIONS } from '../lib/sections'
import { interiorLoadState } from '../state/interiorLoadState'
import { useScrollStore } from '../state/scrollStore'

const S4_START = SECTIONS[3].start
// Engage a hair before S4's own start, not exactly at it: the threshold
// dissolve/cross-fade (EnvironmentPlaceholder.tsx, ExteriorAsset.tsx) is
// already ramping in that instant, so holding right at the boundary would
// still let a frame or two of "entering S4 with no interior yet" through.
const HOLD_MARGIN = 0.01

/**
 * PLAN.md §8 ("Guardarraíl si el usuario llega a S4 antes de que cargue el
 * interior... se sostiene el scroll con una transición elegante en vez de
 * mostrar una cabina a medio cargar"). Reuses the same lenis.stop()/start()
 * mechanism App.tsx already uses for the S0 loading gate — same tool,
 * different trigger condition — rather than a second scroll-locking scheme.
 *
 * Watches `useProgress`'s `item` for interior.glb specifically (not overall
 * `active`, which also covers exterior.glb/the HDRIs and would report
 * "done" long before the interior itself is ready in the common case where
 * the interior is still streaming in during S1-S3, per §6.4's own
 * progressive-loading design). Continuous progress is read via rAF from
 * `.getState()`, never the reactive hook — the hard rule from
 * scrollStore.ts — `held` itself is fine as real React state since it only
 * changes at most twice per approach to S4, not every frame.
 */
export function InteriorLoadGuardrail({ controllerRef }: { controllerRef: RefObject<ScrollController | null> }) {
  const { item } = useProgress()
  const [held, setHeld] = useState(false)
  const heldRef = useRef(held)
  heldRef.current = held

  useEffect(() => {
    if (item?.endsWith('/models/interior.glb')) interiorLoadState.loaded = true
  }, [item])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { progress } = useScrollStore.getState()
      const controller = controllerRef.current
      const shouldHold = progress >= S4_START - HOLD_MARGIN && !interiorLoadState.loaded
      if (controller) {
        if (shouldHold && !heldRef.current) {
          controller.stop()
          setHeld(true)
        } else if (!shouldHold && heldRef.current) {
          controller.start()
          setHeld(false)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [controllerRef])

  return (
    <div className="interior-guardrail" data-active={held} aria-hidden={!held}>
      Preparando la cabina…
    </div>
  )
}
