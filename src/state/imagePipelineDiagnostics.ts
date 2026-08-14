export interface ImagePipelineDiagnostics {
  toneMappingMode: number | null
  toneMappingModeName: string | null
  antialiasing: 'SMAA' | 'disabled-for-qa'
  antialiasingPreset: string | null
  gradingStrength: number
  gradingHighlightKey: string | null
  environmentBound: boolean
  environmentSource: 'golden' | 'high-altitude' | 'cabin' | 'sunset' | null
  effectiveExposure: number
  fogColor: number | null
  fogDensity: number
  fogSamples: Array<{ distance: number; mix: number }>
  hemisphereIntensity: number
  ambientIntensity: number
  solar: {
    source: string | null
    sunAzimuthDeg: number | null
    sunElevationDeg: number | null
    keyAzimuthDeg: number | null
    keyElevationDeg: number | null
    keyAngularErrorDeg: number | null
  }
  hdri: {
    sourceResolution: [number, number]
    gpuResolution: [number, number]
    mipmaps: boolean
    estimatedResidentBytes: number
  }
  skyDomeSegments: [number, number]
}

/** Mutable, allocation-free bridge from the render loop to Playwright. */
export const imagePipelineDiagnostics: ImagePipelineDiagnostics = {
  toneMappingMode: null,
  toneMappingModeName: null,
  antialiasing: 'SMAA',
  antialiasingPreset: null,
  gradingStrength: 0,
  gradingHighlightKey: null,
  environmentBound: false,
  environmentSource: null,
  effectiveExposure: 0,
  fogColor: null,
  fogDensity: 0,
  fogSamples: [
    { distance: 100, mix: 0 },
    { distance: 400, mix: 0 },
    { distance: 800, mix: 0 },
  ],
  hemisphereIntensity: 0,
  ambientIntensity: 0,
  solar: {
    source: null,
    sunAzimuthDeg: null,
    sunElevationDeg: null,
    keyAzimuthDeg: null,
    keyElevationDeg: null,
    keyAngularErrorDeg: null,
  },
  hdri: {
    sourceResolution: [0, 0],
    gpuResolution: [0, 0],
    mipmaps: false,
    estimatedResidentBytes: 0,
  },
  skyDomeSegments: [0, 0],
}
