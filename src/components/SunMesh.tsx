import { useFrame } from '@react-three/fiber'
import { forwardRef, useMemo, useRef } from 'react'
import { Color, Mesh, MeshBasicMaterial } from 'three'
import { duskColorMix, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

// NOT the real directional light's direction ([80,100,40] in
// EnvironmentPlaceholder.tsx) — checked the dot product of that direction
// against every section's camera forward vector (cameraPath.ts's
// KEYFRAMES) and it's >90° off-axis everywhere, S4 included, so a mesh
// placed there is never inside any camera's frustum and GodRays (which
// needs the sun mesh's screen-space position to radiate from) would have
// nothing to render — a wired-but-invisible effect. GodRays only mounts
// during S4 (PostFX.tsx's showGodRays), so this position only has to work
// for S4's two keyframes (camPos [0,41,-114]->[0,39,-110], camTarget
// [0,39,-102]->[0,38.5,-98], both looking almost straight down +z with a
// shallow, but *different*, downward pitch at each end: -9.4° at the first,
// -2.4° at the second. A first attempt split the difference (-2° pitch,
// same axis) and only worked at the very start of S4 — by the second
// keyframe that offset is nearly dead-center on-axis, i.e. almost exactly
// behind the opaque nose silhouette it's meant to clear, confirmed via the
// Fase 7 Playwright pass (visible warm streak at scroll 42%, gone by 44%).
// A +3° *upward* pitch (instead of splitting the difference) stays clearly
// above both keyframes' forward axis (12.5° off at the first, 5.4° at the
// second) rather than converging toward on-axis at either end, and a longer
// 300-unit throw (vs. 200) makes the projected screen position less
// sensitive to the small camera-position change across S4's short span.
const SUN_POSITION_S4: readonly [number, number, number] = [0, 56, 188]
// F3 (plan3.md): S4's position is hand-placed for that section's own two
// keyframes only (see the derivation above) and was never meant to hold for
// S6's much wider cinematic pull-back — checked against the real sunset
// HDRI sun direction (SUN_ANGLES.sunset, environmentTheme.ts) and that
// direction turns out to sit behind or to the side of the camera for most
// of S6's arc, so a physically-exact placement would be off-screen at the
// section's own canonical evidence frame (0.88, progress3.md's S6
// reference throughout B6/B7). Hand-placed for framing instead, same
// precedent as S4 above: verified in-frame (within the FOV half-angle) at
// keyframe 14 (0.88, camPos [-110,55,-20], ~13.5 deg off forward) and close
// to it at keyframe 15 (0.95, ~19 deg off, near the frame edge) — the two
// keyframes spanning S6's wide pull-back, not just one point.
const SUN_POSITION_S6: readonly [number, number, number] = [500, 120, -280]
const SUN_SECTION_SWITCH = SECTIONS[5].start // S6 start (0.82); opacity is
// still SUN_INTENSITY's low S4/S5 floor here, so a discrete position swap
// at this boundary doesn't pop.

const SUN_COLOR_DAY = new Color('#fff3dd')
// F3 (plan3.md): deeper/more saturated than the disc's daylight color so it
// keeps hue contrast against S6's own rendered sky — pixel-sampled at
// S6's evidence frame (0.88) and measured as a near-neutral pale
// ~#f0f4f5, far paler than SECTION_ENVIRONMENT's raw background swatch for
// that section once exposure/ACES have run (same finding documented next
// to RunwayEnvironment.tsx's cloud colors, which turned out invisible for
// the identical reason). The old #e89b6c blended into that pale sky at
// S6's own opacity ramp; this one still reads as "dusk sun", just further
// from the sky's own near-white value.
const SUN_COLOR_DUSK = new Color('#d97538')
const scratch = new Color()

// F3 (plan3.md): sunIntensityMultiplier's own S6 ramp is linear across the
// section (0.04 -> 1 from progress 0.82 to 0.95) and is deliberately left
// untouched here — thresholdLighting.ts documents it as "already tuned and
// verified" and nothing outside SunMesh reads it (checked: the real
// directional light's intensity comes from environmentTheme.ts's own
// per-section table instead, so this curve only ever drove this disc's
// alpha). At 0.88, that puts opacity at ~0.48 — plausible for a physical
// light easing back in, but a small stand-in disc at 48% alpha over a
// pale sky reads as barely-there (measured: its rendered pixel came back
// within ~2/255 of clear sky at that frame). This applies a front-loaded
// curve on top, S6-only (identical to the base curve for every progress
// value below SUN_SECTION_SWITCH, so S4/S5 — already verified in Fase
// 4/7 — render byte-for-byte as before): duskColorMix(progress) is the
// same 0->1 ramp fraction sunIntensityMultiplier uses internally for S6
// (both reduce to localProgress(progress, SECTIONS[5]) there), so raising
// it to a fractional power reaches strong opacity earlier in the section
// while keeping the exact same floor at 0.82 and ceiling at 0.95 — no pop
// at either seam.
const EXIT_OPACITY_GAMMA = 0.3
function sunMeshOpacity(progress: number): number {
  const base = sunIntensityMultiplier(progress)
  if (progress < SUN_SECTION_SWITCH) return base
  const floor = sunIntensityMultiplier(SUN_SECTION_SWITCH)
  const t = duskColorMix(progress)
  return floor + (1 - floor) * Math.pow(t, EXIT_OPACITY_GAMMA)
}

/**
 * Visible stand-in for EnvironmentPlaceholder.tsx's directional "sun" —
 * GodRays (PostFX.tsx) needs an actual mesh to project rays from, a light
 * alone doesn't have a screen-space position to render around. Reuses the
 * sun's own existing intensity/color curves (thresholdLighting.ts) instead
 * of a separate fade, so this stays in lockstep with the light it stands in
 * for rather than drifting out of sync with its own timing.
 */
export const SunMesh = forwardRef<Mesh>(function SunMesh(_props, ref) {
  // GodRays' light-source mesh (PostFX.tsx) requires transparent:true and
  // depthWrite:false ("must not write depth and has to be flagged as
  // transparent" — GodRaysEffect's own constructor docs).
  const material = useMemo(
    () => new MeshBasicMaterial({ color: SUN_COLOR_DAY, toneMapped: false, transparent: true, depthWrite: false }),
    [],
  )
  const meshRef = useRef<Mesh>(null)

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    material.opacity = sunMeshOpacity(progress)
    scratch.copy(SUN_COLOR_DAY).lerp(SUN_COLOR_DUSK, duskColorMix(progress))
    material.color.copy(scratch)
    if (meshRef.current) meshRef.current.position.fromArray(progress >= SUN_SECTION_SWITCH ? SUN_POSITION_S6 : SUN_POSITION_S4)
  })

  return (
    <mesh
      ref={(node) => {
        meshRef.current = node
        if (typeof ref === 'function') ref(node)
        else if (ref) ref.current = node
      }}
      position={SUN_POSITION_S4}
      material={material}
    >
      <sphereGeometry args={[18, 16, 16]} />
    </mesh>
  )
})
