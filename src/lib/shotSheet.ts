import { SECTIONS } from './sections'

export type InteriorZoneKey = 'cockpit' | 'economy' | 'stair' | 'upperDeck'

/**
 * What a shot is doing, in the vocabulary plan6 3.1 asks the sheet to
 * distinguish: normal advance, editorial pause, turn and retreat.
 * `threshold` is an advance the narrative deliberately crawls through.
 */
export type ShotIntent = 'drift' | 'track' | 'turn' | 'approach' | 'threshold' | 'dwell' | 'retreat' | 'settle'

export interface Shot {
  id: string
  intent: ShotIntent
  /** What the frame is about. */
  subject: string
  /** How it is composed, in words a capture can be checked against. */
  framing: string
  fromIndex: number
  toIndex: number
  zone?: InteriorZoneKey
  /**
   * Peak bank, in degrees, raised and lowered across this shot. Authored per
   * shot rather than per keyframe so the roll follows the turn it belongs to
   * instead of whatever scroll its keyframe pair happens to receive.
   */
  bankDegrees?: number
  /**
   * Scroll position this shot must end at. Present only where the narrative
   * pins it: section boundaries, the two cabin-route seams, and the interior
   * zone timing the overlay copy is written against. Everything else is
   * allocated by traversal cost, so a long turn is never given the same
   * scroll as a three-metre reposition (plan6 3.2).
   */
  authoredEnd?: number
}

const INTERIOR_SECTION = SECTIONS[4]
const interiorTime = (local: number) =>
  INTERIOR_SECTION.start + (INTERIOR_SECTION.end - INTERIOR_SECTION.start) * local

/** Distance, in world units, that one radian of look-direction change is worth. */
export const ROTATION_COST_PER_RADIAN = 45

/**
 * plan6 3.1 — the shot sheet. One row per authored move, each declaring its
 * intent, subject, framing and physical extent. Timing is not in this table
 * except where the narrative pins it; the rest is derived from the route's
 * own length and rotation so re-authoring geometry re-times the shot instead
 * of silently changing its speed.
 */
