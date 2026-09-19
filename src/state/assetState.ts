import { create } from 'zustand'

export type AssetStage = 'requested' | 'decoded' | 'prepared' | 'ready' | 'error'
interface AssetStatus { stage: AssetStage; error?: string }
type AssetKey = 'exterior' | 'environment' | 'interior'
export const useAssetState = create<{
  assets: Record<AssetKey, AssetStatus>
  set: (key: AssetKey, stage: AssetStage, error?: string) => void
}>((set) => ({
  assets: { exterior: { stage: 'requested' }, environment: { stage: 'requested' }, interior: { stage: 'requested' } },
  set: (key, stage, error) => set((state) => ({ assets: { ...state.assets, [key]: { stage, error } } })),
}))
