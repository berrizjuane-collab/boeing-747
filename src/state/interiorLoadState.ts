// Compatibility accessor; readiness comes from preparation, never a URL event.
import { useAssetState } from './assetState'
export const interiorLoadState = {
  get loaded() { return useAssetState.getState().assets.interior.stage === 'ready' },
}
