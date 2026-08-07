// Plain mutable module state, not Zustand — same reasoning as perfStats.ts:
// written once (when S0 finishes) and read every frame from
// EnvironmentPlaceholder's useFrame, never through React, so a store with
// subscriptions would just be overhead neither side needs.
export const loadingState: { revealStartSeconds: number | null } = {
  revealStartSeconds: null,
}
