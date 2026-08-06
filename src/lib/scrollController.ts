import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useScrollStore } from '../state/scrollStore'

gsap.registerPlugin(ScrollTrigger)

export interface ScrollController {
  lenis: Lenis
  destroy: () => void
}

/**
 * Wires Lenis (inertial scroll smoothing) to GSAP ScrollTrigger (the
 * scroll-progress source of truth) and pipes progress into the scroll
 * store. See PLAN.md §2.2: numeric `scrub`, not `scrub: true` — that's what
 * makes the camera drag slightly behind scroll instead of feeling tied to
 * the wheel.
 *
 * Returns the Lenis instance alongside the cleanup function (not just a bare
 * cleanup function, the way this used to work before Fase 6) so the caller
 * can `lenis.stop()`/`lenis.start()` around the S0 loading gate — PLAN.md §0
 * requires scroll blocked until loading completes. `ScrollTrigger.update` is
 * driven by Lenis's own 'scroll' event, so stopping Lenis alone is enough to
 * freeze progress; no separate ScrollTrigger-side flag is needed.
 */
export function initScrollController(trackEl: HTMLElement): ScrollController {
  const lenis = new Lenis()

  lenis.on('scroll', ScrollTrigger.update)

  const raf = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(raf)
  gsap.ticker.lagSmoothing(0)

  const trigger = ScrollTrigger.create({
    trigger: trackEl,
    start: 'top top',
    end: 'bottom bottom',
    scrub: 1,
    onUpdate: (self) => {
      useScrollStore.getState().setProgress(self.progress)
    },
  })

  return {
    lenis,
    destroy: () => {
      trigger.kill()
      gsap.ticker.remove(raf)
      lenis.destroy()
    },
  }
}
