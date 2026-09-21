import { Html } from '@react-three/drei'
import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { InteriorZoneKey } from '../lib/cameraPath'
import { useScrollStore } from '../state/scrollStore'

interface HotspotProps {
  position: readonly [number, number, number]
  title: string
  body: string
  pulseDelay: number
  sectionIndex: number
  zone?: InteriorZoneKey
}

/** Raycast occlusion avoids the opaque proxy quads produced by blending mode. */
export function Hotspot({ position, title, body, pulseDelay, sectionIndex, zone }: HotspotProps) {
  const interactive = useScrollStore(s => s.activeIndex === sectionIndex && (!zone || s.interiorZone === zone))
  const [occluded, setOccluded] = useState(false)
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const id = useId()
  const visible = interactive && !occluded
  useLayoutEffect(() => {
    const el = button.current
    return () => {
      if (el === document.activeElement) document.querySelector<HTMLElement>('.site-nav__reading')?.focus({ preventScroll: true })
    }
  }, [visible])
  if (!interactive) return null
  return (
    <Html position={position} occlude onOcclude={setOccluded} zIndexRange={[9, 8]}>
      <div className="hotspot" data-interactive={String(visible)} aria-hidden={!visible} inert={!visible}>
        <button ref={button} className="hotspot__dot-wrap" type="button" aria-label={title}
          aria-expanded={open} aria-controls={id} aria-describedby={open ? id : undefined} tabIndex={visible ? 0 : -1}
          onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}
          onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
          <span className="hotspot__pulse-ring" style={{ animationDelay: `${pulseDelay}s` }} />
          <span className="hotspot__ring" /><span className="hotspot__dot" />
        </button>
        <div id={id} className="hotspot__card" data-open={String(open)}>
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
