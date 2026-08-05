import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Color, FogExp2 } from 'three'
import { sampleEnvironmentColor } from '../lib/environmentTheme'
import { useScrollStore } from '../state/scrollStore'

/** Ground plane + a background/fog color that crossfades per section — see environmentTheme.ts. */
export function EnvironmentPlaceholder() {
  const { scene } = useThree()
  const colorRef = useRef(new Color('#c9895b'))

  useEffect(() => {
    scene.background = colorRef.current
    scene.fog = new FogExp2(colorRef.current.getHex(), 0.0035)
  }, [scene])

  useFrame(() => {
    const { progress } = useScrollStore.getState()
    colorRef.current.copy(sampleEnvironmentColor(progress))
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.copy(colorRef.current)
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#3a3a3a', 1.2]} />
      <directionalLight position={[80, 100, 40]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[4000, 4000]} />
        <meshStandardMaterial color="#3c4a3a" roughness={1} />
      </mesh>
    </>
  )
}