export const SHOT_SHEET: readonly Shot[] = [
  {
    id: 'S1-hero-drift',
    intent: 'drift',
    subject: 'The parked aircraft, three-quarter front-low.',
    framing: 'Aircraft left of centre, runway leading into frame, copy holds the right third.',
    fromIndex: 0,
    toIndex: 1,
    authoredEnd: SECTIONS[0].end,
  },
  {
    id: 'S2-lateral-track',
    intent: 'track',
    subject: 'Ground roll seen from outside the wingtip.',
    framing: 'Full aircraft length in frame, horizon low, camera rising with the climb-out.',
    fromIndex: 1,
    toIndex: 2,
  },
  {
    id: 'S2-climb-out',
    intent: 'track',
    subject: 'Rotation and initial climb.',
    framing: 'Aircraft rising through the upper half, aerodrome receding underneath.',
    fromIndex: 2,
    toIndex: 3,
    authoredEnd: SECTIONS[1].end,
  },
  {
    id: 'S3-bank-entry',
    intent: 'track',
    subject: 'Settling into the climb before the orbit begins.',
    framing: 'Rear-lateral three-quarter, banked horizon entering.',
    fromIndex: 3,
    toIndex: 4,
  },
  {
    id: 'S3-orbit',
    intent: 'turn',
    subject: 'The long arc from rear-lateral round to head-on.',
    framing: 'Aircraft held near frame centre through the whole turn; the sky does the moving.',
    fromIndex: 4,
    toIndex: 5,
    bankDegrees: 6,
  },
  {
    id: 'S3-nose-run-in',
    intent: 'approach',
    subject: 'Closing head-on toward the nose.',
    framing: 'Nose centred and growing; fuselage symmetrical about the frame axis.',
    fromIndex: 5,
    toIndex: 6,
    authoredEnd: SECTIONS[2].end,
  },
  {
    id: 'S4-threshold',
    intent: 'threshold',
    subject: 'The last four metres into the nose skin.',
    framing: 'Hull fills the frame; the portal opening is the only bright area.',
    fromIndex: 6,
    toIndex: 7,
    authoredEnd: 0.46,
  },

  // S5 — the cabin route owns position from 0.46 to 0.835 (cabinRoute.ts).
  // These rows keep the traversal gap-free and carry the zone timing the
  // interior copy is written against, so their scroll stays authored.
  {
    id: 'S5-cockpit-turn',
    intent: 'turn',
    subject: 'Entering the cockpit and turning to face the panel.',
    framing: 'Windscreen ahead, panel filling the lower frame.',
    fromIndex: 7,
    toIndex: 8,
    authoredEnd: interiorTime(0),
  },
  {
    id: 'S5-cockpit-hold',
    intent: 'dwell',
    subject: 'The flight deck.',
    framing: 'Instrument panel and forward windows, camera still.',
    fromIndex: 8,
    toIndex: 8,
    zone: 'cockpit',
    authoredEnd: interiorTime(0.1),
  },
  {
    id: 'S5-to-economy',
    intent: 'track',
    subject: 'Down the forward aisle into the main deck.',
    framing: 'Aisle vanishing point centred, seat blocks either side.',
    fromIndex: 8,
    toIndex: 9,
    authoredEnd: interiorTime(0.28),
  },
  {
    id: 'S5-economy-hold',
    intent: 'dwell',
    subject: 'Main-deck cabin, 3-4-3.',
    framing: 'Both aisles readable, overhead bins framing the top of shot.',
    fromIndex: 9,
    toIndex: 9,
    zone: 'economy',
    authoredEnd: interiorTime(0.4),
  },
  {
    id: 'S5-to-stair',
    intent: 'track',
    subject: 'Aft along the aisle to the staircase.',
    framing: 'Staircase opening entering frame from the left.',
    fromIndex: 9,
    toIndex: 10,
    authoredEnd: interiorTime(0.64),
  },
  {
    id: 'S5-stair-hold',
    intent: 'dwell',
    subject: 'The connecting staircase.',
    framing: 'Steps and landing legible, upper deck implied above.',
    fromIndex: 10,
    toIndex: 10,
    zone: 'stair',
    authoredEnd: interiorTime(0.72),
  },
  {
    id: 'S5-to-upper',
    intent: 'track',
    subject: 'Climbing to the upper deck.',
    framing: 'Rising through the stairwell into the upper aisle.',
    fromIndex: 10,
    toIndex: 11,
    authoredEnd: interiorTime(0.88),
  },
  {
    id: 'S5-upper-hold',
    intent: 'dwell',
    subject: 'Upper-deck cabin, 2-4-2.',
    framing: 'Narrower section, curved ceiling reading clearly overhead.',
    fromIndex: 11,
    toIndex: 11,
    zone: 'upperDeck',
    authoredEnd: interiorTime(1),
  },
  {
    id: 'S6-door-approach',
    intent: 'approach',
    subject: 'The upper-deck doorway.',
    framing: 'Door frame centred, exterior light spilling in.',
    fromIndex: 11,
    toIndex: 12,
    authoredEnd: 0.83,
  },
  {
    id: 'S6-door-cross',
    intent: 'threshold',
    subject: 'Crossing the door plane outward.',
    framing: 'Frame passing the edges of shot as the exterior opens up.',
    fromIndex: 12,
    toIndex: 13,
    authoredEnd: 0.835,
  },

  {
    id: 'S6-break-out',
    intent: 'retreat',
    subject: 'Clearing the fuselage and turning back onto the aircraft.',
    framing: 'Aircraft re-enters frame from the right and stays in shot throughout.',
    fromIndex: 13,
    toIndex: 14,
  },
  {
    id: 'S6-pull-back',
    intent: 'retreat',
    subject: 'The wide cinematic shot of the aircraft in flight.',
    framing: 'Aircraft held in the left half against sunset cloud, never leaving frame.',
    fromIndex: 14,
    toIndex: 15,
    authoredEnd: SECTIONS[5].end,
  },
  {
    id: 'S7-settle',
    intent: 'settle',
    subject: 'The closing frame.',
    framing: 'Same subject as S6, a touch further out so the ending is not a freeze.',
    fromIndex: 15,
    toIndex: 16,
    authoredEnd: 1,
  },
]

