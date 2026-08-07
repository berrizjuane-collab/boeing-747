import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StaticFallback } from './components/StaticFallback.tsx'
import { detectWebGL2Support } from './lib/webglSupport.ts'

// PLAN.md §8.2: checked once at boot, before the 3D app (or anything that
// assumes a working WebGL2 context — SceneCanvas.tsx's <Canvas>, every
// loader it triggers) ever mounts, not caught after the fact via an error
// boundary once something inside has already thrown.
const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>{detectWebGL2Support() ? <App /> : <StaticFallback />}</StrictMode>,
)
