import { useEffect, useState, type RefObject } from 'react'
import type { ScrollController } from '../lib/scrollController'
import { INTERIOR_HOLD } from '../lib/presentedProgress'
import { useAssetState } from '../state/assetState'
import { useScrollStore } from '../state/scrollStore'

export function InteriorLoadGuardrail({ controllerRef }: { controllerRef: RefObject<ScrollController | null> }) {
  const status = useAssetState((s) => s.assets.interior)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const controller = controllerRef.current
    let lastWaiting: boolean | undefined
    const update = () => {
      const waiting = useScrollStore.getState().targetProgress >= INTERIOR_HOLD && status.stage !== 'ready'
      if (waiting === lastWaiting) return
      lastWaiting = waiting
      setHeld(waiting)
      if (waiting) controllerRef.current?.stop('interior')
      else controllerRef.current?.start('interior')
    }
    update()
    const unsubscribe = useScrollStore.subscribe(update)
    return () => { unsubscribe(); controller?.start('interior') }
  }, [controllerRef, status.stage])
  return (
    <div className="interior-guardrail" data-active={held} aria-hidden={!held} inert={!held} role="status">
      {status.stage === 'error' ? <>
        No se pudo preparar la cabina. <button onClick={() => location.reload()}>Reintentar</button>
        <button onClick={() => controllerRef.current?.scrollToFraction(0)}>Volver al inicio</button>
      </> : 'Preparando la cabina…'}
    </div>
  )
}
