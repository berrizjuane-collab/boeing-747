import { useEffect, useRef, useState } from 'react'
import { AuthoringPanel } from './dev/AuthoringPanel'
import { initScrollController, type ScrollController } from './lib/scrollController'
import { SECTION_DESTINATIONS } from './lib/narrativeLayout'
import { DebugHud } from './components/DebugHud'
import { InteriorLoadGuardrail } from './components/InteriorLoadGuardrail'
import { InteriorOverlay } from './components/InteriorOverlay'
import { LoadingScreen } from './components/LoadingScreen'
import { NarrativeOverlayHead, NarrativeOverlayTail } from './components/NarrativeOverlay'
import { ScrollTrack } from './components/ScrollTrack'
import { SceneCanvas } from './components/SceneCanvas'
import { SiteNav } from './components/SiteNav'

const DEV_TOOLS_ENABLED = import.meta.env.DEV

export default function App() {
  const trackRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<ScrollController | null>(null)
  const [debugMode, setDebugMode] = useState(false)

  useEffect(() => {
    if (!trackRef.current) return
    const controller = initScrollController(trackRef.current)
    // PLAN.md §0: scroll stays blocked until S0 finishes loading —
    // LoadingScreen's onComplete below calls start() the moment loading is
    // done.
    controller.stop()
    controllerRef.current = controller
    return () => {
      controller.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!DEV_TOOLS_ENABLED) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'd') setDebugMode((v) => !v)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const jumpToSection = (index: number) => {
    controllerRef.current?.scrollToFraction(SECTION_DESTINATIONS[index])
  }

  return (
    <>
      <SceneCanvas debugMode={DEV_TOOLS_ENABLED && debugMode} />
      <ScrollTrack containerRef={trackRef} />
      {/* Split head/tail, InteriorOverlay sandwiched between: DOM order here
          is heading order (NarrativeOverlay.tsx's doc comment) — S1-S4, then
          S5, then S6-S7, matching story order instead of insertion order. */}
      <NarrativeOverlayHead />
      <InteriorOverlay />
      <NarrativeOverlayTail />
      <SiteNav onJump={jumpToSection} />
      {DEV_TOOLS_ENABLED && <DebugHud />}
      {DEV_TOOLS_ENABLED && <AuthoringPanel active={debugMode} onToggle={() => setDebugMode((v) => !v)} />}
      <InteriorLoadGuardrail controllerRef={controllerRef} />
      <LoadingScreen onComplete={() => controllerRef.current?.start()} />
    </>
  )
}
