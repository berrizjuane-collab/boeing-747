/**
 * plan6 4.1/4.2 (A13). The aerodrome used to switch off at 30.5% of scroll
 * and the ground plane crossfaded out just before it: the world disappeared
 * because a number said so, with nothing on screen to account for it.
 *
 * What replaces it is an occluder. A cloud deck builds in as the aircraft
 * climbs past it, so the ground goes away because something is in front of
 * it — visible, reversible, and identical in both scroll directions. The
 * expensive ground detail is culled only once that deck is opaque enough to
 * hide it, which makes the budget a consequence of the picture rather than
 * the other way round.
 *
 * The scene's vertical scale is compressed: the aircraft cruises about 31
 * units above its own runway and is 72 units long, so this reads as low
 * stratus over an aerodrome rather than as cruise altitude. That is the
 * scale the rest of the project is authored at and this layer matches it
 * instead of pretending otherwise.
 */

/** Height of the deck, between the runway and the aircraft's cruise height. */
export const UNDERCAST_Y = 14
/**
 * Aircraft altitude, above the runway, at which the deck starts to build —
 * comfortably above the deck itself, so it is closing *under* the aircraft
 * rather than around it.
 */
export const UNDERCAST_FADE_START = 15
/**
 * Aircraft altitude at which it is fully closed. The takeoff reaches 31.4.
 * 17→27 closed the deck over 1.8 % of the page (0.2465–0.2645), which a
 * frame-by-frame sweep read as the runway turning into cloud almost at once;
 * 15→30.5 spreads the same closing over 3 % (0.2435–0.273).
 */
export const UNDERCAST_FADE_END = 30.5
/** Deck opacity past which the aerodrome's fine detail is no longer visible through it. */
export const DETAIL_CULL_OPACITY = 0.98

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/** How closed the cloud deck is, as a function of how high the aircraft has climbed. */
export function undercastOpacity(aircraftAltitude: number): number {
  return smoothstep(UNDERCAST_FADE_START, UNDERCAST_FADE_END, aircraftAltitude)
}

/**
 * Whether grass, forest, dust and buildings still need drawing. They are
 * beneath the deck, so this is a visibility answer and a budget answer at
 * once — and unlike the old gate it cannot hide anything the camera could
 * otherwise still see.
 */
export function aerodromeDetailVisible(deckOpacity: number): boolean {
  return deckOpacity < DETAIL_CULL_OPACITY
}

/**
 * The terrain disc itself is one draw call and always drawn: culling it
 * would put sky behind any thin patch of the deck, and keeping it costs
 * far less than the artefact would.
 */
export const TERRAIN_ALWAYS_VISIBLE = true
