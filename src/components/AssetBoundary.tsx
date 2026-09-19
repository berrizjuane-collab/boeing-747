import { Component, type ReactNode } from 'react'
import { useAssetState } from '../state/assetState'

export class AssetBoundary extends Component<{ asset: 'interior' | 'exterior' | 'environment'; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { useAssetState.getState().set(this.props.asset, 'error', error.message) }
  render() { return this.state.failed ? null : this.props.children }
}
