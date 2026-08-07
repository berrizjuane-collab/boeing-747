import { EXTERIOR_HOTSPOTS, INTERIOR_HOTSPOTS } from '../lib/content'
import { INTERIOR_ANCHORS_WORLD } from '../lib/sceneLayout'
import { useScrollStore } from '../state/scrollStore'
import { Hotspot } from './Hotspot'

// S3 anchors: the exterior mesh has no named sub-nodes for engine/wingtip/
// tail (ASSET_AUDIT.md — it's a single "A380" mesh, only the landing gear
// is split into named parts), so these are estimated from the model's
// already-audited world registration instead of read off a node — nose at
// world z=-115, main deck floor y=37 (sceneLayout.ts's EXTERIOR_LOCAL_OFFSET
// derivation), tail therefore ~z=-42 given the audited 73m length, wingtip
// ~x=±39.84 given the audited 79.68m span (ASSET_AUDIT.md). Same "loose
// meters-ish, tune after looking at the Playwright screenshots" status this
// codebase already gives cameraPath.ts's own keyframes, for the same reason.
const ENGINE_POSITION = [-13, 28, -88] as const
const WINGLET_POSITION = [39, 41, -80] as const
const EMPENNAGE_POSITION = [0, 54, -45] as const

// S5 anchors: real offsets from INTERIOR_ANCHORS_WORLD, not independent
// guesses — seat/screen/window/overheadBin cluster around the economy
// anchor (where the camera actually dwells), galley near the stair anchor
// (real A380s galley near the stair/door zone). Still tune-after-screenshot
// estimates for exactly where within each zone, same as the exterior ones.
//
// The +Z offsets specifically are larger than "a couple meters into the
// economy cabin" would suggest, and that's deliberate, not a typo: S5's
// dwell *value* (pathT=1/3, cameraPath.ts) lands the camera well past the
// raw economy anchor by the time it's reached — the arc-length
// reparametrization spans the whole section's keyframe chain, not just
// anchor-to-anchor, and the first two S5 keyframes alone jump from the
// cockpit anchor to ECONOMY.z+13. A first pass at ECONOMY.z+2..+4 rendered
// with zero-size bounding rects (drei's <Html> hides anchors that project
// behind the camera) — confirmed via a direct DOM query, not assumed — so
// these are pulled forward accordingly. The X/Y offsets are correspondingly
// tighter than a first pass used: this close to the camera, perspective
// magnifies lateral/vertical offset a lot faster than it does further down
// the corridor, and the first pass's +-2..3.4 X and up to +1 Y landed
// hundreds of px outside the viewport (also confirmed via DOM query) —
// pulled in toward the anchor itself, which sits at eye height in the
// aisle, so screen projection stays closer to frame-center.
//
// These four (unlike the exterior and galley anchors, both confirmed
// on-screen) are the one placement still worth a further visual pass — see
// PROGRESS.md Fase 6.
const ECONOMY = INTERIOR_ANCHORS_WORLD.economy
const STAIR = INTERIOR_ANCHORS_WORLD.stair
const SEAT_POSITION = [ECONOMY[0] - 0.6, ECONOMY[1] - 0.1, ECONOMY[2] + 11] as const
const SCREEN_POSITION = [ECONOMY[0] - 0.6, ECONOMY[1], ECONOMY[2] + 11.3] as const
const WINDOW_POSITION = [ECONOMY[0] + 1, ECONOMY[1] + 0.1, ECONOMY[2] + 13] as const
const OVERHEAD_BIN_POSITION = [ECONOMY[0] + 0.6, ECONOMY[1] + 0.3, ECONOMY[2] + 10] as const
const GALLEY_POSITION = [STAIR[0] + 2, STAIR[1], STAIR[2] - 2] as const

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
