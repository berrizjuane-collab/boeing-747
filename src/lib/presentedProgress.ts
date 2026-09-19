export const INTERIOR_HOLD = 0.41
/** One narrative integrator. Long background-tab deltas cannot skip the route. */
export function advanceProgress(current: number, target: number, delta: number, ready: boolean, reduced: boolean) {
  const goal = ready ? target : Math.min(target, INTERIOR_HOLD)
  if (reduced) return goal
  const next = current + (goal - current) * (1 - Math.exp(-Math.min(Math.max(delta, 0), 1 / 20) / 0.12))
  return Math.abs(goal - next) < 1e-6 ? goal : next
}
