import { useEffect, useMemo, useRef, useState } from 'react'
import { coverUrl, isMixable, search, type Album, type Artist, type Seed, type Track } from './lms'
import { Cover, fmtDuration } from './ui'

type Hit =
  | { kind: 'artist'; item: Artist }
  | { kind: 'album'; item: Album }
  | { kind: 'track'; item: Track }

type Results = { tracks: Track[]; albums: Album[]; artists: Artist[] }

export function Search(props: {
  initialTerm?: string
  onClose: () => void
  onMix: (seed: Seed) => void
  onTrack: (t: Track, mode: 'insert' | 'add') => void
  onAlbum: (a: Album, mode: 'load' | 'insert' | 'add') => void
}) {
  const [term, setTerm] = useState(props.initialTerm ?? '')
  const [results, setResults] = useState<Results | null>(null)
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) {
      setResults(null)
      return
    }
    let stale = false
    const id = setTimeout(async () => {
      const r = await search(q)
      if (!stale) {
        setResults(r)
        setActive(0)
        setNotice('')
      }
    }, 180)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [term])

  // Tracks first: picking a seed track is the most common reason to search.
  const hits: Hit[] = useMemo(
    () =>
      results
        ? [
            ...results.tracks.map((item) => ({ kind: 'track' as const, item })),
            ...results.artists.map((item) => ({ kind: 'artist' as const, item })),
            ...results.albums.map((item) => ({ kind: 'album' as const, item })),
          ]
        : [],
    [results],
  )

  useEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const seedOf = (h: Hit): Seed =>
    h.kind === 'track'
      ? { kind: 'track', id: h.item.id, label: h.item.title }
      : h.kind === 'album'
        ? { kind: 'album', id: h.item.id, label: h.item.album }
        : { kind: 'artist', id: h.item.id, label: h.item.artist }

  const choose = (h: Hit) => {
    if (h.kind === 'track' && !isMixable(h.item))
      setNotice(`MusicIP hasn't analysed “${h.item.title}”, so it can't mix from it. Shift+Enter plays it next.`)
    else props.onMix(seedOf(h))
  }

  const onKey = (e: React.KeyboardEvent) => {
    const h = hits[active]
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Escape') {
      props.onClose()
    } else if (e.key === 'Enter' && h) {
      e.preventDefault()
      if (e.shiftKey && h.kind === 'track') props.onTrack(h.item, 'insert')
      else if (e.altKey && h.kind === 'track') props.onTrack(h.item, 'add')
      else if (e.shiftKey && h.kind === 'album') props.onAlbum(h.item, 'insert')
      else if (e.altKey && h.kind === 'album') props.onAlbum(h.item, 'add')
      else choose(h)
    }
  }

  let idx = -1
  const group = (title: string, kind: Hit['kind']) => {
    const items = hits.filter((h) => h.kind === kind)
    if (!items.length) return null
    return (
      <div className="search-group" key={kind}>
        <h3 className="search-group-title">{title}</h3>
        {items.map((h) => {
          idx++
          const i = idx
          return (
            <div
              key={`${kind}-${h.item.id}`}
              className={'hit' + (i === active ? ' is-active' : '')}
              onMouseMove={() => setActive(i)}
              onClick={() => choose(h)}
            >
              {h.kind === 'track' && (
                <>
                  <Cover className="row-cover" src={coverUrl(h.item.coverid, 96)} name={h.item.album} />
                  <span className="hit-main">
                    <span className="row-title">{h.item.title}</span>
                    <span className="row-sub">
                      <span className="row-artist">{h.item.artist}</span>
                      <span className="row-album">{h.item.album}</span>
                    </span>
                  </span>
                  <span className="row-aside">{isMixable(h.item) ? fmtDuration(h.item.duration) : 'Not analysed'}</span>
                </>
              )}
              {h.kind === 'album' && (
                <>
                  <Cover className="row-cover" src={coverUrl(h.item.artwork_track_id, 96)} name={h.item.album} />
                  <span className="hit-main">
                    <span className="row-title">{h.item.album}</span>
                    <span className="row-sub">
                      <span className="row-artist">{h.item.artist}</span>
                      {h.item.year ? <span className="row-album">{h.item.year}</span> : null}
                    </span>
                  </span>
                </>
              )}
              {h.kind === 'artist' && (
                <span className="hit-main">
                  <span className="row-title">{h.item.artist}</span>
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="search" role="dialog" aria-label="Search library" onKeyDown={onKey}>
        <input
          ref={input}
          className="search-input"
          placeholder="Find a track, artist or album to mix from"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search"
        />
        <div className="search-results" ref={list}>
          {results && !hits.length && <p className="search-empty">Nothing in the library matches “{term.trim()}”.</p>}
          {group('Tracks', 'track')}
          {group('Artists', 'artist')}
          {group('Albums', 'album')}
        </div>
        {notice && <p className="search-notice">{notice}</p>}
        <p className="search-keys">
          <span><kbd>Enter</kbd> mix from it</span>
          <span><kbd>Shift</kbd><kbd>Enter</kbd> play next</span>
          <span><kbd>Alt</kbd><kbd>Enter</kbd> add to end</span>
        </p>
      </div>
    </div>
  )
}
