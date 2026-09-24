export type ProbeKey = 'golden' | 'highAltitude' | 'sunset' | 'cabin'

/**
 * plan6 4.3 (A14). Reflections had two owners: drei's `<Environment>` inside
 * EnvironmentPlaceholder and InteriorLighting's own PMREM fill, each writing
 * `scene.environment` without knowing about the other, and each switching on
 * a section index. This is the single schedule both now read.
 *
 * Every hand-over is a blend between the two probes, not a swap. The earlier
 * version swapped the cubemap at the bottom of an intensity well that only
 * dipped to 45 %: a frame-by-frame sweep still showed the tail turning from
 * gold to blue between 0.279 and 0.280, and the cockpit going from sky-blue
 * to warm brown between 0.454 and 0.456. EnvironmentPlaceholder renders the
 * two equirectangular sources mixed by `weight` and convolves that, so the
 * lighting moves continuously instead of stepping.
 *
 * The windows sit on the physical crossings, measured from the camera path
 * (tests/plan6-fase4): the nose skin is crossed at 0.420 and the upper-deck
 * door plane at 0.833. The cabin blend starts once the camera is inside the
 * hull, so the sky can no longer tint the flight deck after the crossing and
 * the cabin fill never lights the aircraft from outside.
 */
export interface ProbeCrossover {
  at: number
  to: ProbeKey
  /** Half the width, in progress, over which the two probes are mixed. */
  halfWidth: number
}

export const PROBE_CROSSOVERS: readonly ProbeCrossover[] = [
  { at: 0.28, to: 'highAltitude', halfWidth: 0.02 },
  { at: 0.435, to: 'cabin', halfWidth: 0.01 },
  { at: 0.834, to: 'sunset', halfWidth: 0.008 },
]

const FIRST_PROBE: ProbeKey = 'golden'

export interface ProbeBlend {
  from: ProbeKey
  to: ProbeKey
  /** 0 = only `from`, 1 = only `to`. */
  weight: number
}

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** The two probes contributing at `progress` and how far the blend has gone. */
export function probeBlend(progress: number): ProbeBlend {
  let current: ProbeKey = FIRST_PROBE
  for (const crossover of PROBE_CROSSOVERS) {
    const start = crossover.at - crossover.halfWidth
    const end = crossover.at + crossover.halfWidth
    if (progress < start) break
    if (progress < end) return { from: current, to: crossover.to, weight: smoothstep(start, end, progress) }
    current = crossover.to
  }
  return { from: current, to: current, weight: 0 }
}

/** The probe that dominates at `progress` (the blend's nearer end). */
export function activeProbe(progress: number): ProbeKey {
  const blend = probeBlend(progress)
  return blend.weight < 0.5 ? blend.from : blend.to
}
