import { useEffect, useRef, useState } from 'react'
import { BRAND_NAME } from '../lib/content'
import { useAssetState } from '../state/assetState'
import { loadingState } from '../state/loadingState'



/**
 * S0 (PLAN.md §10.4): black, centered wordmark, hairline rule filling
 * left-to-right, tabular-mono percentage. `useProgress` wraps
 * THREE.DefaultLoadingManager, which every loader in this app (GLTFLoader,
 * RGBELoader) registers with automatically — no manual wiring needed to
 * observe loads, only to *weight* them (loadingWeights.ts's honest caveat:
 * useProgress counts items, not bytes).
 *
 * `active` starts false before anything has been requested yet, not just
 * once everything's done — reading a bare `!active` as "loading complete"
 * on the very first render would fire the exit sequence immediately, before
 * any Suspense-gated component has even mounted to start its fetch. Gated
 * on `total >= BLOCKING_ITEM_COUNT` too: wait until at least as many items
 * have been *registered* as this app expects to block on, not just until
 * whatever has registered so far happens to be idle.
 */
export function LoadingScreen({ onComplete }: { onComplete: () => void }) {
  const assets = useAssetState((s) => s.assets)
  const ready = assets.exterior.stage === 'ready' && assets.environment.stage === 'ready'
  const failed = assets.exterior.stage === 'error' || assets.environment.stage === 'error'
  const completedRef = useRef(false)
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [weightedPct, setWeightedPct] = useState(0)
  const [exiting, setExiting] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    if (completedRef.current || !ready) return
    completedRef.current = true
    setWeightedPct(100)
    // Starts the exposure ramp (EnvironmentPlaceholder.tsx) immediately,
    // concurrent with this screen's own ~400-500ms fade rather than after
    // it: the scene coming up *while* the loading screen dissolves reads as
    // one continuous reveal instead of a black gap between "loader gone"
    // and "scene visible" — same goal as PLAN.md §10.4's sequential
    // description (rule -> wordmark -> exposure), simpler to keep smooth.
    loadingState.revealStartSeconds = performance.now() / 1000
    onComplete()
    setExiting(true)
    // Keep this timer alive if `active`/`total` emit one final loading-manager
    // update after completion. Returning its cleanup from this effect used to
    // cancel the timer on that update, leaving a transparent
    // `.loading-screen--exit` mounted forever and making readiness checks hang.
    exitTimerRef.current = setTimeout(() => setMounted(false), 550)
  }, [ready, onComplete])

  useEffect(
    () => () => {
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current)
    },
    [],
  )

  if (!mounted) return null

  return (
    <div className={`loading-screen${exiting ? ' loading-screen--exit' : ''}`} aria-hidden={exiting}>
      <div className="loading-screen__wordmark">{BRAND_NAME}</div>
      <div className="loading-screen__rule">
        <div className="loading-screen__rule-fill" style={{ width: `${weightedPct}%` }} />
      </div>
      {failed && <p role="alert">No se pudo cargar la experiencia. <button onClick={() => location.reload()}>Reintentar</button> <a href={`${import.meta.env.BASE_URL}?static=1`}>Ver versión sin 3D</a></p>}
      <div className="loading-screen__pct">{String(Math.round(weightedPct)).padStart(2, '0')}%</div>
    </div>
  )
}
