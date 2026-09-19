import { useFrame } from '@react-three/fiber'
import { advanceProgress } from '../lib/presentedProgress'
import { qaTime } from '../lib/qaConfig'
import { useAssetState } from '../state/assetState'
import { reducedMotionState } from '../state/reducedMotion'
import { useScrollStore } from '../state/scrollStore'

export function PresentationDriver() {
  useFrame(({ clock }, delta) => {
    if (qaTime !== null) clock.elapsedTime = qaTime
    const state = useScrollStore.getState()
    state.setProgress(advanceProgress(state.progress, state.targetProgress, delta,
      useAssetState.getState().assets.interior.stage === 'ready', reducedMotionState.active))
  }, -100)
  return null
}
