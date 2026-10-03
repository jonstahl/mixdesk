import { useEffect, useMemo, useRef, useState } from 'react'
import { canMix, coverUrl, isMixable, search, type Album, type Artist, type Seed, type Track } from './lms'
import type { Route } from './router'
import { Cover, fmtDuration } from './ui'

type Hit =
  | { kind: 'artist'; item: Artist }
  | { kind: 'album'; item: Album }
  | { kind: 'track'; item: Track }

type Kind = Hit['kind']
type Results = { tracks: Track[]; albums: Album[]; artists: Artist[] }

/** Which key combination triggers an action: plain Enter, ⌘Enter, ⇧Enter or ⌥Enter. */
type Mod = 'enter' | 'meta' | 'shift' | 'alt'
type Action = { mod?: Mod; label: string; run: () => void }

const KEY_LABEL: Record<Mod, string[]> = { enter: ['Enter'], meta: ['⌘', 'Enter'], shift: ['Shift', 'Enter'], alt: ['Alt', 'Enter'] }
const TITLES: Record<Kind, string> = { track: 'Tracks', artist: 'Artists', album: 'Albums' }

export function Search(props: {
  initialTerm?: string
  onClose: () => void
  onMix: (seed: Seed) => void
  onOpen: (route: Route) => void
  onTrack: (t: Track, mode: 'play' | 'insert' | 'add') => void
  onAlbum: (a: Album, mode: 'load' | 'insert' | 'add') => void
}) {
  const [term, setTerm] = useState(props.initialTerm ?? '')
  const [results, setResults] = useState<{ q: string; r: Results } | null>(null)
  const [active, setActive] = useState(0)
  const [notice, setNotice] = useState('')
  // MusicIP mixability of albums and artists, checked as each one is highlighted.
  const [mixable, setMixable] = useState<Record<string, boolean>>({})
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Letters typed in the moment before the box took focus arrive as a longer initial term.
  useEffect(() => {
    if (props.initialTerm) setTerm(props.initialTerm)
  }, [props.initialTerm])

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
        setResults({ q, r })
        setActive(0)
        setNotice('')
      }
    }, 180)
    return () => {
      stale = true
      clearTimeout(id)
    }
  }, [term])

  // Tracks come first because picking a seed is the usual reason to search,
  // unless the query names an artist or album exactly and no track.
  const order: Kind[] = useMemo(() => {
    if (!results) return []
    const q = results.q.toLowerCase()
    const exact = (s?: string) => s?.trim().toLowerCase() === q
    if (results.r.tracks.some((t) => exact(t.title))) return ['track', 'artist', 'album']
    if (results.r.artists.some((a) => exact(a.artist))) return ['artist', 'album', 'track']
    if (results.r.albums.some((a) => exact(a.album))) return ['album', 'track', 'artist']
    return ['track', 'artist', 'album']
  }, [results])

  const hits: Hit[] = useMemo(() => {
    if (!results) return []
    const by: Record<Kind, Hit[]> = {
      track: results.r.tracks.map((item) => ({ kind: 'track', item })),
      artist: results.r.artists.map((item) => ({ kind: 'artist', item })),
      album: results.r.albums.map((item) => ({ kind: 'album', item })),
    }
    // An exact name match leads its group, so Enter goes straight to it.
    const q = results.q.toLowerCase()
    const name = (h: Hit) => (h.kind === 'track' ? h.item.title : h.kind === 'album' ? h.item.album : h.item.artist)
    const isExact = (h: Hit) => Number(name(h).trim().toLowerCase() === q)
    return order.flatMap((k) => [...by[k]].sort((a, b) => isExact(b) - isExact(a)))
  }, [results, order])

  const current = hits[active]
  const keyOf = (h: Hit) => `${h.kind}-${h.item.id}`

  useEffect(() => {
    list.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useEffect(() => {
    if (!current || current.kind === 'track') return
    const k = keyOf(current)
    if (k in mixable) return
    canMix(current.kind, current.item.id).then((ok) => setMixable((m) => ({ ...m, [k]: ok })))
  }, [current, mixable])

  const actionsFor = (h: Hit): Action[] => {
    if (h.kind === 'track') {
      const t = h.item
      return [
        ...(isMixable(t) ? [{ mod: 'enter', label: 'Mix', run: () => props.onMix({ kind: 'track', id: t.id, label: t.title }) } as Action] : []),
        { mod: 'meta', label: 'Play now', run: () => props.onTrack(t, 'play') },
        { mod: 'shift', label: 'Play next', run: () => props.onTrack(t, 'insert') },
        { mod: 'alt', label: 'Add to end', run: () => props.onTrack(t, 'add') },
      ]
    }
    const canMixIt = mixable[keyOf(h)]
    if (h.kind === 'album') {
      const a = h.item
      return [
        { mod: 'enter', label: 'Open', run: () => props.onOpen({ page: 'album', id: String(a.id) }) },
        { mod: 'meta', label: 'Play', run: () => props.onAlbum(a, 'load') },
        { mod: 'shift', label: 'Play next', run: () => props.onAlbum(a, 'insert') },
        { mod: 'alt', label: 'Add to end', run: () => props.onAlbum(a, 'add') },
        ...(canMixIt ? [{ label: 'Mix', run: () => props.onMix({ kind: 'album', id: a.id, label: a.album }) }] : []),
      ]
    }
    const ar = h.item
    return [
      { mod: 'enter', label: 'Open', run: () => props.onOpen({ page: 'artist', id: String(ar.id), name: ar.artist }) },
      ...(canMixIt ? [{ mod: 'meta', label: 'Mix', run: () => props.onMix({ kind: 'artist', id: ar.id, label: ar.artist }) } as Action] : []),
    ]
  }

  const currentActions = current ? actionsFor(current) : []

  const runMod = (h: Hit, mod: Mod) => {
    const a = actionsFor(h).find((x) => x.mod === mod)
    if (a) a.run()
    else if (mod === 'enter' && h.kind === 'track')
      setNotice(`MusicIP hasn't analysed “${h.item.title}”, so it can't mix from it. ⌘Enter plays it now.`)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Escape') {
      props.onClose()
    } else if (e.key === 'Enter' && current) {
      e.preventDefault()
      runMod(current, e.metaKey || e.ctrlKey ? 'meta' : e.shiftKey ? 'shift' : e.altKey ? 'alt' : 'enter')
    }
  }

  let idx = -1
  const group = (kind: Kind) => {
    const items = hits.filter((h) => h.kind === kind)
    if (!items.length) return null
    return (
      <div className="search-group" key={kind}>
        <h3 className="search-group-title">{TITLES[kind]}</h3>
        {items.map((h) => {
          idx++
          const i = idx
          const isActive = i === active
          return (
            <div
              key={keyOf(h)}
              className={'hit' + (isActive ? ' is-active' : '')}
              onMouseMove={() => setActive(i)}
              onClick={() => runMod(h, 'enter')}
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
              {isActive ? (
                <span className="hit-actions">
                  {currentActions.map((a) => (
                    <button
                      key={a.label}
                      className="text-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        a.run()
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="row-aside">
                  {h.kind === 'track' && (isMixable(h.item) ? fmtDuration(h.item.duration) : 'Not analysed')}
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
          placeholder="Search tracks, artists and albums"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search"
        />
        <div className="search-results" ref={list}>
          {results && !hits.length && <p className="search-empty">Nothing in the library matches “{term.trim()}”.</p>}
          {order.map(group)}
        </div>
        {notice && <p className="search-notice">{notice}</p>}
        {currentActions.some((a) => a.mod) && (
          <p className="search-keys">
            {currentActions
              .filter((a) => a.mod)
              .map((a) => (
                <span key={a.label}>
                  {KEY_LABEL[a.mod!].map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                  {a.label.toLowerCase()}
                </span>
              ))}
          </p>
        )}
      </div>
    </div>
  )
}
