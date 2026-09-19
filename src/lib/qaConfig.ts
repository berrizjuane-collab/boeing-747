// Explicit opt-in. Production visitors retain automatic quality selection.
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
export const qaEnabled = params.get('qa') === '1'
const quality = params.get('quality')
export const qaTier = qaEnabled && (quality === 'high' || quality === 'mid' || quality === 'low') ? quality : null
export const qaTime = qaEnabled && params.has('time') && Number.isFinite(Number(params.get('time'))) ? Number(params.get('time')) : null
export const qaView = qaEnabled ? params.get('view') : null
export const qaWireframe = qaEnabled && params.get('wireframe') === '1'

export const qaZoneColors = qaEnabled && params.get('zones') === '1'
