import { EXTERIOR_HOTSPOTS, INTERIOR_HOTSPOTS } from '../lib/content'
import { interiorToWorld } from '../lib/sceneLayout'
import { useScrollStore } from '../state/scrollStore'
import { Hotspot } from './Hotspot'

// Anchors on the registered aircraft, measured in its pitched flight frame.
// Interior points follow seat pitch/windows in the canonical manifest.
const ENGINE_POSITION = interiorToWorld([-13, -8, 22])
const WINGLET_POSITION = interiorToWorld([39, 1, 30])
const EMPENNAGE_POSITION = interiorToWorld([0, 17, 65])
const SEAT_POSITION = interiorToWorld([-.765, .55, 19.08])
const SCREEN_POSITION = interiorToWorld([-.765, .742, 19.32])
const WINDOW_POSITION = interiorToWorld([-3.08, 1.34, 20.275])
const OVERHEAD_BIN_POSITION = interiorToWorld([-2.88, 1.95, 20])
const GALLEY_POSITION = interiorToWorld([-1.72, 1.25, 32.22])

const EXTERIOR_SECTION_INDEX = 2 // S3
const INTERIOR_SECTION_INDEX = 4 // S5

function ExteriorHotspots() {
  const active = useScrollStore((s) => s.activeIndex === EXTERIOR_SECTION_INDEX)
  if (!active) return null
  return (
    <>
      <Hotspot
        position={ENGINE_POSITION}
        title={EXTERIOR_HOTSPOTS.engine.title}
        body={EXTERIOR_HOTSPOTS.engine.body}
        pulseDelay={0}
        sectionIndex={EXTERIOR_SECTION_INDEX}
      />
      <Hotspot
        position={WINGLET_POSITION}
        title={EXTERIOR_HOTSPOTS.winglet.title}
        body={EXTERIOR_HOTSPOTS.winglet.body}
        pulseDelay={0.6}
        sectionIndex={EXTERIOR_SECTION_INDEX}
      />
      <Hotspot
        position={EMPENNAGE_POSITION}
        title={EXTERIOR_HOTSPOTS.empennage.title}
        body={EXTERIOR_HOTSPOTS.empennage.body}
        pulseDelay={1.2}
        sectionIndex={EXTERIOR_SECTION_INDEX}
      />
    </>
  )
}

function InteriorHotspots() {
  const active = useScrollStore((s) => s.activeIndex === INTERIOR_SECTION_INDEX)
  if (!active) return null
  return (
    <>
      <Hotspot
        position={SEAT_POSITION}
        title={INTERIOR_HOTSPOTS.seat.title}
        body={INTERIOR_HOTSPOTS.seat.body}
        pulseDelay={0}
        sectionIndex={INTERIOR_SECTION_INDEX}
        zone="economy"
      />
      <Hotspot
        position={SCREEN_POSITION}
        title={INTERIOR_HOTSPOTS.screen.title}
        body={INTERIOR_HOTSPOTS.screen.body}
        pulseDelay={0.5}
        sectionIndex={INTERIOR_SECTION_INDEX}
        zone="economy"
      />
      <Hotspot
        position={WINDOW_POSITION}
        title={INTERIOR_HOTSPOTS.window.title}
        body={INTERIOR_HOTSPOTS.window.body}
        pulseDelay={1.0}
        sectionIndex={INTERIOR_SECTION_INDEX}
        zone="economy"
      />
      <Hotspot
        position={OVERHEAD_BIN_POSITION}
        title={INTERIOR_HOTSPOTS.overheadBin.title}
        body={INTERIOR_HOTSPOTS.overheadBin.body}
        pulseDelay={1.5}
        sectionIndex={INTERIOR_SECTION_INDEX}
        zone="economy"
      />
      <Hotspot
        position={GALLEY_POSITION}
        title={INTERIOR_HOTSPOTS.galley.title}
        body={INTERIOR_HOTSPOTS.galley.body}
        pulseDelay={0}
        sectionIndex={INTERIOR_SECTION_INDEX}
        zone="stair"
      />
    </>
  )
}

/**
 * Top-level hotspot mount, gated by section at the React level (like
 * SceneCanvas.tsx's InteriorGate) rather than always-mounted: activeIndex
 * only changes ~6 times across the page, so this is cheap, and it means
 * drei's per-frame occlusion test for `occlude="blending"` only ever runs
 * for hotspots that could plausibly be visible right now.
 */
export function Hotspots() {
  return (
    <>
      <ExteriorHotspots />
      <InteriorHotspots />
    </>
  )
}