export interface FinishReference {
  /** The lighting condition and subject this shot is graded against. */
  reference: string
  /** What is meant to read as the real aircraft or aerodrome. */
  reproduced: string
  /** What is deliberately an interpretation, and should not be read as fidelity. */
  stylised: string
}

/**
 * plan6 5.1 — the finish reference per shot. The point is not the prose: it
 * is that every shot has somewhere to record which parts of it are claims
 * about a real A380 and which are art direction, so a capture can be judged
 * against what it was trying to be. Round 5 closed on images with no such
 * record, and the round-6 audit could only describe them as "recreación, no
 * réplica" after the fact.
 *
 * The exterior asset keeps its own CC BY 4.0 attribution (ASSET_AUDIT.md);
 * nothing here restyles it beyond surface response.
 */
export const FINISH_REFERENCES: Readonly<Record<string, FinishReference>> = {
  'S1-hero-drift': {
    reference: 'Parked widebody at golden hour, low sun across the port side.',
    reproduced: 'Airframe proportions and livery from the source asset; runway markings and dimensions.',
    stylised: 'Aerodrome layout, vegetation and sky are composed for the frame, not a real airport.',
  },
  'S2-lateral-track': {
    reference: 'Ground roll from outside the wingtip, same golden hour.',
    reproduced: 'Ground-roll acceleration, rotation attitude and gear sequence.',
    stylised: 'Runway length and the aerodrome beyond it are compressed to the scene scale.',
  },
  'S2-climb-out': {
    reference: 'Initial climb, aerodrome falling away.',
    reproduced: 'Rotation about the main gear and the climb that follows it.',
    stylised: 'Rate of climb is narrative, not performance data.',
  },
  'S3-bank-entry': {
    reference: 'Rear-lateral three-quarter entering the turn.',
    reproduced: 'Aircraft attitude.',
    stylised: 'Camera bank is an editorial flourish; the aircraft does not bank.',
  },
  'S3-orbit': {
    reference: 'High-altitude daylight, aircraft against sky.',
    reproduced: 'Airframe silhouette from every angle of the arc.',
    stylised: 'Altitude is implied by the cloud deck below, not by scale.',
  },
  'S3-nose-run-in': {
    reference: 'Head-on approach, hard daylight.',
    reproduced: 'Nose and forward fuselage geometry from the source asset.',
    stylised: 'Closing speed serves the narrative.',
  },
  'S4-threshold': {
    reference: 'The skin itself, backlit at the opening.',
    reproduced: 'Where the skin actually is, and the camera clearance through it.',
    stylised: 'The opening is a dissolve, not a door.',
  },
  'S5-cockpit-turn': {
    reference: 'Flight deck, instrument glow against dusk outside.',
    reproduced: 'Panel facing the nose, windscreen ahead, seats behind it.',
    stylised: 'Instrument content is representative, not a specific A380 configuration.',
  },
  'S5-cockpit-hold': {
    reference: 'Flight deck, instrument glow against dusk outside.',
    reproduced: 'Panel orientation and cockpit volume.',
    stylised: 'Display content and switch detail are representative.',
  },
  'S5-to-economy': {
    reference: 'Main-deck aisle under cabin practicals.',
    reproduced: 'Two aisles, 3-4-3 block widths and seat pitch.',
    stylised: 'Row count is a representative section, not the full cabin.',
  },
  'S5-economy-hold': {
    reference: 'Main-deck cabin, evening service lighting.',
    reproduced: 'Deck width, aisle clearance and seat arrangement.',
    stylised: 'Fabric and trim are a house palette, not an airline livery.',
  },
  'S5-to-stair': {
    reference: 'Aft aisle toward the staircase.',
    reproduced: 'Staircase position relative to the deck.',
    stylised: 'Stair detailing is simplified.',
  },
  'S5-stair-hold': {
    reference: 'Connecting staircase, warm orientation light.',
    reproduced: 'Rise, landing and headroom.',
    stylised: 'Balustrade and tread detail are simplified.',
  },
  'S5-to-upper': {
    reference: 'Climbing into the upper deck.',
    reproduced: 'Deck separation and the upper cabin section.',
    stylised: 'Transition detailing is simplified.',
  },
  'S5-upper-hold': {
    reference: 'Upper-deck cabin, 2-4-2.',
    reproduced: 'Narrower section, curved ceiling, seat arrangement.',
    stylised: 'Row count is again a representative section.',
  },
  'S6-door-approach': {
    reference: 'Upper-deck doorway with exterior light beyond.',
    reproduced: 'Door position on the port side of the upper deck.',
    stylised: 'The door does not articulate.',
  },
  'S6-door-cross': {
    reference: 'The threshold itself.',
    reproduced: 'Where the skin is and how the camera clears it.',
    stylised: 'The opening is a dissolve.',
  },
  'S6-break-out': {
    reference: 'Sunset, aircraft turning into frame.',
    reproduced: 'Airframe silhouette and port-quarter geometry.',
    stylised: 'Sunset sky and cloud are composed for the frame.',
  },
  'S6-pull-back': {
    reference: 'Sunset wide, aircraft departing.',
    reproduced: 'Airframe proportions at distance.',
    stylised: 'Cloud layout and haze are art direction.',
  },
  'S7-settle': {
    reference: 'Closing frame, same sunset.',
    reproduced: 'Airframe proportions.',
    stylised: 'Everything behind it.',
  },
}

