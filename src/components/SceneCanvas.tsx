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

// S4, S5, S6 — mounted only in this window per PLAN.md Fase 4 ("montaje del
// interior en el grafo sólo en la ventana S4-S6"), so the real interior
// asset isn't resident in memory/draw calls for the rest of the journey.
const INTERIOR_ACTIVE_INDICES = new Set([3, 4, 5])

function InteriorGate() {
  const activeIndex = useScrollStore((s) => s.activeIndex)
  if (!INTERIOR_ACTIVE_INDICES.has(activeIndex)) return null
  return (
    <>
      <InteriorLighting />
      <Suspense fallback={null}>
        <InteriorAsset />
      </Suspense>
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
      camera={{ fov: 45, near: 0.1, far: 3000, position: [60, 8, 55] }}
      // The composer renders through non-MSAA targets, so context AA would
      // allocate buffers without reaching the final image. PostFX owns the
      // explicit SMAA path for all tiers.
      gl={{ antialias: false }}
      onCreated={({ gl }) => {
        // See StatsCollector.tsx: a multi-pass post-processing composer
        // calls renderer.render() several times per frame, and info.reset()
        // (which autoReset fires on every one of those calls) would wipe
        // out everything but the last pass's counts before anything reads
        // them. Reset manually, once per frame, from StatsCollector instead.
        gl.info.autoReset = false
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <Suspense fallback={null}>
        <EnvironmentPlaceholder />
      </Suspense>
      <RunwayEnvironment />
      <SunMesh ref={sunRef} />
      <Suspense fallback={null}>
        <ExteriorAsset />
      </Suspense>
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
