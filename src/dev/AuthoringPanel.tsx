import { useState, type CSSProperties } from 'react'
import { SECTIONS } from '../lib/sections'
import { formatKeyframeSnippet } from './authoringState'

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 16,
  left: 16,
  zIndex: 20,
  background: 'rgba(10, 12, 16, 0.85)',
  color: '#fff',
  fontFamily: 'monospace',
  fontSize: 12,
  padding: 12,
  borderRadius: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxWidth: 340,
}

/** DOM overlay for the keyframe authoring tool — lives outside the Canvas, reads authoringState on click. */
export function AuthoringPanel({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const [sectionIndex, setSectionIndex] = useState(0)
  const [lastSnippet, setLastSnippet] = useState('')

  const dump = () => {
    const snippet = formatKeyframeSnippet(sectionIndex)
    setLastSnippet(snippet)
    console.log('[keyframe]', snippet)
    navigator.clipboard?.writeText(snippet).catch(() => {})
  }

  if (!active) {
    return (
      <div style={{ ...panelStyle, opacity: 0.6 }}>
        <button onClick={onToggle}>Modo autoría (D)</button>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      <strong>Modo autoría de keyframes</strong>
      <label>
        Sección:{' '}
        <select value={sectionIndex} onChange={(e) => setSectionIndex(Number(e.target.value))}>
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.index}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={dump}>Volcar keyframe</button>
        <button onClick={onToggle}>Salir (D)</button>
      </div>
      {lastSnippet && <code style={{ wordBreak: 'break-all', opacity: 0.8 }}>{lastSnippet}</code>}
    </div>
  )
}
