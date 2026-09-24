import { createTerrainSurfaceMapPayload } from './terrainSurfaceMaps'

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<{ size: number }>) => void) | null
  postMessage: (message: unknown, transfer: Transferable[]) => void
}

worker.onmessage = ({ data }) => {
  const payload = createTerrainSurfaceMapPayload(data.size)
  worker.postMessage(payload, [payload.albedoData.buffer, payload.normalData.buffer, payload.roughnessData.buffer])
}
