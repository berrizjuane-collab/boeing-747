/**
 * Deterministic PRNG (mulberry32-family): visual QA and unit tests need the
 * exact same instance layout every run. Shared by every module that scatters
 * procedural instances — vegetation, forest, dust — so there's one seed
 * space and implementation instead of a copy per file (this exact function
 * used to be defined locally in RunwayEnvironment.tsx alone).
 */
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}
