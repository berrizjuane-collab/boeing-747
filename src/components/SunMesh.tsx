import { useFrame } from '@react-three/fiber'
import { forwardRef, useMemo } from 'react'
import { Color, Mesh, MeshBasicMaterial } from 'three'
import { duskColorMix, sunIntensityMultiplier } from '../lib/thresholdLighting'
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
const SUN_POSITION: [number, number, number] = [0, 56, 188]

const SUN_COLOR_DAY = new Color('#fff3dd')
const SUN_COLOR_DUSK = new Color('#e89b6c')
const scratch = new Color()

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

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    material.opacity = sunIntensityMultiplier(progress)
    scratch.copy(SUN_COLOR_DAY).lerp(SUN_COLOR_DUSK, duskColorMix(progress))
    material.color.copy(scratch)
  })

  return (
    <mesh ref={ref} position={SUN_POSITION} material={material}>
      <sphereGeometry args={[18, 16, 16]} />
    </mesh>
  )
})
