import { useEffect, useRef, type RefObject } from 'react'
import { coverUrl, type Status, type Track } from './lms'
import { Cover, fmtDuration, Icon } from './ui'

type Clock = RefObject<{ at: number; time: number }>

export function NowPlaying(props: {
  track?: Track
  status: Status | null
  clock: Clock
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onSeek: (secs: number) => void
  onMix: (t: Track) => void
}) {
  const { track, status } = props
  if (!track) {
    return (
      <section className="now now--empty">
        <p className="now-empty">Nothing queued. Press <kbd>/</kbd> to find a track to mix from.</p>
      </section>
    )
  }
  const playing = status?.mode === 'play'
  return (
    <section className="now" aria-label="Now playing">
      <Cover className="now-cover" src={coverUrl(track.coverid, 600)} name={track.album ?? track.title} full />
      <div className="now-text">
        <h1 className="now-title">{track.title}</h1>
        <p className="now-artist">{track.artist}</p>
        <p className="now-album">
          {track.album}
          {track.year && track.year !== '0' ? <span className="now-year">{track.year}</span> : null}
        </p>
      </div>
      <Progress duration={status?.duration ?? track.duration} playing={playing} clock={props.clock} onSeek={props.onSeek} />
      <div className="transport">
        <button className="icon-btn" onClick={props.onPrev} aria-label="Previous track">
          <Icon name="prev" size={26} />
        </button>
        <button className="play-btn" onClick={props.onToggle} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={30} />
        </button>
        <button className="icon-btn" onClick={props.onNext} aria-label="Next track">
          <Icon name="next" size={26} />
        </button>
        <button className="text-btn transport-mix" onClick={() => props.onMix(track)}>
          <Icon name="mix" size={18} /> Mix from this
        </button>
      </div>
    </section>
  )
}

function Progress({ duration, playing, clock, onSeek }: { duration?: number; playing: boolean; clock: Clock; onSeek: (s: number) => void }) {
  const fill = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)

  // Drive the bar straight from the DOM so the rest of the app doesn't re-render every frame.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const { at, time } = clock.current
      const t = playing ? time + (performance.now() - at) / 1000 : time
      const pct = duration ? Math.min(100, (t / duration) * 100) : 0
      if (fill.current) fill.current.style.width = `${pct}%`
      if (label.current) label.current.textContent = fmtDuration(Math.min(t, duration ?? t))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clock, duration, playing])

  return (
    <div className="progress">
      <div
        className="progress-track"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration ?? 0)}
        tabIndex={0}
        onClick={(e) => {
          if (!duration) return
          const r = e.currentTarget.getBoundingClientRect()
          onSeek(((e.clientX - r.left) / r.width) * duration)
        }}
      >
        <div className="progress-fill" ref={fill} />
      </div>
      <div className="progress-times">
        <span ref={label}>0:00</span>
        <span>{fmtDuration(duration)}</span>
      </div>
    </div>
  )
}
