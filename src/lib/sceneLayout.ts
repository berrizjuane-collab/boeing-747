import manifest from './interior-manifest.json'
// One aircraft frame for runtime, exported anchors and geometric QA.
// Blender source: X lateral, Y up, Z aft; GLB +90°X undoes export axes.
export const RUNWAY_POSE = { position: [0, 8.48, 0] as const, pitchDeg: 0 }
export const FLYING_POSE = { position: manifest.flightPosition as [number, number, number], pitchDeg: manifest.flightPitchDeg }
export const EXTERIOR_LOCAL_OFFSET = [0, -8.5, -35] as const
export const INTERIOR_LOCAL_OFFSET = manifest.localOffset as [number, number, number]
export function interiorToWorld([x, y, z]: readonly number[]): [number, number, number] {
  const a = FLYING_POSE.pitchDeg * Math.PI / 180
  const ly = y + INTERIOR_LOCAL_OFFSET[1], lz = z + INTERIOR_LOCAL_OFFSET[2]
  return [x, FLYING_POSE.position[1] + ly * Math.cos(a) - lz * Math.sin(a), FLYING_POSE.position[2] + ly * Math.sin(a) + lz * Math.cos(a)]
}
export function worldToInterior([x, y, z]: readonly number[]): [number, number, number] {
  const a = -FLYING_POSE.pitchDeg * Math.PI / 180
  const ly = y - FLYING_POSE.position[1], lz = z - FLYING_POSE.position[2]
  return [x, ly * Math.cos(a) - lz * Math.sin(a) - INTERIOR_LOCAL_OFFSET[1], ly * Math.sin(a) + lz * Math.cos(a) - INTERIOR_LOCAL_OFFSET[2]]
}
export const INTERIOR_OFFSET = interiorToWorld([0, 0, 0])
export const INTERIOR_ANCHORS_WORLD = {
  cockpit: interiorToWorld(manifest.anchors.cockpit),
  economy: interiorToWorld(manifest.anchors.economy),
  stair: interiorToWorld(manifest.anchors.stair),
  upperDeck: interiorToWorld(manifest.anchors.upperDeck),
}
export const INTERIOR_MANIFEST = manifest
