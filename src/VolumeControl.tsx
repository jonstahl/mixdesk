import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './ui'

// Below this width the topbar has no room for a horizontal slider, so the
// speaker icon opens a vertical one instead.
const PHONE = '(max-width: 600px)'

const subscribe = (notify: () => void) => {
  const query = matchMedia(PHONE)
  query.addEventListener('change', notify)
  return () => query.removeEventListener('change', notify)
}
const isPhone = () => matchMedia(PHONE).matches

export function VolumeControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const phone = useSyncExternalStore(subscribe, isPhone)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

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

  const slider = (
    <input
      type="range"
      min={0}
      max={100}
      value={value}
      aria-label="Volume"
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )

  if (!phone) {
    return (
      <label className="volume">
        <Icon name="volume" size={18} />
        {slider}
      </label>
    )
  }

  return (
    <div className="volume" ref={root}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Volume"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="volume" size={18} />
      </button>
      {open && (
        <div className="volume-pop">
          <output>{value}</output>
          <div className="volume-track">{slider}</div>
        </div>
      )}
    </div>
  )
}
