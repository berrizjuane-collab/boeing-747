import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { loadingState } from '../state/loadingState'
import { downgradeTier, useQualityStore } from '../state/qualityStore'

const SAMPLE_SECONDS = 2

/**
 * PLAN.md §7.3: sample frame time for ~2s after the hero's first real
 * render and downgrade one tier if the median exceeds 20ms. Sampling starts
 * from `loadingState.revealStartSeconds`, not from this component's own
 * mount — it mounts as soon as the Canvas does, well before the S0 loading
 * screen finishes and the scene is actually visible, and frame cost before
 * that point (assets still streaming in, exposure at 0) doesn't reflect
 * real rendering cost. Runs exactly once; only ever downgrades, never
 * upgrades — the plan doesn't ask for the latter, and setTier's own 'auto'
 * source already backs off permanently the moment a manual override
 * happens (qualityStore.ts), so this never fights a user's own choice.
 */
export function TierAutoDetect() {
  const samplesRef = useRef<number[]>([])
  const doneRef = useRef(false)

  useFrame((_, delta) => {
    if (doneRef.current) return
    const revealStart = loadingState.revealStartSeconds
    if (revealStart === null) return

    const elapsed = performance.now() / 1000 - revealStart
    if (elapsed < 0) return
    samplesRef.current.push(delta * 1000)

    if (elapsed >= SAMPLE_SECONDS) {
      doneRef.current = true
      const sorted = [...samplesRef.current].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0
      if (median > 20) {
        const { tier, setTier } = useQualityStore.getState()
        setTier(downgradeTier(tier), 'auto')
      }
    }
  })

  return null
}
