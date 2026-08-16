import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three'

export const HANGAR_SURFACE_MAP_SIZE = 128

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + 19.19) * 43758.5453
  return value - Math.floor(value)
}

/**
 * plan3.md D1: doors, a clerestory window band and vertical cladding ribs,
 * painted the same way every other procedural surface in this project is —
 * applied identically to all faces of the stock instanced BoxGeometry
 * (rather than a per-face UV atlas on custom geometry) since the plan's own
 * §3.2 measurement puts a hangar at ~60px at its closest, plenty to read
 * "industrial building with doors and windows" but not enough to notice
 * that a corner view repeats the same facade on two visible sides — a
 * real, deliberate scope cut, not an oversight. `v` is assumed 0 at the
 * ground and 1 at the roofline; corrected to `1 - v` if a render shows it
 * flipped (unverifiable analytically without seeing GPU upload behavior,
 * per this project's own comments on DataTexture orientation elsewhere).
 *
 * Values here are a *multiplier* centered near 1.0 (plain wall, ribs ~0.9),
 * the same reasoning terrainSurfaceMaps.ts documents for exactly the same
 * trap: this map lands on top of the wall's existing material `color`
 * *and* its per-hangar vertexColor tint (RunwayEnvironment.tsx's HANGARS),
 * so anything much below 1.0 compounds multiplicatively across all three
 * and crushes toward black — caught by an actual render (a hangar face
 * with no direct light on it came back solid black; only the hemisphere
 * floor from B1 should have kept it visible). Door/window regions still
 * read as distinctly darker than the wall — just not so far below 1.0 that
 * three multiplied-together darkenings compound into zero.
 */
export function createHangarFacadeMap(): DataTexture {
  const size = HANGAR_SURFACE_MAP_SIZE
  const data = new Uint8Array(size * size * 4)
  const base: readonly [number, number, number] = [1, 1, 1]
  const window: readonly [number, number, number] = [0.55, 0.68, 0.78]
  const door: readonly [number, number, number] = [0.62, 0.62, 0.62]

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4
      const u = x / size
      const v = 1 - y / size
      let [r, g, b] = base

      // Vertical corrugated-cladding ribs.
      const ribPhase = (u * 16) % 1
      if (ribPhase < 0.1) {
        r *= 0.88
        g *= 0.88
        b *= 0.88
      }

      // Clerestory window band near the roofline.
      if (v > 0.72 && v < 0.86) {
        const windowPhase = (u * 11) % 1
        if (windowPhase > 0.18 && windowPhase < 0.82) [r, g, b] = window
      }

      // A door-sized recessed opening, lower-middle of the wall.
      if (u > 0.26 && u < 0.74 && v > 0.05 && v < 0.6) {
        ;[r, g, b] = door
        if (Math.abs(u - 0.5) < 0.008) {
          r *= 0.82
          g *= 0.82
          b *= 0.82
        }
      }

      const grain = 1 + (hash(x + 47, y + 91) - 0.5) * 0.1
      data[offset] = clampByte(r * grain * 255)
      data[offset + 1] = clampByte(g * grain * 255)
      data[offset + 2] = clampByte(b * grain * 255)
      data[offset + 3] = 255
    }
  }

  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  texture.name = 'MERIDIAN_hangar_facade'
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // Same reasoning as runwaySurfaceMap.ts: some hangar faces are stretched
  // non-uniformly too (e.g. HANGARS[2]'s 44x14 wall).
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}
