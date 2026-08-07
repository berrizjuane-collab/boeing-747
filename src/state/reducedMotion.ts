// Plain mutable module state, registered once at import time rather than
// each consumer running its own matchMedia + change-listener effect —
// several components read this now (CameraRig, ExteriorAsset,
// RunwayEnvironment, ReducedMotionCrossfade, scrollController), and a
// change to the OS-level preference is rare enough that one shared
// listener updating one shared value is simpler than N independent ones.
export const reducedMotionState: { active: boolean } = {
  active: false,
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionState.active = media.matches
  media.addEventListener('change', () => {
    reducedMotionState.active = media.matches
  })
}
