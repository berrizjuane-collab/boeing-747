// Plain mutable module state (same reasoning as loadingState.ts / perfStats.ts):
// written once when interior.glb finishes loading, read every frame from
// InteriorLoadGuardrail.tsx's rAF loop.
export const interiorLoadState: { loaded: boolean } = {
  loaded: false,
}
