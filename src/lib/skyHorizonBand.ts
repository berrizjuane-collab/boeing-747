/**
 * plan4.md Fase I1/I2, bug #14: the sky domes (skyDomeMaterial.ts for
 * S1-S3, the sunset dome for S6) both declare `fog: false` — the ground
 * converges to a fog-matched colour with distance (FogExp2), the sky does
 * not, so the horizon is a hard colour step by construction (plan4.md
 * §1.3). Terrain/forest already dissolve into a warm "canopy mist" colour
 * near the horizon (canopyMist.ts, Fase G4/H) — this shared GLSL blends
 * the same colour into the sky dome in a band around the true horizon, so
 * both sides converge to one value instead of meeting as two independently
 * converging (or non-converging) surfaces.
 *
 * Elevation is measured from the actual camera position (the `cameraPosition`
 * built-in uniform three.js injects into every ShaderMaterial), not from
 * the dome's own centre — the dome is enormous (SKY_RADIUS=1200) and
 * doesn't move with the camera, so using dome-local direction would drift
 * the band away from the true horizon as the camera moves through S1-S3.
 * Comparison is done in sin(elevation) space (the vertical component of
 * the normalized to-camera direction) rather than converting to degrees —
 * monotonic with elevation, so smoothstep works directly on it with no
 * per-fragment trig beyond what `normalize()` already needs.
 */

// plan4.md §3.7 suggested "~+-2 deg" as a starting point. Measured against
// the real S3/S6 captures (progress4.md I1/I2 evidence) a +-2 deg band did
// reduce the pre-existing jump (S3 221.7x->135.5x, S6 246.3x->32.2x
// horizonStepRatio) but stayed far short of I4's <=2x target — widened to
// +-4 deg for a real margin against camera/elevation-estimate imprecision,
// still narrow enough to read as a horizon-hugging haze rather than a
// wash over most of the sky.
export const HORIZON_BAND_HALF_DEGREES = 4
export const HORIZON_BAND_HALF_SIN = Math.sin((HORIZON_BAND_HALF_DEGREES * Math.PI) / 180)

export const horizonBandVertexParsChunk = /* glsl */ `
varying vec3 vHorizonWorldPosition;
`

export const horizonBandVertexMainChunk = /* glsl */ `
vHorizonWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
`

export const horizonBandFragmentParsChunk = /* glsl */ `
varying vec3 vHorizonWorldPosition;
uniform vec3 horizonHazeColor;
uniform float horizonBandHalfSin;

vec3 applyHorizonHazeBand(vec3 baseColor) {
  float elevationSin = normalize(vHorizonWorldPosition - cameraPosition).y;
  float hazeAmount = 1.0 - smoothstep(0.0, horizonBandHalfSin, abs(elevationSin));
  return mix(baseColor, horizonHazeColor, hazeAmount);
}
`
