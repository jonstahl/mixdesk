import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { coverUrl, isMixable, type Track } from './lms'
import { Cover, fmtDuration, Icon, type IconName } from './ui'

export type RowAction = { icon: IconName; label: string; key?: string; run: () => void; danger?: boolean }

export function TrackRow(props: {
  track: Track
  selected?: boolean
  current?: boolean
  muted?: boolean
  leaving?: boolean
  /** The track that just finished, collapsing out as the next one takes over. */
  exiting?: boolean
  aside?: ReactNode
  /** Replaces the cover, e.g. a track number on an album page. */
  lead?: ReactNode
  /** Replaces the artist/album line. */
  sub?: ReactNode
  actions: RowAction[]
  onSelect?: () => void
  onActivate?: () => void
}) {
  const { track } = props
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (props.selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [props.selected])
  const cls = ['row', props.selected && 'is-selected', props.current && 'is-current', props.muted && 'is-muted', props.leaving && 'is-leaving', props.exiting && 'is-exiting']
    .filter(Boolean)
    .join(' ')
  return (
    <li ref={ref} className={cls} onClick={props.onSelect} onDoubleClick={props.onActivate} aria-current={props.current || undefined}>
      {props.lead ?? <Cover className="row-cover" src={coverUrl(track.coverid, 96)} name={track.album} />}
      <div className="row-main">
        <span className="row-title">{track.title}</span>
        {'sub' in props ? (
          props.sub && <span className="row-sub">{props.sub}</span>
        ) : (
          <span className="row-sub">
            <span className="row-artist">{track.artist}</span>
            <span className="row-album">{track.album}</span>
          </span>
        )}
      </div>
      <div className="row-actions">
        {props.actions.map((a) => (
          <button
            key={a.label}
            className={'icon-btn' + (a.danger ? ' is-danger' : '')}
            title={a.key ? `${a.label} (${a.key})` : a.label}
            aria-label={a.label}
            onClick={(e) => {
              e.stopPropagation()
              a.run()
            }}
          >
            <Icon name={a.icon} size={18} />
          </button>
        ))}
      </div>
      <div className="row-aside">{props.aside ?? fmtDuration(track.duration)}</div>
    </li>
  )
}

export function RunningOrder(props: {
  tracks: Track[]
  currentIndex: number
  selected: number
  leaving: Set<number>
  onSelect: (i: number) => void
  onJump: (i: number) => void
  onCut: (i: number) => void
  onPlayNext: (i: number) => void
  onMix: (t: Track) => void
  onClearPlayed: () => void
}) {
  const { tracks, currentIndex } = props
  const [showPlayed, setShowPlayed] = useState(false)
  const played = tracks.slice(0, currentIndex)
  const upcoming = tracks.slice(currentIndex + 1)

  // Key rows by track, not position, so an advance moves rows instead of
  // remounting the whole list. A repeated track gets its occurrence number.
  const seen = new Map<number, number>()
  const keys = tracks.map((tr) => {
    const n = seen.get(tr.id) ?? 0
    seen.set(tr.id, n + 1)
    return `${tr.id}-${n}`
  })

  // When playback moves on by one, keep the finished track around just long
  // enough to collapse, unless the played tracks are showing anyway.
  const [exiting, setExiting] = useState<Track | null>(null)
  const prev = useRef({ tracks, currentIndex })
  useLayoutEffect(() => {
    const was = prev.current
    prev.current = { tracks, currentIndex }
    const gone = was.tracks[was.currentIndex]
    if (gone && currentIndex === was.currentIndex + 1 && tracks[was.currentIndex]?.id === gone.id) setExiting(gone)
    else setExiting(null)
  }, [tracks, currentIndex])
  useEffect(() => {
    if (!exiting) return
    const t = setTimeout(() => setExiting(null), 400)
    return () => clearTimeout(t)
  }, [exiting])

  const actionsFor = (i: number, tr: Track): RowAction[] => [
    ...(isMixable(tr) ? [{ icon: 'mix', label: 'Mix from this', key: 'M', run: () => props.onMix(tr) } as RowAction] : []),
    { icon: 'playNext', label: 'Play next', key: 'N', run: () => props.onPlayNext(i) },
    { icon: 'cut', label: 'Cut', key: 'X', run: () => props.onCut(i), danger: true },
  ]
  const row = (tr: Track, i: number, extra: Partial<Parameters<typeof TrackRow>[0]> = {}) => (
    <TrackRow
      key={keys[i]}
      track={tr}
      selected={props.selected === i}
      leaving={props.leaving.has(i)}
      actions={actionsFor(i, tr)}
      onSelect={() => props.onSelect(i)}
      onActivate={() => props.onJump(i)}
      {...extra}
    />
  )

  return (
    <section className="order" aria-label="Running order">
      {played.length > 0 && (
        <div className="played-bar">
          <button className="text-btn" onClick={() => setShowPlayed((v) => !v)} aria-expanded={showPlayed}>
            {showPlayed ? 'Hide' : 'Show'} {played.length} played
          </button>
          <button className="text-btn" onClick={props.onClearPlayed} title="Played tracks still seed the automatic mix. Clearing them lets the mix move on.">
            Clear played
          </button>
        </div>
      )}
      <ol className="rows">
        {showPlayed && played.map((tr, i) => row(tr, i, { muted: true }))}
        {!showPlayed && exiting && (
          <TrackRow key="exiting" track={exiting} current exiting aside="" actions={[]} />
        )}
        {tracks[currentIndex] && row(tracks[currentIndex], currentIndex, { current: true, aside: 'Now' })}
        {upcoming.map((tr, k) => row(tr, currentIndex + 1 + k))}
      </ol>
    </section>
  )
}
