import type { CSSProperties, SVGProps } from 'react'

const paths = {
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  prev: 'M6 5h2v14H6zM19 5.5v13L9.5 12z',
  next: 'M16 5h2v14h-2zM5 5.5v13L14.5 12z',
  search: 'M10.5 4a6.5 6.5 0 1 0 4 11.6l4.4 4.4 1.4-1.4-4.4-4.4A6.5 6.5 0 0 0 10.5 4zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
  cut: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z',
  mix: 'M4 7h3.6l7.2 10H20v-2h-4.2L8.6 5H4zm10.8-2-1.9 2.6 1.2 1.7L15.8 7H20V5zM4 15v2h4.6l1.9-2.6-1.2-1.7L7.6 15z',
  playNext: 'M4 6h11v2H4zM4 11h7v2H4zM4 16h7v2H4zM14 12.5v7l6-3.5z',
  volume: 'M4 9v6h4l5 4V5L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z',
  reroll: 'M12 5a7 7 0 0 0-6.9 6h2A5 5 0 0 1 16 8.1L13.5 10.5H20V4l-2.6 2.6A7 7 0 0 0 12 5zm-8 8.5V20l2.6-2.6A7 7 0 0 0 18.9 13h-2A5 5 0 0 1 8 15.9l2.5-2.4z',
  add: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  settings:
    'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
} as const

export type IconName = keyof typeof paths

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  )
}

export function fmtDuration(secs?: number) {
  if (secs == null || !isFinite(secs)) return ''
  const s = Math.max(0, Math.round(secs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Artwork, or a lettered tile tinted by album name when LMS has none. */
export function Cover({ src, name, className, full }: { src: string; name?: string; className: string; full?: boolean }) {
  if (src) return <img className={className} src={src} alt="" loading="lazy" />
  const label = (name ?? '').replace(/^(the|a|an)\s+/i, '').trim()
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <div className={className + ' cover-blank'} style={{ '--hue': h } as CSSProperties} aria-hidden="true">
      <span>{full ? name : label.charAt(0).toUpperCase() || '?'}</span>
    </div>
  )
}
