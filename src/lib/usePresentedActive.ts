import { useLayoutEffect, useRef } from 'react'
import { useScrollStore, type ScrollSnapshot } from '../state/scrollStore'
/** Single owner of DOM attributes: synchronous presented-frame subscription.
 * React's scheduled commit can otherwise trail the WebGL frame. */
export function usePresentedActive<T extends HTMLElement>(field: 'activeIndex' | 'interiorZone', value: number | string, ariaCurrent = false) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const update = (state: ScrollSnapshot) => {
      const el = ref.current
      if (!el) return
      const active = state[field] === value
      if (el.dataset.active !== String(active)) el.dataset.active = String(active)
      if (ariaCurrent) {
        if (active) el.setAttribute('aria-current', 'true')
        else el.removeAttribute('aria-current')
      }
    }
    update(useScrollStore.getState())
    return useScrollStore.subscribe(update)
  }, [field, value, ariaCurrent])
  return ref
}
