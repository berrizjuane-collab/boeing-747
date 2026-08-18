// plan4.md 04-04/G2: mutable singleton (same pattern as exposureState.ts) —
// written once by TerrainGround.tsx's texture useMemo, read by
// StatsCollector.tsx into window.__MERIDIAN_PERF__ so visual QA can measure
// the real generation hitch instead of trusting the plan3.md §3.2 estimate
// (80-200ms, scaled from aircraftSurfaceMaps.ts's 64² profile) unverified.
export const terrainGenerationStats: { lastGenerationMs: number | null } = {
  lastGenerationMs: null,
}
