import { useFrame } from '@react-three/fiber'
import { forwardRef, useMemo, useRef, useImperativeHandle } from 'react'
import { Color, Mesh, MeshBasicMaterial } from 'three'
import { duskColorMix, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { sampleEnvironmentTheme } from '../lib/environmentTheme'
import { useScrollStore } from '../state/scrollStore'

// Small distant source aligned with the same HDRI/key-light direction.
// No second oversized sun placed in front of the camera just to force glare.
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
  const meshRef = useRef<Mesh>(null)
  useImperativeHandle(ref, () => meshRef.current!, [])
  // GodRays' light-source mesh (PostFX.tsx) requires transparent:true and
  // depthWrite:false ("must not write depth and has to be flagged as
  // transparent" — GodRaysEffect's own constructor docs).
  const material = useMemo(
    () => new MeshBasicMaterial({ color: SUN_COLOR_DAY, toneMapped: false, transparent: true, depthWrite: false }),
    [],
  )

  useFrame(({ camera }) => {
    const { progress } = useScrollStore.getState()
    const direction = sampleEnvironmentTheme(progress).lightPositions.key
    if (meshRef.current) meshRef.current.position.fromArray(direction).normalize().multiplyScalar(900).add(camera.position)
    material.opacity = sunIntensityMultiplier(progress)
    scratch.copy(SUN_COLOR_DAY).lerp(SUN_COLOR_DUSK, duskColorMix(progress))
    material.color.copy(scratch)
  })

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[4.2, 16, 16]} />
    </mesh>
  )
})
