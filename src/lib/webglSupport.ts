/**
 * PLAN.md §8.2: "Detección al boot (incluyendo `failIfMajorPerformanceCaveat`
 * para descartar renderers por software)." A throwaway canvas + context
 * request, not a feature-sniff on `window` — WebGL2 support is a runtime
 * property of what `getContext` actually hands back, and
 * `failIfMajorPerformanceCaveat` specifically rejects contexts the browser
 * would otherwise silently hand you backed by a software rasterizer (no
 * real GPU, or a blocklisted driver) — exactly the "renderers por software"
 * case the plan calls out, since a scene budgeted for a real GPU (§7)
 * running on one would be unusably slow rather than merely lower-tier.
 */
export function detectWebGL2Support(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    return gl !== null
  } catch {
    return false
  }
}
