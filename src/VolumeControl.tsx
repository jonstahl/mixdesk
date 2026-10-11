import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Icon } from './ui'

// Below this width the topbar has no room for a horizontal slider, so the
// speaker icon opens a vertical one instead.
const PHONE = '(max-width: 600px)'
const IDLE_MS = 5000

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

  // Close on a tap elsewhere, on Escape, or after a few seconds untouched.
  // The timer is held while a finger is down, so a long drag never closes it.
  useEffect(() => {
    const el = root.current
    if (!open || !el) return
    let timer = 0
    const hold = () => clearTimeout(timer)
    const restart = () => {
      hold()
      timer = window.setTimeout(() => setOpen(false), IDLE_MS)
    }
    const away = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    restart()
    el.addEventListener('pointerdown', hold)
    el.addEventListener('pointerup', restart)
    el.addEventListener('pointercancel', restart)
    el.addEventListener('input', restart)
    el.addEventListener('keydown', restart)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      hold()
      el.removeEventListener('pointerdown', hold)
      el.removeEventListener('pointerup', restart)
      el.removeEventListener('pointercancel', restart)
      el.removeEventListener('input', restart)
      el.removeEventListener('keydown', restart)
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
