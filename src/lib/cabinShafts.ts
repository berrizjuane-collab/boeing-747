/**
 * plan6 5.4 — the geometry of the cabin light shafts, separated from the
 * component so the one claim that matters can be checked directly: a beam
 * has to stop at the floor of the deck it belongs to.
 *
 * The previous implementation used a single authored length for all
 * thirty-three windows. A main-deck window sits 1.40 above its floor and a
 * 4.6-unit beam dropping at 0.62 rad reaches the floor after 2.41, so every
 * beam continued more than two units through the cabin floor — visible from
 * the deck below and from outside the hull.
 */
export const SHAFT_DROP_ANGLE = 0.62
export const SHAFT_WIDTH = 0.72
export const MAIN_DECK_FLOOR = 0
export const UPPER_DECK_FLOOR = 2.45
/** Cabin-space height above which a window belongs to the upper deck. */
export const UPPER_DECK_WINDOW_Y = 3
/** Fraction of the drop to the floor a beam actually travels. */
export const SHAFT_FLOOR_SHARE = 0.92

export function deckFloorFor(windowY: number): number {
  return windowY >= UPPER_DECK_WINDOW_Y ? UPPER_DECK_FLOOR : MAIN_DECK_FLOOR
}

/** Length of the beam from the pane, along its own axis. */
export function shaftLength(windowY: number): number {
  const drop = Math.max(0.4, windowY - deckFloorFor(windowY))
  return (drop / Math.sin(SHAFT_DROP_ANGLE)) * SHAFT_FLOOR_SHARE
}

/** How far above its deck's floor the beam ends. Negative means it goes through. */
export function shaftFloorClearance(windowY: number): number {
  const end = windowY - shaftLength(windowY) * Math.sin(SHAFT_DROP_ANGLE)
  return end - deckFloorFor(windowY)
}
