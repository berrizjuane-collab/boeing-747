import { useEffect, useRef, useState } from 'react'
import { AuthoringPanel } from './dev/AuthoringPanel'
import { initScrollController, type ScrollController } from './lib/scrollController'
import { SECTIONS } from './lib/sections'
import { DebugHud } from './components/DebugHud'
import { InteriorOverlay } from './components/InteriorOverlay'
import { LoadingScreen } from './components/LoadingScreen'
import { NarrativeOverlay } from './components/NarrativeOverlay'
import { ScrollTrack } from './components/ScrollTrack'
import { SceneCanvas } from './components/SceneCanvas'
import { SiteNav } from './components/SiteNav'

export default function App() {
  const trackRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ScrollController | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  useEffect(() => {
    if (!trackRef.current) return
    const controller = initScrollController(trackRef.current)
    // PLAN.md §0: scroll stays blocked until S0 finishes loading —
    // LoadingScreen's onComplete below calls lenis.start() the moment
    // loading is done.
    controller.lenis.stop()
    controllerRef.current = controller
    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') setDebugMode((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const jumpToSection = (index: number) => {
    const lenis = controllerRef.current?.lenis
    if (!lenis) return
    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
    lenis.scrollTo(SECTIONS[index].start * scrollableHeight, { duration: 1.2 })
  }

  return (
    <>
      <SceneCanvas debugMode={debugMode} />
      <ScrollTrack containerRef={trackRef} />
      <NarrativeOverlay />
      <InteriorOverlay />
      <SiteNav onJump={jumpToSection} />
      <DebugHud />
      <AuthoringPanel active={debugMode} onToggle={() => setDebugMode((v) => !v)} />
      <LoadingScreen onComplete={() => controllerRef.current?.lenis.start()} />
    </>
  )
}
