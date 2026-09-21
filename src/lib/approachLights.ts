/** Compressed fictional aerodrome: nominal 3° approach, not a flight aid. */
export const PAPI_BANKS = [
  { z: 180, direction: 1, xs: [-22, -25, -28, -31] },
  { z: -180, direction: -1, xs: [22, 25, 28, 31] },
] as const
export const PAPI_ANGLES = [2.5, 2 + 50 / 60, 3 + 10 / 60, 3.5] as const
export function papiSignal(eye: readonly number[], bank: typeof PAPI_BANKS[number], lamp: number) {
  const distance = (eye[2] - bank.z) * bank.direction
  if (distance <= 0 || Math.abs(eye[0] / distance) > Math.tan(10 * Math.PI / 180)) return 'off'
  const angle = Math.atan2(eye[1] - .7, distance) * 180 / Math.PI
  return angle >= PAPI_ANGLES[lamp] ? 'white' : 'red'
}
