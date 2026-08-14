export interface ImagePipelineDiagnostics {
  toneMappingMode: number | null
  toneMappingModeName: string | null
  antialiasing: 'SMAA' | 'disabled-for-qa'
  antialiasingPreset: string | null
  gradingStrength: number
  gradingHighlightKey: string | null
  environmentBound: boolean
  environmentSource: 'golden' | 'high-altitude' | 'cabin' | 'sunset' | null
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
}
