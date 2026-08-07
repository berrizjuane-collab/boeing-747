import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: GitHub Pages serves this as a project site at
// berrizjuane-collab.github.io/boeing-747/, not from the domain root (no
// CNAME/custom domain in this repo). Every runtime asset path in src/
// (useGLTF model URLs, Draco decoderPath, KTX2 transcoderPath, RGBELoader
// HDRI URLs) is prefixed with import.meta.env.BASE_URL specifically so it
// resolves under that subpath instead of 404ing against the domain root.
// https://vite.dev/config/
export default defineConfig({
  base: '/boeing-747/',
  plugins: [react()],
})
