import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'
export interface ScrollController {
  lenis: null
  reducedMotion: boolean
  stop: (reason?: string) => void
  start: (reason?: string) => void
  scrollToFraction: (fraction: number, opts?: { duration?: number }) => void
  destroy: () => void
}
/** Native input supplies the target. Locks preserve the scroll container and
 * pending destination; only PresentationDriver smooths the presented frame. */
export function initScrollController(_trackEl: HTMLElement): ScrollController {
  const locks = new Set<string>()
  let lockedY = window.scrollY
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const readTarget = () => {
    if (locks.size && Math.abs(window.scrollY - lockedY) > 1) {
      window.scrollTo({ top: lockedY, behavior: 'instant' })
      return
    }
    const max = maxScroll()
    useScrollStore.getState().setTarget(max > 0 ? window.scrollY / max : 0)
  }
  const preventGesture = (event: Event) => { if (locks.size) event.preventDefault() }
  const preventKey = (event: KeyboardEvent) => {
    if (locks.size && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)
      && !(event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable="true"]'))) event.preventDefault()
  }
  const resize = () => { lockedY = Math.min(lockedY, maxScroll()); readTarget() }
  window.addEventListener('scroll', readTarget, { passive: true })
  window.addEventListener('resize', resize)
  window.addEventListener('wheel', preventGesture, { passive: false })
  window.addEventListener('touchmove', preventGesture, { passive: false })
  window.addEventListener('keydown', preventKey)
  readTarget()
  return {
    lenis: null, reducedMotion: reducedMotionState.active,
    stop: (reason = 'loading') => { if (!locks.size) lockedY = window.scrollY; locks.add(reason) },
    start: (reason = 'loading') => { locks.delete(reason) },
    scrollToFraction: fraction => {
      lockedY = Math.min(1, Math.max(0, fraction)) * maxScroll()
      window.scrollTo({ top: lockedY, behavior: 'instant' }); readTarget()
    },
    destroy: () => {
      window.removeEventListener('scroll', readTarget); window.removeEventListener('resize', resize)
      window.removeEventListener('wheel', preventGesture); window.removeEventListener('touchmove', preventGesture)
      window.removeEventListener('keydown', preventKey); locks.clear()
    },
  }
}
