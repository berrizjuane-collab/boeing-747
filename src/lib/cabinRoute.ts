import { Vector3 } from 'three'
import { interiorToWorld } from './sceneLayout'
import { createMotionProfile, rampedLinear } from './motionProfile'

// Short bounded segments in cabin space. Never inherit tangents from the
// exterior orbit. Eye clearance is checked against the final GLB, not boxes.
const stops = [
  [.46, [0,1.1,0], [0,1.1,4]],
  [.475, [0,1.1,1.4], [0,1.1,5]],
  [.49, [0,1.6,3.8], [0,1.3,1.35]],
  [.532, [0,1.6,3.8], [0,1.3,1.35]],
  [.548, [0,1.6,3.8], [0,1.6,7]],
  [.56, [0,1.6,6.7], [0,1.6,10]],
  [.568, [0,1.6,7.95], [0,1.6,12]],
  [.576, [-1.32,1.6,7.95], [-1.32,1.6,14]],
  [.5896, [-1.32,1.6,18], [-1.32,1.6,24]],
  [.628, [-1.32,1.6,18], [-1.32,1.6,24]],
  [.674, [-1.32,1.6,25.8], [-1.32,2.5,29]],
  [.7048, [-1.32,2.95,29], [-1.32,4.05,33]],
  [.7304, [-1.32,2.95,29], [-1.32,4.05,33]],
  [.752, [-1.32,4.05,32.2], [-1.32,4.05,37]],
  [.7816, [-1.32,4.05,36.5], [-1.32,4.05,41]],
  [.82, [-1.32,4.05,36.5], [-1.32,4.05,41]],
  [.827, [-1.32,4.05,39.6], [-2.78,4.05,40.5]],
  [.83, [-1.32,4.05,40.5], [-4,4.05,40.5]],
  [.835, [-4.2,4.05,40.5], [-8,4.05,40.5]],
] as const

export const CABIN_ROUTE_START = stops[0][0]
export const CABIN_ROUTE_END = stops[stops.length - 1][0]

const WORLD_STOPS = stops.map((stop) => new Vector3(...interiorToWorld(stop[1])))

// Straight lines between verified stops, deliberately. Fase 2 sampled 3,751
// camera positions against the reimported GLB along exactly these segments;
// a spline through the same stops would bow outside that tested corridor and
// silently invalidate the zero-collision result.
const CUMULATIVE_LENGTH = WORLD_STOPS.reduce<number[]>(
  (accumulator, point, index) =>
    index === 0 ? [0] : [...accumulator, accumulator[index - 1] + WORLD_STOPS[index - 1].distanceTo(point)],
  [],
)

/**
 * One motion profile for the whole walk instead of a smoothstep per segment.
 * plan6 3.4: a stop belongs to a pause the narrative asked for, not to every
 * join in the table. Per-segment smoothstep put zero velocity at all
 * nineteen stops, so the cabin walk braked and re-accelerated between each
 * pair of adjacent points; the monotone profile holds still only where two
 * consecutive stops repeat a position, which is where the zone dwells are.
 */
const PROFILE = createMotionProfile(stops.map((stop, index) => ({ progress: stop[0], cost: CUMULATIVE_LENGTH[index] })))

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// The camera enters the nose facing aft and has to come about to read the
// flight deck. A full half-turn in the scroll this beat owns runs at 2.93°
// per 0.001 of progress, which leaves the orientation budget no margin at
// all; 165° arrives with the panel just off the frame axis — a better
// composition than dead-on — and brings the turn rate down to ~2.7°.
const COCKPIT_TURN = (165 * Math.PI) / 180

export function sampleCabinRoute(p: number) {
  if (p < CABIN_ROUTE_START || p > CABIN_ROUTE_END) return null

  const travelled = PROFILE.cost(p)
  let index = 0
  while (index < stops.length - 2 && CUMULATIVE_LENGTH[index + 1] <= travelled) index += 1
  const segmentLength = CUMULATIVE_LENGTH[index + 1] - CUMULATIVE_LENGTH[index]
  const t = segmentLength > 0 ? clamp01((travelled - CUMULATIVE_LENGTH[index]) / segmentLength) : 0

  // Orientation has its own bounded turn envelope. Using the tiny position
  // segments for a 180-degree turn would exceed the existing angular budget.
  const blend = (start: number, end: number) => rampedLinear((p - start) / (end - start), 0.02)
  const yaw = COCKPIT_TURN*blend(.46,.5215)-COCKPIT_TURN*blend(.532,.596)-Math.PI/2*blend(.795,.835)
  const origin = new Vector3(...interiorToWorld([0,0,0]))
  const direction = new Vector3(...interiorToWorld([Math.sin(yaw),0,Math.cos(yaw)])).sub(origin).normalize()
  const position = WORLD_STOPS[index].clone().lerp(WORLD_STOPS[index + 1], t)
  return {position,target:position.clone().addScaledVector(direction,5),fov:50,rollRad:0}
}

/** Linear speed, in world units per unit of global progress, along the walk. */
export function cabinRouteSpeed(p: number): number {
  if (p < CABIN_ROUTE_START || p > CABIN_ROUTE_END) return 0
  return PROFILE.speed(p)
}
