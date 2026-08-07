import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ExposureEffect } from '../lib/exposureEffect'
import { exposureState } from '../state/exposureState'

/** See exposureState.ts. Mounted inside PostFX.tsx's <EffectComposer>. */
export function ExposurePass() {
  const effect = useMemo(() => new ExposureEffect(), [])

  useEffect(() => () => effect.dispose(), [effect])

  useFrame(() => {
    const uniform = effect.uniforms.get('exposureValue')
    if (uniform) uniform.value = exposureState.value
  })

  return <primitive object={effect} dispose={null} />
}
