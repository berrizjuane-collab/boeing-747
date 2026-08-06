import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { CameraRig } from './CameraRig'
import { EnvironmentPlaceholder } from './EnvironmentPlaceholder'
import { ExteriorAsset } from './ExteriorAsset'
import { Hotspots } from './Hotspots'
import { InteriorAsset } from './InteriorAsset'
import { InteriorLighting } from './InteriorLighting'
import { RunwayEnvironment } from './RunwayEnvironment'
import { StatsCollector } from './StatsCollector'
import { ThresholdFrame } from './ThresholdFrame'
import { KeyframeAuthoringTool } from '../dev/KeyframeAuthoringTool'
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
  return (
    <Canvas
      // Runtime shadows cover the runway and the bounded interior Fase 5
      // lights; any broader shadow budget remains explicit future work.
      shadows
      // R3F's Canvas wrapper div ships its own inline `position: relative`;
      // passing `className` alone loses to that (inline beats stylesheet),
      // so the fixed-fullscreen override has to go through `style`, which
      // R3F spreads over its defaults.
      style={{ position: 'fixed', inset: 0, zIndex: 0, display: 'block' }}
      dpr={[1, 2]} // full tiering by device is Fase 8; this is just a sane cap
      camera={{ fov: 45, near: 0.1, far: 3000, position: [60, 8, 55] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        gl.outputColorSpace = SRGBColorSpace
      }}
    >
      <Suspense fallback={null}>
        <EnvironmentPlaceholder />
      </Suspense>
      <RunwayEnvironment />
      <Suspense fallback={null}>
        <ExteriorAsset />
      </Suspense>
      <InteriorGate />
      <Hotspots />
      <ThresholdFrame />
      <CameraRig enabled={!debugMode} />
      {debugMode && <KeyframeAuthoringTool />}
      <StatsCollector />
    </Canvas>
  )
}
