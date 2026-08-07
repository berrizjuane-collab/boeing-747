import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { SECTIONS } from './sections'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

gsap.registerPlugin(ScrollTrigger)

export interface ScrollController {
  /** Null under prefers-reduced-motion (PLAN.md §8.1: "Lenis desactivado
   * por completo"), not just detuned — components that want inertial
   * details specifically (none currently do outside this file) should
   * check for null rather than assume it's always present. Everything
   * that actually needs to lock/jump scroll should go through the
   * lenis-agnostic methods below instead. */
  lenis: Lenis | null
  reducedMotion: boolean
  /** Freezes the current scroll position in place. */
  stop: () => void
  /** Releases a stop() call. */
  start: () => void
  /** Animates to a section's start, `fraction` in [0,1] of total scroll. */
  scrollToFraction: (fraction: number, opts?: { duration?: number }) => void
  destroy: () => void
}

/**
 * Wires up GSAP ScrollTrigger as the scroll-progress source of truth and
 * pipes progress into the scroll store — with two different scroll engines
 * underneath depending on `prefers-reduced-motion`.
 *
 * Normal path: Lenis (inertial scroll smoothing) feeding ScrollTrigger.
 * `scrub: 1` makes the camera drag slightly behind scroll instead of
 * feeling tied to the wheel (PLAN.md §2.2).
 *
 * Reduced-motion path (§8.1, taken literally): no Lenis at all — native
 * scroll drives ScrollTrigger directly — plus `snap` to each section's own
 * start so a scroll gesture lands *on* a section instead of drifting to an
 * arbitrary point inside one. `scrub` stays a (short) number rather than
 * `true`/0 even here: at `0` the sampled progress is tied exactly to raw
 * scroll-event granularity, which under native (non-Lenis) scroll is choppy
 * enough to read as broken rather than calm; a short scrub still removes
 * per-wheel-tick jitter without being the kind of sustained motion
 * reduced-motion is asking to remove. The actual continuous camera pan
 * between sections is masked by a brief opacity dip on section change
 * instead (App.tsx's ReducedMotionCrossfade) — that's the "cross-fade" in
 * "snapping discreto por sección con cross-fade".
 */
export function initScrollController(trackEl: HTMLElement): ScrollController {
  // Read once at controller-creation time (app boot), not reactively: the
  // scroll engine itself (Lenis vs. native + snap) can't be swapped live if
  // the OS preference changes mid-session without tearing down and
  // recreating ScrollTrigger/Lenis entirely, which no other part of this
  // pipeline handles. Everything else that reads reducedMotionState
  // (CameraRig, ExteriorAsset, RunwayEnvironment) checks it every frame and
  // *can* react live, so a mid-session preference change still mutes the
  // secondary motion (parallax, jitter, oscillation) even though the
  // scroll engine choice stays fixed for the session.
  const reducedMotion = reducedMotionState.active

  if (reducedMotion) {
    const trigger = ScrollTrigger.create({
      trigger: trackEl,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.3,
      snap: {
        snapTo: SECTIONS.map((s) => s.start),
        duration: { min: 0.15, max: 0.3 },
        ease: 'power1.inOut',
      },
      onUpdate: (self) => {
        useScrollStore.getState().setProgress(self.progress)
      },
    })

    return {
      lenis: null,
      reducedMotion: true,
      // Native scroll has no built-in "freeze in place" — overflow:hidden
      // on the scrolling element blocks every input method (wheel, touch,
      // keyboard, scrollbar drag) at once without moving the current
      // position, unlike selectively preventDefault-ing individual event
      // types, which keyboard scrolling would slip past.
      stop: () => {
        document.documentElement.style.overflow = 'hidden'
      },
      start: () => {
        document.documentElement.style.overflow = ''
      },
      scrollToFraction: (fraction) => {
        const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
        window.scrollTo({ top: fraction * scrollableHeight, behavior: 'auto' })
      },
      destroy: () => {
        trigger.kill()
        document.documentElement.style.overflow = ''
      },
    }
  }

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
    reducedMotion: false,
    stop: () => lenis.stop(),
    start: () => lenis.start(),
    scrollToFraction: (fraction, opts) => {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
      lenis.scrollTo(fraction * scrollableHeight, { duration: opts?.duration ?? 1.2 })
    },
    destroy: () => {
      trigger.kill()
      gsap.ticker.remove(raf)
      lenis.destroy()
    },
  }
}
