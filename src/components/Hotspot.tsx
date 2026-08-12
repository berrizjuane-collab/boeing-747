import { Html } from '@react-three/drei'
import type { InteriorZoneKey } from '../lib/cameraPath'
import { useScrollStore } from '../state/scrollStore'

interface HotspotProps {
  position: readonly [number, number, number]
  title: string
  body: string
  pulseDelay: number
  /** Only interactive while this section is active. */
  sectionIndex: number
  /** S5 hotspots only: additionally requires this walkthrough zone's dwell
   * plateau, using the same detection InteriorOverlay.tsx keys its content
   * off (the store's globally derived interiorZone) so a hotspot never goes
   * live for content that isn't showing. */
  zone?: InteriorZoneKey
}

/**
 * PLAN.md §10.3: 12px dot + 1px ring, a second ring pulsing 1x->2.2x /
 * opacity 0.6->0 over 2.4s ease-out looping (index.css), hover stops the
 * pulse and shows a DOM card via a thin guide line. drei's `<Html>` anchors
 * this to a real 3D point.
 *
 * Not `occlude="blending"`, despite that being §10.3's explicit
 * recommendation over manual raycast occlusion: confirmed via the Fase 6
 * Playwright pass that in this scene it renders visible ~75px solid black
 * quads at each hotspot's anchor point instead of staying invisible
 * (verified independent of the aircraft mesh — the artifact appears at the
 * same screen position with or without the aircraft in frame, so it's the
 * occlusion proxy itself misbehaving, not a shading issue on the model).
 * Between that and no occlusion at all, PLAN.md §1's own priority order
 * decides it — "ante cualquier disyuntiva entre una feature accesoria y
 * calidad visual del recorrido, gana la calidad visual." Hotspots are
 * already gated to their own dwell window, so most of the time they're on
 * geometry facing the camera anyway; losing the depth-fade for whatever
 * residual cases remain is a smaller cost than a black square in the shot.
 *
 * Dwell-band gating (§10.3's "detalle de interacción crítico"): interactive
 * hotspots compete with touch-scroll, so this stays `pointer-events: none`
 * (index.css's `.hotspot` default) until the derived section/zone selector
 * flips `data-interactive` on. That boolean changes only at boundaries, not
 * on every continuous progress update.
 */
export function Hotspot({ position, title, body, pulseDelay, sectionIndex, zone }: HotspotProps) {
  const interactive = useScrollStore(
    (state) => state.activeIndex === sectionIndex && (!zone || state.interiorZone === zone),
  )

  return (
    <Html position={position} distanceFactor={14}>
      <div className="hotspot" data-interactive={String(interactive)}>
        <button className="hotspot__dot-wrap" type="button" aria-label={title}>
          <span className="hotspot__pulse-ring" style={{ animationDelay: `${pulseDelay}s` }} />
          <span className="hotspot__ring" />
          <span className="hotspot__dot" />
        </button>
        <div className="hotspot__card">
          <div className="hotspot__card-line" />
          <div className="hotspot__card-body">
            <div className="hotspot__card-title">{title}</div>
            <div className="hotspot__card-text">{body}</div>
          </div>
        </div>
      </div>
    </Html>
  )
}
