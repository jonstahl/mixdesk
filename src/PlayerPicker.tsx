import { useEffect, useRef, useState } from 'react'
import type { Player } from './lms'
import { Icon } from './ui'

export function PlayerPicker({
  players,
  value,
  onChange,
  onMove,
}: {
  players: Player[]
  value: string | null
  onChange: (id: string) => void
  onMove?: (to: Player) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const current = players.find((p) => p.playerid === value) ?? players[0]

  // Close on a click elsewhere or Escape.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="player-picker" ref={root}>
      <button
        type="button"
        className="player-trigger"
        aria-label="Player"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{current?.name}</span>
        <Icon name="right" size={16} className="player-caret" />
      </button>
      {open && (
        <ul className="player-menu" role="listbox" aria-label="Player">
          {players.map((p) => (
            <li key={p.playerid} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={p.playerid === current?.playerid}
                onClick={() => {
                  onChange(p.playerid)
                  setOpen(false)
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
          {onMove &&
            players
              .filter((p) => p.playerid !== current?.playerid)
              .map((p) => (
                <li key={`move-${p.playerid}`} role="presentation" className="player-move">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onMove(p)
                      setOpen(false)
                    }}
                  >
                    Move playback to {p.name}
                  </button>
                </li>
              ))}
        </ul>
      )}
    </div>
  )
}
