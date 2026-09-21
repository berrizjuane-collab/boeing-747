import { useEffect, useRef, useSyncExternalStore } from 'react'
import App from '../App'
import { StaticFallback } from './StaticFallback'
import { reducedMotionState, subscribeReducedMotion } from '../state/reducedMotion'
import { detectWebGL2Support } from '../lib/webglSupport'

const params = new URLSearchParams(location.search)
const supported = params.has('static') ? false : detectWebGL2Support()
export function Experience() {
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => reducedMotionState.active)
  const reading = params.has('static') || !supported || (reduced && params.get('motion') !== '3d')
  const firstRender = useRef(true)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    // A preference change must leave focus somewhere visible, not on an unmounted control.
    if (firstRender.current) { firstRender.current = false; return }
    const target = document.querySelector<HTMLElement>(reading ? '.fallback__notice' : '.site-nav__reading')
    if (reading) target?.setAttribute('tabindex', '-1')
    target?.focus({ preventScroll: true })
  }, [reading])
  return reading ? <StaticFallback reason={params.has('static') ? 'reading' : !supported ? 'webgl' : 'motion'} /> : <App />
}
