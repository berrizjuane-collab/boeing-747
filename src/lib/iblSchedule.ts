export type ProbeKey = 'golden' | 'highAltitude' | 'sunset' | 'cabin'

/**
 * plan6 4.3 (A14). Reflections had two owners: drei's `<Environment>` inside
 * EnvironmentPlaceholder and InteriorLighting's own PMREM fill, each writing
 * `scene.environment` without knowing about the other, and each switching on
 * a section index. This is the single schedule both now read.
 *
 * The hand-overs are placed at the physical crossings rather than at the
 * section boundaries: the cabin cannot own the aircraft's own reflections
 * while the camera is still outside looking at the hull, and the sunset
 * cannot take them back before the camera is through the door.
 */
export const PROBE_CROSSOVERS: readonly { at: number; to: ProbeKey }[] = [
  { at: 0.28, to: 'highAltitude' },
  // The nose skin is crossed at 0.46; the swap sits just inside it.
  { at: 0.455, to: 'cabin' },
  // The upper-deck door plane is crossed at 0.835.
  { at: 0.833, to: 'sunset' },
]

/** Width, in progress, of the intensity well centred on each crossover. */
export const CROSSOVER_HALF_WIDTH = 0.015
/** How far environment intensity dips at the exact hand-over. */
export const CROSSOVER_FLOOR = 0.45

export function activeProbe(progress: number): ProbeKey {
  let probe: ProbeKey = 'golden'
  for (const crossover of PROBE_CROSSOVERS) {
    if (progress >= crossover.at) probe = crossover.to
  }
  return probe
}

/**
 * A reflection probe is a single cubemap; swapping it is discrete however
 * slowly the sky behind it mixes. Rather than pretend otherwise, the swap is
 * staged: intensity dips into a short well, the probe changes at the bottom
 * of it, and intensity comes back. The reflection therefore changes where it
 * contributes least, which plan6 4.3 names as the alternative to blending
 * two probes per frame.
 */
export function probeIntensityScale(progress: number): number {
  let scale = 1
  for (const crossover of PROBE_CROSSOVERS) {
    const distance = Math.abs(progress - crossover.at)
    if (distance >= CROSSOVER_HALF_WIDTH) continue
    // Cosine well: 1 at the edges, CROSSOVER_FLOOR at the centre, with zero
    // slope at both so the dip cannot itself read as a step.
    const t = distance / CROSSOVER_HALF_WIDTH
    const well = CROSSOVER_FLOOR + (1 - CROSSOVER_FLOOR) * (0.5 - 0.5 * Math.cos(Math.PI * t))
    scale = Math.min(scale, well)
  }
  return scale
}
