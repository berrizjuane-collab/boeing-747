import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type { Color } from 'three'
import { SectionGradeEffect } from '../lib/sectionGradeEffect'
import { sampleSectionGrade } from '../lib/sectionGrading'
import { gradingQaState } from '../state/gradingQaState'
import { imagePipelineDiagnostics } from '../state/imagePipelineDiagnostics'
import { useScrollStore } from '../state/scrollStore'

/** PLAN.md §10.1 grading, mounted inside PostFX.tsx's <EffectComposer>. */
export function SectionGrade() {
  const effect = useMemo(() => new SectionGradeEffect(), [])
  const exposeQaBridge = useMemo(() => new URLSearchParams(window.location.search).has('grade-qa'), [])

  useEffect(() => () => effect.dispose(), [effect])
  useEffect(() => {
    if (!exposeQaBridge) return
    window.__MERIDIAN_GRADE_QA__ = {
      setEnabled: (enabled) => {
        gradingQaState.enabled = enabled
      },
    }
    return () => {
      gradingQaState.enabled = true
      delete window.__MERIDIAN_GRADE_QA__
    }
  }, [exposeQaBridge])

  useFrame(() => {
    const grade = sampleSectionGrade(useScrollStore.getState().progress)
    const effectiveStrength = gradingQaState.enabled ? grade.strength : 0
    const shadowUniform = effect.uniforms.get('shadowColor')
    const highlightUniform = effect.uniforms.get('highlightColor')
    const strengthUniform = effect.uniforms.get('strength')
    if (shadowUniform) (shadowUniform.value as Color).set(grade.shadow)
    if (highlightUniform) (highlightUniform.value as Color).set(grade.key)
    if (strengthUniform) strengthUniform.value = effectiveStrength
    imagePipelineDiagnostics.gradingStrength = effectiveStrength
    imagePipelineDiagnostics.gradingHighlightKey = grade.key
  })

  return <primitive object={effect} dispose={null} />
}
