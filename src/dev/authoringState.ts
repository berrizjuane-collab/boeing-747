import { Vector3 } from 'three'

// Same crossing-the-canvas-boundary pattern as perfStats.ts: written every
// frame from inside the Canvas while the authoring tool is active, read on
// click from the DOM panel outside it.
export const authoringState = {
  position: new Vector3(),
  target: new Vector3(),
  fov: 45,
}

export function formatKeyframeSnippet(sectionIndex: number): string {
  const { position, target, fov } = authoringState
  const round = (n: number) => Math.round(n * 100) / 100
  return (
    `{ sectionIndex: ${sectionIndex}, ` +
    `camPos: [${round(position.x)}, ${round(position.y)}, ${round(position.z)}], ` +
    `camTarget: [${round(target.x)}, ${round(target.y)}, ${round(target.z)}], ` +
    `fov: ${round(fov)}, roll: 0 },`
  )
}
