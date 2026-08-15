import { ToneMappingMode } from 'postprocessing'

// plan3.md bug #1: `postprocessing`'s ToneMappingEffect constructor defaults
// to `ToneMappingMode.AGX` (its own JSDoc claims ACES_FILMIC, but the actual
// destructuring default is AgX — verified by reading build/index.js, not the
// stale .d.ts comment), while this project's own docs (PLAN.md §7.4,
// PostFX.tsx's top comment) declare ACES Filmic. Set explicitly here, once,
// so the declared and effective curves can't drift apart again — PostFX.tsx
// applies this value, StatsCollector.tsx reports it in the same
// window.__MERIDIAN_PERF__ snapshot visual QA already reads, so "the curve
// applied is the one declared" is something a capture can assert instead of
// something the code merely claims.
export const ACTIVE_TONE_MAPPING_MODE = ToneMappingMode.ACES_FILMIC
export const ACTIVE_TONE_MAPPING_LABEL = 'ACES_FILMIC'
