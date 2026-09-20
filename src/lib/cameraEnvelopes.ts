import { SECTIONS } from './sections'

const S5 = SECTIONS[4]

// plan6 3.5 / A05. Progress rate, in units of progress per second, below
// which the visitor counts as stopped and above which the gait is at full
// amplitude. A reader holding still in a cabin dwell must not appear to be
// walking on the spot.
export const WALK_IDLE_RATE = 0.004
export const WALK_FULL_RATE = 0.03
/** Scroll over which the gait fades in at S5's edges, so it never switches on at a boundary. */
export const WALK_EDGE_FADE = 0.02

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Amplitude the walking sway should aim for, given where the visitor is and
 * how fast they are actually advancing. Separate from the rig so the rule
 * can be checked directly: standing still inside S5 must return zero, and
 * the boundaries must not step.
 */
export function walkSwayTarget(progress: number, progressRate: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0
  if (progress < S5.start || progress >= S5.end) return 0
  const advancing = smoothstep(WALK_IDLE_RATE, WALK_FULL_RATE, Math.abs(progressRate))
  const edge = Math.min(
    smoothstep(0, WALK_EDGE_FADE, progress - S5.start),
    smoothstep(0, WALK_EDGE_FADE, S5.end - progress),
  )
  return advancing * edge
}

/**
 * Frame-rate independent approach to a target. The delta is clamped so a
 * long background-tab frame cannot snap an envelope to its target in one
 * step — the same reasoning as presentedProgress.ts.
 */
export function approachEnvelope(current: number, target: number, delta: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-Math.min(Math.max(delta, 0), 0.05) / tau))
}
