// PLAN.md §10.4's honest caveat: drei's useProgress (THREE.DefaultLoadingManager)
// reports *items loaded / items total*, not bytes — an 8MB HDRI and a 2KB
// JSON count identically, so the bar jumps unevenly as different-sized
// assets finish. Mitigation per the plan: a map of expected byte weight per
// asset, used to weight each completion instead of counting it as 1/N.
//
// Only the S0-blocking set (PLAN.md §6.4: exterior + all three HDRIs — see
// EnvironmentPlaceholder.tsx's useLoader call) is listed here. interior.glb
// is preloaded (InteriorAsset.tsx's useGLTF.preload, fired at module import
// time) so THREE.DefaultLoadingManager tracks it too, but it's a streamed,
// non-blocking S1-S3 asset by design (§6.4) — including it here would make
// the loading screen wait on an asset the app was never actually gating on.
//
// Sizes are measured (`ls -la public/models public/hdri`), not estimated.
export const BLOCKING_ASSET_WEIGHTS: Record<string, number> = {
  '/models/exterior.glb': 2_213_004,
  '/hdri/golden-hour.hdr': 3_198_560,
  '/hdri/high-altitude.hdr': 855_629,
  '/hdri/sunset.hdr': 2_488_147,
}

export const BLOCKING_TOTAL_WEIGHT = Object.values(BLOCKING_ASSET_WEIGHTS).reduce((sum, w) => sum + w, 0)

/** Matches by suffix, not exact equality: loaders may register the item
 * with an absolute, origin-qualified URL rather than the relative path this
 * app requests it with. */
export function weightForItem(url: string): number {
  const key = Object.keys(BLOCKING_ASSET_WEIGHTS).find((k) => url.endsWith(k))
  return key ? BLOCKING_ASSET_WEIGHTS[key] : 0
}
