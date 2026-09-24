/** The auto tier reacts to sustained frame-time pressure, not one hitch. */
export function shouldDowngradeTier(frameTimesMs: readonly number[], thresholdMs = 20): boolean {
  const samples = frameTimesMs.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  if (samples.length < 12) return false
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
  return p95 > thresholdMs
}
