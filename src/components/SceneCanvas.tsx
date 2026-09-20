import { PresentationDriver } from './PresentationDriver'
import { AssetBoundary } from './AssetBoundary'
import { Canvas } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import { SRGBColorSpace, type Mesh } from 'three'
import { CameraRig } from './CameraRig'
import { EnvironmentPlaceholder } from './EnvironmentPlaceholder'
import { ExteriorAsset } from './ExteriorAsset'
import { Hotspots } from './Hotspots'
import { InteriorAsset } from './InteriorAsset'
import { InteriorLighting } from './InteriorLighting'
import { PostFX } from './PostFX'
import { RunwayEnvironment } from './RunwayEnvironment'
import { StatsCollector } from './StatsCollector'
import { SunMesh } from './SunMesh'
import { ThresholdFrame } from './ThresholdFrame'
import { TierAutoDetect } from './TierAutoDetect'
import { KeyframeAuthoringTool } from '../dev/KeyframeAuthoringTool'
import { useQualityStore, TIER_SETTINGS } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'

// Keep geometry and lights resident; visibility and IBL ownership follow
// S4–S6. Repeated visits never rebuild the cabin or its light inventory.
const INTERIOR_ACTIVE_INDICES = new Set([3, 4, 5])

function InteriorGate() {
  const activeIndex = useScrollStore((s) => s.activeIndex)
  return (
    <>
      <InteriorLighting active={INTERIOR_ACTIVE_INDICES.has(activeIndex)} />
      <AssetBoundary asset="interior"><Suspense fallback={null}>
        <InteriorAsset />
      </Suspense></AssetBoundary>
    </>
  )
}

export function SceneCanvas({ debugMode }: { debugMode: boolean }) {
  // §7.1's DPR ceiling per tier. Reactive selection is fine here — tier
  // changes at most twice in a session (one auto-detect, one manual
  // override), nothing like the continuous-progress case the hard rule in
  // scrollStore.ts exists for.
  const dprMax = useQualityStore((s) => TIER_SETTINGS[s.tier].dprMax)
  const sunRef = useRef<Mesh>(null)

  return (
    <Canvas
      // §8.3: canvas content is decorative relative to the DOM narrative,
      // which carries the same information as real, accessible text.
      aria-hidden="true"
      // Runtime shadows cover the runway and the bounded interior Fase 5
      // lights; any broader shadow budget remains explicit future work.
      shadows
      // R3F's Canvas wrapper div ships its own inline `position: relative`;
      // passing `className` alone loses to that (inline beats stylesheet),
      // so the fixed-fullscreen override has to go through `style`, which
      // R3F spreads over its defaults.
      style={{ position: 'fixed', inset: 0, zIndex: 0, display: 'block' }}
      dpr={[1, dprMax]}
      // plan6 4.6: near 0.15, not 0.1. Depth precision is set by the
      // far/near ratio, and 3000/0.1 spends most of the buffer on the first
      // few metres. The floor is the camera's own verified clearance:
      // round 6 phase 2 measured a minimum of 0.2548 u to cabin geometry,
      // and at near 0.15 the farthest near-plane corner (fov 50, 16:9) sits
      // 0.207 u out — inside that, where 0.2 would already have been past
      // it. `far` is deliberately unchanged: the terrain disc reaches
      // 1500 u and enlarging it to hide a horizon is exactly what the plan
      // rules out.
      camera={{ fov: 45, near: 0.15, far: 3000, position: [60, 8, 55] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        // See StatsCollector.tsx: a multi-pass post-processing composer
        // calls renderer.render() several times per frame, and info.reset()
        // (which autoReset fires on every one of those calls) would wipe
        // out everything but the last pass's counts before anything reads
        // them. Reset manually, once per frame, from StatsCollector instead.
        gl.info.autoReset = false
        // plan3.md bug #8: gl.toneMapping/gl.toneMappingExposure used to be
        // set here, but mounting <EffectComposer> (PostFX.tsx) forces the
        // renderer to NoToneMapping internally so the composer's own
        // <ToneMapping> pass is the only curve applied — these two were
        // silent no-ops, and worse, they're *why* the codebase believed it
        // had ACES applied via the renderer while PostFX.tsx's actual
        // <ToneMapping> ran with AgX underneath (bug #1). The real,
        // effective mode now lives in one place: postFxConfig.ts.
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <PresentationDriver />
      <AssetBoundary asset="environment"><Suspense fallback={null}>
        <EnvironmentPlaceholder />
      </Suspense></AssetBoundary>
      <RunwayEnvironment />
      <SunMesh ref={sunRef} />
      <AssetBoundary asset="exterior"><Suspense fallback={null}>
        <ExteriorAsset />
      </Suspense></AssetBoundary>
      <InteriorGate />
      <Hotspots />
      <ThresholdFrame />
      <CameraRig enabled={!debugMode} />
      {debugMode && <KeyframeAuthoringTool />}
      <StatsCollector />
      <TierAutoDetect />
      <PostFX sunRef={sunRef} />
    </Canvas>
  )
}
