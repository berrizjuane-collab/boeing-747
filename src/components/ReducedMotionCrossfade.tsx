import { useEffect, useRef, useState, type ReactNode } from 'react'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

const DIP_MS = 220

/**
 * PLAN.md §8.1: "scrub continuo -> snapping discreto por sección con
 * cross-fade". scrollController.ts's reduced-motion path handles the
 * "snapping discreto" half (native scroll + snap-to-section-start). This
 * handles the "con cross-fade" half: a single WebGL canvas can't literally
 * cross-fade between two rendered frames without a snapshot mechanism, so
 * a brief opacity dip around each section change stands in for it — it
 * reads as a transition masking the jump rather than a hard cut, which is
 * the actual goal (hiding the discrete camera jump between section
 * keyframes), without needing a frame-capture pipeline to get there.
 *
 * A no-op wrapper when the media query doesn't match — mounted
 * unconditionally in App.tsx rather than gated at the call site so the
 * media query is only read in one place.
 */
export function ReducedMotionCrossfade({ children }: { children: ReactNode }) {
  const activeIndex = useScrollStore((s) => s.activeIndex)
  const [dipped, setDipped] = useState(false)
  const mountedRef = useRef(false)

  useEffect(() => {
    // Skip the dip on first mount — there's no prior section to be
    // transitioning away from yet.
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    if (!reducedMotionState.active) return
    setDipped(true)
    const timer = setTimeout(() => setDipped(false), DIP_MS)
    return () => clearTimeout(timer)
  }, [activeIndex])

  return (
    <div className="reduced-motion-crossfade" data-dipped={dipped}>
      {children}
    </div>
  )
}
