import { BufferGeometry, Float32BufferAttribute } from 'three'

/**
 * Trap, confirmed both by reading three.js's source and against an actual
 * render (a hangar wall came back solid black despite a working hemisphere
 * light — see progress3.md's D1 entry): `material.vertexColors = true`
 * turns on the `USE_COLOR` shader define unconditionally from the
 * *material* alone — WebGLPrograms.js literally does
 * `parameters.vertexColors = material.vertexColors`, with no check for
 * whether the geometry has a `color` attribute. `color_vertex.glsl.js`
 * then always runs `vColor.rgb *= color` under that define; a geometry
 * with no bound `color` buffer leaves that attribute at WebGL's default
 * unbound value, (0,0,0,1) — so `vColor` becomes zero *before*
 * `USE_INSTANCING_COLOR`'s separate `vColor.rgb *= instanceColor.rgb` ever
 * runs, silently zeroing every `InstancedMesh.setColorAt()` tint (and, for
 * a material with no `emissive`, the whole surface).
 *
 * Any geometry driven purely by *instance* color — never has its own
 * per-vertex `color` — still needs a real, neutral (1,1,1) `color`
 * attribute for exactly this reason. This is that attribute: multiplying
 * by 1 is a no-op, so it only exists to keep the buffer bound.
 */
export function ensureNeutralColorAttribute(geometry: BufferGeometry): BufferGeometry {
  const count = geometry.getAttribute('position').count
  geometry.setAttribute('color', new Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  return geometry
}
