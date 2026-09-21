import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { PAPI_BANKS, papiSignal } from '../lib/approachLights'

const COLORS = { white: new Color('#fff5df'), red: new Color('#e32c21'), off: new Color('#171b20') }
export function ApproachLights() {
  const bodies = useRef<InstancedMesh>(null)
  const lenses = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const dummy = new Object3D()
    PAPI_BANKS.forEach(bank => bank.xs.forEach((x, i) => {
      const index = (bank.direction === 1 ? 0 : 4) + i
      dummy.position.set(x, .7, bank.z)
      dummy.scale.set(1, .7, .8)
      dummy.updateMatrix(); bodies.current?.setMatrixAt(index, dummy.matrix)
      dummy.position.z += bank.direction * .42
      dummy.scale.set(.75, .25, .06)
      dummy.updateMatrix(); lenses.current?.setMatrixAt(index, dummy.matrix)
    }))
    for (const mesh of [bodies.current, lenses.current]) if (mesh) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere() }
  }, [])
  useFrame(({ camera }) => {
    const mesh = lenses.current
    if (!mesh) return
    const eye = [camera.position.x, camera.position.y, camera.position.z]
    PAPI_BANKS.forEach(bank => bank.xs.forEach((_, i) => mesh.setColorAt((bank.direction === 1 ? 0 : 4) + i, COLORS[papiSignal(eye, bank, i)])))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <group name="Airport · PAPI">
    <instancedMesh ref={bodies} args={[undefined, undefined, 8]}><boxGeometry /><meshStandardMaterial color="#b9b9ad" roughness={.8} /></instancedMesh>
    <instancedMesh ref={lenses} args={[undefined, undefined, 8]}><boxGeometry /><meshBasicMaterial toneMapped={false} /></instancedMesh>
  </group>
}
