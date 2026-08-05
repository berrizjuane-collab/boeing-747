import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { useScrollStore } from '../state/scrollStore'

gsap.registerPlugin(ScrollTrigger)

/**
 * Wires Lenis (inertial scroll smoothing) to GSAP ScrollTrigger (the
 * scroll-progress source of truth) and pipes progress into the scroll
 * store. See PLAN.md §2.2: numeric `scrub`, not `scrub: true` — that's what
 * makes the camera drag slightly behind scroll instead of feeling tied to
 * the wheel. Returns a cleanup function.
 */
export function initScrollController(trackEl: HTMLElement): () => void {
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

  return () => {
    trigger.kill()
    gsap.ticker.remove(raf)
    lenis.destroy()
  }
}
