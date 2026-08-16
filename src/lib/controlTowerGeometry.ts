import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute } from 'three'
// three-stdlib's mergeBufferGeometries is broken (see ExteriorAsset.tsx's
// comment on the exact failure mode) — three/examples/jsm's mergeGeometries
// is the maintained implementation this project already standardized on.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// D2: 10 radial segments produced a visibly faceted silhouette at S1/S2
// viewing distance; this is the plan's own floor for the sky dome (B5) and
// reads clean here too without meaningfully changing the tower's triangle
// count (a handful of cylinders, nowhere near the budget).
const SEGMENTS = 24

function coloredCylinder(radiusTop: number, radiusBottom: number, height: number, yCenter: number, color: Color) {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, SEGMENTS)
  geometry.translate(0, yCenter, 0)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let vertex = 0; vertex < count; vertex += 1) {
    colors[vertex * 3] = color.r
    colors[vertex * 3 + 1] = color.g
    colors[vertex * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return geometry
}

/**
 * D2: shaft + cab + window band + roof merged into one static draw call
 * (5 -> 2, the beacon staying separate — see Runway environment's own
 * comment on why). Vertex colors stand in for the four distinct
 * MeshStandardMaterial tints the original separate meshes had; the window
 * band's dedicated emissive glow is the one property that doesn't survive
 * the merge (a single material now covers the whole body) — traded
 * deliberately for the draw-call win, kept legible via color contrast alone
 * (a distinctly darker, cooler tint) rather than glow.
 */
export function createControlTowerBodyGeometry(): BufferGeometry {
  const parts = [
    coloredCylinder(2.2, 3.3, 26, 13, new Color('#727b7f')),
    coloredCylinder(5.8, 4.8, 4.2, 28, new Color('#7893a1')),
    coloredCylinder(5.88, 5.88, 1.25, 28.6, new Color('#1c2f39')),
    coloredCylinder(6.6, 5.5, 0.55, 30.7, new Color('#4d5559')),
  ]
  const merged = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  merged.computeBoundingSphere()
  return merged
}
