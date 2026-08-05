import { create } from 'zustand'
import { getActiveSectionIndex } from '../lib/sections'

interface ScrollState {
  /**
   * 0..1 across the whole document. Updated every scroll tick (via GSAP's
   * scrub, so multiple times per frame while scrolling). Read it with
   * `useScrollStore.getState().progress` inside useFrame/rAF loops — never
   * through the `useScrollStore(s => s.progress)` hook, or every tick
   * re-renders React. This is the hard rule from PLAN.md §2.1.
   */
  progress: number
  /** Discrete 0..6 section index. Safe to select via the hook: zustand only
   * re-renders subscribers when the *selected* value changes, and this only
   * changes 6 times across the whole page. */
  activeIndex: number
  setProgress: (p: number) => void
}

export const useScrollStore = create<ScrollState>((set) => ({
  progress: 0,
  activeIndex: 0,
  setProgress: (p) => set({ progress: p, activeIndex: getActiveSectionIndex(p) }),
}))
