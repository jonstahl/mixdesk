import { useEffect, useRef, useState, type ReactNode } from 'react'
import { coverUrl, type Track } from './lms'
import { Cover, fmtClock, fmtDuration, Icon, type IconName } from './ui'

export type RowAction = { icon: IconName; label: string; key?: string; run: () => void; danger?: boolean }

export function TrackRow(props: {
  track: Track
  selected?: boolean
  current?: boolean
  muted?: boolean
  leaving?: boolean
  aside?: ReactNode
  actions: RowAction[]
  onSelect?: () => void
  onActivate?: () => void
}) {
  const { track } = props
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (props.selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [props.selected])
  const cls = ['row', props.selected && 'is-selected', props.current && 'is-current', props.muted && 'is-muted', props.leaving && 'is-leaving']
    .filter(Boolean)
    .join(' ')
  return (
    <li ref={ref} className={cls} onClick={props.onSelect} onDoubleClick={props.onActivate} aria-current={props.current || undefined}>
      <Cover className="row-cover" src={coverUrl(track.coverid, 96)} name={track.album} />
      <div className="row-main">
        <span className="row-title">{track.title}</span>
        <span className="row-sub">
          <span className="row-artist">{track.artist}</span>
          <span className="row-album">{track.album}</span>
        </span>
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
  remainingNow: number
  selected: number
  leaving: Set<number>
  autoMix: boolean
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

  // Wall-clock start time for each upcoming track: easier to plan around than "+14:32".
  const starts: Date[] = []
  let t = Date.now() + props.remainingNow * 1000
  for (const tr of upcoming) {
    starts.push(new Date(t))
    t += (tr.duration ?? 0) * 1000
  }
  const endsAt = new Date(t)

  const actionsFor = (i: number, tr: Track): RowAction[] => [
    { icon: 'playNext', label: 'Play next', key: 'N', run: () => props.onPlayNext(i) },
    { icon: 'mix', label: 'Mix from this', key: 'M', run: () => props.onMix(tr) },
    { icon: 'cut', label: 'Cut', key: 'X', run: () => props.onCut(i), danger: true },
  ]
  const row = (tr: Track, i: number, extra: Partial<Parameters<typeof TrackRow>[0]> = {}) => (
    <TrackRow
      key={`${i}-${tr.id}`}
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
        {showPlayed && played.map((tr, i) => row(tr, i, { muted: true, aside: fmtDuration(tr.duration) }))}
        {tracks[currentIndex] && row(tracks[currentIndex], currentIndex, { current: true, aside: 'Now' })}
        {upcoming.map((tr, k) => {
          const i = currentIndex + 1 + k
          return row(tr, i, { aside: <time title={fmtDuration(tr.duration)}>{fmtClock(starts[k])}</time> })
        })}
      </ol>
      <div className="horizon">
        {props.autoMix ? (
          <>
            <p className="horizon-title">MusicIP keeps going from here</p>
            <p className="horizon-note">
              When two tracks are left, it adds a new mix seeded from five random tracks in this list, played ones included.
              Cutting a track also takes it out of that pool.
            </p>
          </>
        ) : (
          <p className="horizon-title">Queue ends at {fmtClock(endsAt)}</p>
        )}
      </div>
    </section>
  )
}
