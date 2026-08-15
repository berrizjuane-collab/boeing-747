import { Bloom, DepthOfField, EffectComposer, GodRays, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { SMAAPreset } from 'postprocessing'
import type { JSX, RefObject } from 'react'
import type { Mesh } from 'three'
import { ACTIVE_TONE_MAPPING_MODE } from '../lib/postFxConfig'
import { TIER_SETTINGS, useQualityStore } from '../state/qualityStore'
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
  const activeIndex = useScrollStore((s) => s.activeIndex)
  const settings = TIER_SETTINGS[tier]

  if (settings.postProcessing === 'toneMappingOnly') {
    // No <SMAA> here: SMAA is a real multi-pass technique (edge detection +
    // blend weights + neighborhood blend), not something `postprocessing`
    // can fold into the single blended pass the other effects below share —
    // measured at +3 draw calls (Mobile Low hero 8->11), which pushed past
    // Fase 0 item 02's own already-verified ≤10 target even though it's
    // nowhere near the real <100 tier ceiling (plan3.md §6). This tier is
    // deliberately "tone mapping and nothing else" (PLAN.md §7.1) for the
    // weakest hardware the site targets; keeping that floor tier's Fase 0
    // number intact won over paying for AA on exactly the devices this
    // budget exists to protect.
    return (
      <EffectComposer multisampling={0}>
        <ExposurePass />
        <SectionGrade />
        <ToneMapping mode={ACTIVE_TONE_MAPPING_MODE} />
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
        <SectionGrade />
        <Vignette eskil={false} offset={0.15} darkness={0.6} />
        <ToneMapping mode={ACTIVE_TONE_MAPPING_MODE} />
        <SMAA preset={SMAAPreset.MEDIUM} />
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
    <SectionGrade key="grade" />,
    <Vignette key="vignette" eskil={false} offset={0.15} darkness={0.6} />,
    <Noise key="noise" opacity={0.035} premultiply />,
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
