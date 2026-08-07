// Plain mutable module state (same reasoning as loadingState.ts): written
// every frame by EnvironmentPlaceholder.tsx, read every frame by
// ExposurePass.tsx. Exists because mounting <EffectComposer> (PostFX.tsx)
// forces gl.toneMapping to NoToneMapping for as long as it's mounted —
// three.js's tonemapping_fragment shader chunk is a no-op under
// NoToneMapping, so gl.toneMappingExposure (which EnvironmentPlaceholder
// used to drive directly) silently stopped doing anything the moment Fase 7
// added post-processing. ExposurePass.tsx is a real post-process pass that
// picks the job back up.
export const exposureState: { value: number } = {
  value: 1,
}
