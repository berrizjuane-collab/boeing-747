import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Color } from 'three'
import { SectionGradeEffect } from '../lib/sectionGradeEffect'
import { sampleSectionGrade } from '../lib/sectionGrading'
import { imagePipelineDiagnostics } from '../state/imagePipelineDiagnostics'
import { useScrollStore } from '../state/scrollStore'

/** PLAN.md §10.1 grading, mounted inside PostFX.tsx's <EffectComposer>. */
export function SectionGrade() {
  const effect = useMemo(() => new SectionGradeEffect(), [])

  useEffect(() => () => effect.dispose(), [effect])

  useFrame(() => {
    const grade = sampleSectionGrade(useScrollStore.getState().progress)
    const shadowUniform = effect.uniforms.get('shadowColor')
    const highlightUniform = effect.uniforms.get('highlightColor')
    const strengthUniform = effect.uniforms.get('strength')
    if (shadowUniform) (shadowUniform.value as Color).set(grade.shadow)
    if (highlightUniform) (highlightUniform.value as Color).set(grade.key)
    if (strengthUniform) strengthUniform.value = grade.strength
    imagePipelineDiagnostics.gradingStrength = grade.strength
    imagePipelineDiagnostics.gradingHighlightKey = grade.key
  })

  return <primitive object={effect} dispose={null} />
}
