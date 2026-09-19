import { create } from 'zustand'
import { getInteriorZone, type InteriorZoneKey } from '../lib/cameraPath'
import { getActiveSectionIndex } from '../lib/sections'

export interface ScrollSnapshot {
  /**
   * 0..1 across the whole document. Published once at the start of each rendered frame. Read it with
   * `useScrollStore.getState().progress` inside useFrame/rAF loops — never
   * through the `useScrollStore(s => s.progress)` hook, or every tick
   * re-renders React. This is the hard rule from PLAN.md §2.1.
   */
  progress: number
  /** Discrete 0..6 section index. Safe to select via the hook: zustand only
   * re-renders subscribers when the *selected* value changes, and this only
   * changes 6 times across the whole page. */
  activeIndex: number
  /** Derived atomically from global progress; always null outside S5. */
  interiorZone: InteriorZoneKey | null
}

interface ScrollState extends ScrollSnapshot {
  targetProgress: number
  setTarget: (p: number) => void
  setProgress: (p: number) => void
}

export function deriveScrollSnapshot(globalProgress: number): ScrollSnapshot {
  const progress = Math.min(1, Math.max(0, globalProgress))
  return {
    progress,
    activeIndex: getActiveSectionIndex(progress),
    interiorZone: getInteriorZone(progress),
  }
}

export const useScrollStore = create<ScrollState>((set) => ({
  ...deriveScrollSnapshot(0),
  targetProgress: 0,
  setTarget: (p) => set({ targetProgress: Math.min(1, Math.max(0, p)) }),
  setProgress: (progress) => set(deriveScrollSnapshot(progress)),
}))
