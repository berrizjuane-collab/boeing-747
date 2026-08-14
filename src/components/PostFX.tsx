import { Bloom, DepthOfField, EffectComposer, GodRays, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { SMAAPreset, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import { useRef, type JSX, type RefObject } from 'react'
import type { Mesh } from 'three'
import { TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { imagePipelineDiagnostics } from '../state/imagePipelineDiagnostics'
import { useScrollStore } from '../state/scrollStore'
import { ExposurePass } from './ExposurePass'
import { SectionGrade } from './SectionGrade'

const THRESHOLD_SECTION_INDEX = 3 // S4
const INTERIOR_SECTION_INDEX = 4 // S5

/**
 * `postprocessing` (pmndrs), not three.js's own bundled `EffectComposer` —
 * PLAN.md §7's explicit requirement, because this library merges every
 * effect below into as few actual shader passes as it can, where the
 * native one chains a full screen pass per effect. ACES Filmic runs as the
 * explicit `ToneMappingMode.ACES_FILMIC` effect rather than a renderer flag:
 * mounting `<EffectComposer>` forces the renderer to NoToneMapping internally
 * (avoiding a double curve if both applied), so the tone curve has to live
 * here at every tier. SectionGrade follows it intentionally and therefore
 * operates on display-range values instead of applying LDR thresholds to HDR.
 *
 * Effect set per tier follows §7.1's table literally: Desktop High gets
 * everything (bloom, DoF, godrays as the enhancement §7.4 describes,
 * vignette, grain), the middle tier gets bloom+vignette only, the floor
 * tier gets tone mapping plus baseline SMAA. Grading (SectionGrade) and
 * exposure (ExposurePass) aren't tier-gated rows in that table — they're
 * cheap (one extra blended pass each, no extra render target) and part of
 * the site's baseline look at every tier, same reasoning as tone mapping
 * itself. SMAA is the explicit AA path because the composer's render targets
 * bypass the canvas context's antialiasing. ExposurePass has to be here at all,
 * because mounting this composer is what broke gl.toneMappingExposure in
 * the first place — see exposureState.ts.
 */
function AcesToneMapping() {
  const effectRef = useRef<ToneMappingEffect>(null)
  useFrame(() => {
    const mode = effectRef.current?.mode ?? null
    imagePipelineDiagnostics.toneMappingMode = mode
    imagePipelineDiagnostics.toneMappingModeName = mode === ToneMappingMode.ACES_FILMIC ? 'ACES_FILMIC' : `unexpected:${mode}`
  })
  return <ToneMapping ref={effectRef} mode={ToneMappingMode.ACES_FILMIC} />
}

function PipelineAntialiasing({ disabled, preset, label }: { disabled: boolean; preset: SMAAPreset; label: string }) {
  imagePipelineDiagnostics.antialiasing = disabled ? 'disabled-for-qa' : 'SMAA'
  imagePipelineDiagnostics.antialiasingPreset = disabled ? null : label
  if (disabled) return null
  return <SMAA preset={preset} />
}

export function PostFX({ sunRef }: { sunRef: RefObject<Mesh | null> }) {
  const tier = useQualityStore((s) => s.tier)
  const activeIndex = useScrollStore((s) => s.activeIndex)
  const settings = TIER_SETTINGS[tier]
  const aaDisabledForQa = new URLSearchParams(window.location.search).get('aa') === 'off'
  const smaaPreset = tier === 'high' ? SMAAPreset.HIGH : tier === 'mid' ? SMAAPreset.MEDIUM : SMAAPreset.LOW
  const smaaLabel = tier === 'high' ? 'HIGH' : tier === 'mid' ? 'MEDIUM' : 'LOW'

  if (settings.postProcessing === 'toneMappingOnly') {
    return (
      <EffectComposer multisampling={0}>
        <ExposurePass />
        <AcesToneMapping />
        <SectionGrade />
        <PipelineAntialiasing disabled={aaDisabledForQa} preset={smaaPreset} label={smaaLabel} />
      </EffectComposer>
    )
  }

  if (settings.postProcessing === 'bloomVignette') {
    // §7.1's table names exactly these two for the middle tier — no grain,
    // no DoF, no godrays.
    return (
      <EffectComposer multisampling={0}>
        <ExposurePass />
        <Bloom luminanceThreshold={0.8} luminanceSmoothing={0.25} mipmapBlur intensity={0.6} />
        <AcesToneMapping />
        <SectionGrade />
        <Vignette eskil={false} offset={0.15} darkness={0.6} />
        <PipelineAntialiasing disabled={aaDisabledForQa} preset={smaaPreset} label={smaaLabel} />
      </EffectComposer>
    )
  }

  const showDoF = activeIndex === INTERIOR_SECTION_INDEX
  const showGodRays = activeIndex === THRESHOLD_SECTION_INDEX && sunRef.current !== null

  // EffectComposerProps.children is typed JSX.Element | JSX.Element[] — no
  // booleans/null, and no mixing bare elements with a nested array either
  // (TS rejects that shape against the union). Building one flat array for
  // the whole tier's effect list, DoF/GodRays included only when true,
  // sidesteps both.
  const effects: JSX.Element[] = [
    <ExposurePass key="exposure" />,
    // §7.4: threshold high so only real highlights bloom, mipmap blur
    // because it's the cheaper of the two implementations the effect
    // offers for the same look.
    <Bloom key="bloom" luminanceThreshold={0.8} luminanceSmoothing={0.25} mipmapBlur intensity={0.6} />,
  ]
  if (showDoF) {
    // §3 S5 / §7.4: shallow DoF selling the corridor's scale, S5 (and
    // desktop-high) only. focusDistance/focalLength are normalized (0..1 of
    // the camera's near..far range), tuned for a close, corridor-scale
    // subject rather than derived from a real focal plane — same "loose,
    // tune after screenshots" status as this project's other hand-placed 3D
    // estimates (cameraPath.ts, Hotspots.tsx).
    effects.push(<DepthOfField key="dof" focusDistance={0.015} focalLength={0.03} bokehScale={3} />)
  }
  if (showGodRays && sunRef.current) {
    // §3 S4 / §7.4: "en el umbral", desktop-high enhancement only.
    effects.push(
      <GodRays
        key="godrays"
        sun={sunRef.current}
        exposure={0.22}
        decay={0.88}
        density={0.9}
        weight={0.35}
        samples={48}
        blur
      />,
    )
  }
  effects.push(
    <AcesToneMapping key="tonemap" />,
    <SectionGrade key="grade" />,
    <PipelineAntialiasing key="smaa" disabled={aaDisabledForQa} preset={smaaPreset} label={smaaLabel} />,
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={0.6} />,
    <Noise key="noise" opacity={0.035} premultiply />,
  )

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>
}
