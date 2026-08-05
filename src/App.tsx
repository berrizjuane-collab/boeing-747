import { useEffect, useRef, useState } from 'react'
import { AuthoringPanel } from './dev/AuthoringPanel'
import { initScrollController } from './lib/scrollController'
import { DebugHud } from './components/DebugHud'
import { ScrollTrack } from './components/ScrollTrack'
import { SceneCanvas } from './components/SceneCanvas'

export default function App() {
  const trackRef = useRef<HTMLDivElement>(null)
  const [debugMode, setDebugMode] = useState(false)

  useEffect(() => {
    if (!trackRef.current) return
    return initScrollController(trackRef.current)
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') setDebugMode((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <SceneCanvas debugMode={debugMode} />
      <ScrollTrack containerRef={trackRef} />
      <DebugHud />
      <AuthoringPanel active={debugMode} onToggle={() => setDebugMode((v) => !v)} />
    </>
  )
}
