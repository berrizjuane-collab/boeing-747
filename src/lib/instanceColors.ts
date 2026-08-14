import { Color, InstancedBufferAttribute, StaticDrawUsage } from 'three'

/**
 * Creates a non-null instance-color buffer before an InstancedMesh reaches
 * its first render. Starting at white preserves the material base until each
 * deterministic authored color is written.
 */
export function createStaticInstanceColorAttribute(count: number) {
  if (!Number.isInteger(count) || count <= 0) throw new Error(`Instance color count must be a positive integer: ${count}`)
  const attribute = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3)
  attribute.setUsage(StaticDrawUsage)
  return attribute
}

export function writeInstanceColor(attribute: InstancedBufferAttribute, index: number, color: Color) {
  if (!Number.isInteger(index) || index < 0 || index >= attribute.count) {
    throw new Error(`Instance color index ${index} is outside 0–${attribute.count - 1}`)
  }
  attribute.setXYZ(index, color.r, color.g, color.b)
}
