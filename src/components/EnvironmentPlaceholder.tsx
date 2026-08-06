import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, DirectionalLight, FogExp2, PointLight } from 'three'
import { sampleEnvironmentColor } from '../lib/environmentTheme'
import { exposureMultiplier, sunIntensityMultiplier } from '../lib/thresholdLighting'
import { INTERIOR_ANCHORS_WORLD } from '../lib/sceneLayout'
import { SECTIONS } from '../lib/sections'
import { useScrollStore } from '../state/scrollStore'

const SUN_INTENSITY = 2
const CABIN_LIGHT_INTENSITY = 3.5
const SHADOW_SECTION_END = SECTIONS[1].end + 0.04

/**
 * Ground, per-section fog/background color (environmentTheme.ts), and the
 * Fase 4 threshold crossfade: the "sun" directional light fades out and a
 * warm cabin point light fades in across S4, so the light source itself
 * changes at the crossing — not just the fog tint. Renderer exposure ramps
 * down in the same window (thresholdLighting.ts) for the "contained cabin"
 * feel described in PLAN.md §3 S4.
 */
export function EnvironmentPlaceholder() {
  const { scene, gl } = useThree()
  const colorRef = useRef(new Color('#c9895b'))
  const sunRef = useRef<DirectionalLight>(null)
  const cabinLightRef = useRef<PointLight>(null)

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(colorRef.current.getHex(), 0.0035)

    const sun = sunRef.current
    if (sun) {
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 500
      sun.shadow.camera.left = -220
      sun.shadow.camera.right = 220
      sun.shadow.camera.top = 220
      sun.shadow.camera.bottom = -220
      sun.shadow.bias = -0.0005
      sun.shadow.normalBias = 0.02
    }
  }, [scene])

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    colorRef.current.copy(sampleEnvironmentColor(progress))
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(colorRef.current)
    }

    gl.toneMappingExposure = exposureMultiplier(progress)
    const sunFactor = sunIntensityMultiplier(progress)
    if (sunRef.current) {
      sunRef.current.intensity = SUN_INTENSITY * sunFactor
      // Shadow maps are useful for S1-S2's runway cue and needlessly expensive
      // once the aircraft has left the runway.
      sunRef.current.castShadow = progress < SHADOW_SECTION_END
    }
    if (cabinLightRef.current) cabinLightRef.current.intensity = CABIN_LIGHT_INTENSITY * (1 - sunFactor)
  })

  const cabinMid: [number, number, number] = [0, 40, (INTERIOR_ANCHORS_WORLD.cockpit[2] + INTERIOR_ANCHORS_WORLD.upperDeck[2]) / 2]

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3a3a', 1.2]} />
      <directionalLight ref={sunRef} position={[80, 100, 40]} color="#ffd6ad" intensity={SUN_INTENSITY} />
      <pointLight ref={cabinLightRef} position={cabinMid} intensity={0} distance={90} decay={1.4} color="#ffcf8f" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#3c4a3a" roughness={1} />
      </mesh>
    </>
  )
}
