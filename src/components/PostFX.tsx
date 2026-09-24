import { Bloom, DepthOfField, EffectComposer, FXAA, GodRays, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { SMAAPreset, type DepthOfFieldEffect, type GodRaysEffect } from 'postprocessing'
import { useRef, type JSX, type RefObject } from 'react'
import type { Mesh } from 'three'
import { ACTIVE_TONE_MAPPING_MODE } from '../lib/postFxConfig'
import { DEPTH_OF_FIELD, GOD_RAYS, cabinFocusDistance, effectMounted, effectWeight } from '../lib/postFxSchedule'
import { TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
import { useScrollStore } from '../state/scrollStore'
import { finishBloom, finishDoF, finishFull } from '../lib/qaConfig'
import { ExposurePass } from './ExposurePass'
import { SectionGrade } from './SectionGrade'

/**
 * `postprocessing` (pmndrs), not three.js's own bundled `EffectComposer` —
 * PLAN.md §7's explicit requirement, because this library merges every
 * effect below into as few actual shader passes as it can, where the
 * native one chains a full screen pass per effect. ACES Filmic runs as the
 * last effect in the chain (`<ToneMapping>`) rather than as a
 * `gl.toneMapping` renderer flag: mounting `<EffectComposer>` forces the
 * renderer to NoToneMapping internally (avoiding a double curve if both
 * applied), so the tone curve has to live here to keep applying at every
 * tier — §7.4 wants ACES "en todos los tiers", including the tone-mapping-only
 * floor tier below.
 *
 * Effect set per tier follows §7.1's table literally: Desktop High gets
 * everything (bloom, DoF, godrays as the enhancement §7.4 describes,
 * vignette, grain), the middle tier gets bloom+vignette only, the floor
 * tier gets tone mapping and nothing else. Grading (SectionGrade) and
 * exposure (ExposurePass) aren't tier-gated rows in that table — they're
 * cheap (one extra blended pass each, no extra render target) and part of
 * the site's baseline look at every tier, same reasoning as tone mapping
 * itself. ExposurePass specifically has to be here at all, in every branch,
 * because mounting this composer is what broke gl.toneMappingExposure in
 * the first place — see exposureState.ts.
 */
export function PostFX({ sunRef }: { sunRef: RefObject<Mesh | null> }) {
  const tier = useQualityStore((s) => s.tier)
  // Selecting the *boolean* rather than progress itself: zustand compares
  // what the selector returns, so this component re-renders exactly twice
  // per effect over the whole page instead of on every frame of scroll.
  // Strength and focus never go through props at all — changing a prop on a
  // postprocessing effect recreates it, which is the composer rebuild this
  // schedule exists to avoid — they are written to the live effects below.
  const showDoF = useScrollStore((s) => effectMounted(s.progress, DEPTH_OF_FIELD))
  const showGodRaysWindow = useScrollStore((s) => effectMounted(s.progress, GOD_RAYS))
  const dofRef = useRef<DepthOfFieldEffect>(null)
  const godRaysRef = useRef<GodRaysEffect>(null)
  const settings = TIER_SETTINGS[tier]

  useFrame(() => {
    const progress = useScrollStore.getState().progress
    const dof = dofRef.current
    if (dof) {
      dof.bokehScale = 1.8 * effectWeight(progress, DEPTH_OF_FIELD)
      // Focus tracks the subject of each cabin beat instead of sitting at a
      // fixed six metres, which focused past the instrument panel in the
      // cockpit and short of the aisle in economy (plan6 4.4).
      dof.circleOfConfusionMaterial.worldFocusDistance = cabinFocusDistance(progress)
    }
    const godRays = godRaysRef.current
    if (godRays) godRays.godRaysMaterial.weight = 0.35 * effectWeight(progress, GOD_RAYS)
  })

  if (settings.postProcessing === 'toneMappingOnly') {
    // FXAA stays in the composer's merged screen pass. SMAA needs extra
    // intermediate passes, so the floor tier keeps its draw-call budget
    // while still antialiasing moving silhouettes.
    return (
      <EffectComposer multisampling={0}>
        <ExposurePass />
        <SectionGrade />
        <ToneMapping mode={ACTIVE_TONE_MAPPING_MODE} />
        <FXAA />
      </EffectComposer>
    )
  }

  if (settings.postProcessing === 'bloomVignette') {
    // §7.1's table names exactly these two for the middle tier — no grain,
    // no DoF, no godrays.
    return (
      <EffectComposer multisampling={0}>
        <ExposurePass />
        <Bloom luminanceThreshold={2.5} luminanceSmoothing={0.25} mipmapBlur intensity={finishBloom ? 0.10 : 0} />
        <SectionGrade />
        <Vignette eskil={false} offset={0.15} darkness={finishFull ? 0.4 : 0} />
        <ToneMapping mode={ACTIVE_TONE_MAPPING_MODE} />
        <SMAA preset={SMAAPreset.MEDIUM} />
      </EffectComposer>
    )
  }

  // plan6 4.4: the mount window is strictly wider than each effect's own
  // ramp (postFxSchedule.ts), so the composer is only ever rebuilt while the
  // effect contributes nothing — and both edges sit where the camera is
  // slowest, not on the thresholds it is crossing.
  const showGodRays = showGodRaysWindow && sunRef.current !== null

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
    <Bloom key="bloom" luminanceThreshold={2.5} luminanceSmoothing={0.25} mipmapBlur intensity={finishBloom ? 0.10 : 0} />,
  ]
  if (showDoF && finishDoF) {
    // §3 S5 / §7.4: shallow DoF selling the corridor's scale, S5 (and
    // desktop-high) only. focusDistance/focalLength are normalized (0..1 of
    // the camera's near..far range), tuned for a close, corridor-scale
    // subject rather than derived from a real focal plane — same "loose,
    // tune after screenshots" status as this project's other hand-placed 3D
    // estimates (cameraPath.ts, Hotspots.tsx).
    // Round 5: focus expressed in world units (postprocessing's
    // worldFocusDistance/worldFocusRange) instead of the normalised
    // 0.015/0.03 pair — which, against this camera's near 0.1 / far 3000,
    // put the focal plane ~45 u down a 30 u cabin and blurred every seat,
    // panel and screen the camera actually dwells on. The focus distance
    // itself is driven per frame above; these are only its starting values.
    effects.push(<DepthOfField key="dof" ref={dofRef} worldFocusDistance={4} worldFocusRange={9} bokehScale={0} />)
  }
  if (showGodRays && sunRef.current && finishFull) {
    // §3 S4 / §7.4: "en el umbral", desktop-high enhancement only.
    effects.push(
      <GodRays
        key="godrays"
        ref={godRaysRef}
        sun={sunRef.current}
        exposure={0.22}
        decay={0.88}
        density={0.9}
        weight={0}
        samples={48}
        blur
      />,
    )
  }
  effects.push(
    <SectionGrade key="grade" />,
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={finishFull ? 0.4 : 0} />,
    <Noise key="noise" opacity={finishFull ? 0.018 : 0} premultiply />,
    <ToneMapping key="tonemap" mode={ACTIVE_TONE_MAPPING_MODE} />,
    // bug #6: multisampling={0} above + gl={{antialias:true}} on the canvas
    // (SceneCanvas.tsx) is inert once EffectComposer takes over the render
    // target — the site had no antialiasing of any kind. SMAA over MSAA:
    // multisampling would need the composer's multisampling prop instead
    // (a resolve cost on every intermediate pass, not just the last one),
    // and this project's aliasing case is specifically a bright, moving
    // silhouette against sky/fog — exactly SMAA's designed case. Preset
    // scales with tier headroom, same reasoning as DoF/godrays above.
    <SMAA key="smaa" preset={SMAAPreset.HIGH} />,
  )

  return <EffectComposer multisampling={0}>{effects}</EffectComposer>
}
