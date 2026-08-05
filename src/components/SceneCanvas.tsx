import { Canvas } from '@react-three/fiber'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { AircraftPlaceholder } from './AircraftPlaceholder'
import { CameraRig } from './CameraRig'
import { EnvironmentPlaceholder } from './EnvironmentPlaceholder'
import { StatsCollector } from './StatsCollector'
import { KeyframeAuthoringTool } from '../dev/KeyframeAuthoringTool'

export function SceneCanvas({ debugMode }: { debugMode: boolean }) {
  return (
    <Canvas
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
      <EnvironmentPlaceholder />
      <AircraftPlaceholder />
      <CameraRig enabled={!debugMode} />
      {debugMode && <KeyframeAuthoringTool />}
      <StatsCollector />
    </Canvas>
  )
}
