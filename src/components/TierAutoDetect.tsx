import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { loadingState } from '../state/loadingState'
import { downgradeTier, useQualityStore } from '../state/qualityStore'
import { shouldDowngradeTier } from '../lib/qualityAssessment'

const WARMUP_SECONDS = 0.75
const SAMPLE_SECONDS = 2

/**
 * PLAN.md §7.3: sample frame time for ~2s after the hero's first real
 * render and downgrade one tier if the median exceeds 20ms. Sampling starts
 * from `loadingState.revealStartSeconds`, not from this component's own
 * mount — it mounts as soon as the Canvas does, well before the S0 loading
 * screen finishes and the scene is actually visible, and frame cost before
 * that point (assets still streaming in, exposure at 0) doesn't reflect
 * real rendering cost. A short warm-up excludes first-frame shader
 * compilation; hidden-tab and background-resume deltas are ignored. Runs
 * exactly once; only ever downgrades, never
 * upgrades — the plan doesn't ask for the latter, and setTier's own 'auto'
 * source already backs off permanently the moment a manual override
 * happens (qualityStore.ts), so this never fights a user's own choice.
 */
export function TierAutoDetect() {
  const samplesRef = useRef<number[]>([])
  const doneRef = useRef(false)
  const sampleStartRef = useRef<number | null>(null)

  useFrame((_, delta) => {
    if (doneRef.current) return
    const revealStart = loadingState.revealStartSeconds
    if (revealStart === null) return

    const now = performance.now() / 1000
    const elapsed = now - revealStart
    if (elapsed < WARMUP_SECONDS || document.visibilityState === 'hidden') return
    if (sampleStartRef.current === null) sampleStartRef.current = now
    if (delta > 0 && delta <= 0.25) samplesRef.current.push(delta * 1000)

    if (now - sampleStartRef.current >= SAMPLE_SECONDS) {
      doneRef.current = true
      if (shouldDowngradeTier(samplesRef.current)) {
        const { tier, setTier } = useQualityStore.getState()
        setTier(downgradeTier(tier), 'auto')
      }
    }
  })

  return null
}