export interface ShotBand extends Shot {
  start: number
  end: number
}

/**
 * Distributes scroll across the sheet. Shots that carry `authoredEnd` land
 * exactly there; every run of shots between two authored ends splits that
 * interval in proportion to its traversal cost, so a 195-unit orbit and a
 * 3-unit reposition no longer receive comparable amounts of scroll
 * (plan6 3.2 / A04).
 */
export function allocateShotSpans(costs: readonly number[]): ShotBand[] {
  if (costs.length !== SHOT_SHEET.length) {
    throw new Error(`Expected ${SHOT_SHEET.length} shot costs, received ${costs.length}`)
  }

  const bands: ShotBand[] = []
  let cursor = 0
  let groupFirst = 0

  for (let index = 0; index < SHOT_SHEET.length; index += 1) {
    const authoredEnd = SHOT_SHEET[index].authoredEnd
    if (authoredEnd === undefined) continue
    if (authoredEnd <= cursor) throw new Error(`Authored end for ${SHOT_SHEET[index].id} does not advance`)

    const span = authoredEnd - cursor
    let total = 0
    for (let j = groupFirst; j <= index; j += 1) total += costs[j]
    if (total <= 0 && index > groupFirst) {
      throw new Error(`Shots ${groupFirst}..${index} have no cost to allocate scroll by`)
    }

    let consumedCost = 0
    let previousEnd = cursor
    for (let j = groupFirst; j <= index; j += 1) {
      consumedCost += costs[j]
      const end = j === index ? authoredEnd : cursor + span * (consumedCost / total)
      bands.push({ ...SHOT_SHEET[j], start: previousEnd, end })
      previousEnd = end
    }

    cursor = authoredEnd
    groupFirst = index + 1
  }

  if (groupFirst !== SHOT_SHEET.length) {
    throw new Error('The last shot in the sheet must carry an authored end')
  }
  return bands
}
