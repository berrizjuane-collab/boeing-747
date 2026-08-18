/**
 * Deterministic PRNG: visual QA receives the same vegetation and dust every
 * run. plan4.md bug #16: this used to live private inside
 * RunwayEnvironment.tsx (§1.1) — extracted verbatim, same algorithm, same
 * call sites, so existing grass/dust placement doesn't shift by refactor.
 * Shared here because terrainField.ts (the terrain/grass/forest density
 * field) needs the identical generator, not a second one that happens to
 * look similar.
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
