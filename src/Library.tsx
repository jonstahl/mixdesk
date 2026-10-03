import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as lms from './lms'
import type { Album, AlbumSort, Seed, Track } from './lms'
import { href, type Route } from './router'
import { TrackRow } from './RunningOrder'
import { Cover, fmtDuration, Icon } from './ui'

export type LibraryActions = {
  onMix: (seed: Seed) => void
  onAlbum: (album: Album, mode: lms.AddMode) => void
  onTrack: (track: Track, mode: 'insert' | 'add') => void
}

type Props = LibraryActions & { route: Route }

export function Library(props: Props) {
  const { route } = props
  // Each page owns its scroll position; start new pages at the top.
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollTo(0, 0)
  }, [route])
  return (
    <section className="library" ref={ref} aria-label="Library">
      <Page {...props} />
    </section>
  )
}

function Page(props: Props) {
  const { route } = props
  switch (route.page) {
    case 'artists':
      return <ArtistIndex />
    case 'artist':
      return <ArtistPage {...props} id={route.id} name={route.name} />
    case 'albums':
      return <AllAlbums />
    case 'album':
      return <AlbumPage {...props} id={route.id} />
    case 'genres':
      return <GenreIndex />
    case 'genre':
      return <GenrePage {...props} id={route.id} name={route.name} />
    case 'years':
      return <YearIndex />
    case 'year':
      return <YearPage year={route.year} />
    case 'new':
      return <NewMusic />
    default:
      return <LibraryHome />
  }
}

// --- plumbing ------------------------------------------------------------------

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let stale = false
    setState((s) => ({ data: s.data, loading: true }))
    load().then(
      (data) => !stale && setState({ data, loading: false }),
      (e) => !stale && setState({ error: e instanceof Error ? e.message : String(e), loading: false }),
    )
    return () => {
      stale = true
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}

function PageHead(props: { up?: Route; upLabel?: string; title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      {props.up && (
        <a className="page-up" href={href(props.up)}>
          {props.upLabel}
        </a>
      )}
      <h2 className="page-title">{props.title}</h2>
      {props.meta && <p className="page-meta">{props.meta}</p>}
      {props.children && <div className="page-actions">{props.children}</div>}
    </header>
  )
}

function Status({ error, loading, empty }: { error?: string; loading: boolean; empty?: boolean }) {
  if (error) return <p className="page-note is-error">Lyrion didn't answer: {error}</p>
  if (loading) return <p className="page-note">Loading…</p>
  if (empty) return <p className="page-note">Nothing here.</p>
  return null
}

const n = (x: number) => x.toLocaleString()

// --- album grid ------------------------------------------------------------------

function AlbumGrid({ albums, show = 'artist' }: { albums: Album[]; show?: 'artist' | 'year' | 'both' }) {
  return (
    <ul className="album-grid">
      {albums.map((a) => (
        <li key={a.id} className="tile">
          <a href={href({ page: 'album', id: String(a.id) })}>
            <Cover className="tile-cover" src={lms.coverUrl(a.artwork_track_id, 300)} name={a.album} />
            <span className="tile-title">{a.album}</span>
            <span className="tile-sub">
              {show !== 'year' && a.artist}
              {show === 'both' && a.year ? ', ' : ''}
              {show !== 'artist' && a.year ? a.year : ''}
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

// --- home --------------------------------------------------------------------------

function LibraryHome() {
  const totals = useLoad(() => lms.getTotals(), [])
  const artists = useLoad(() => lms.getAlbumArtists(), [])
  const genres = useLoad(() => lms.getGenres(), [])
  const years = useLoad(() => lms.getYears(), [])
  const fresh = useLoad(() => lms.getAlbums([], 'new', 12), [])
  const [shuffle, setShuffle] = useState(0)
  const random = useLoad(() => lms.getAlbums([], 'random', 12), [shuffle])

  // Ignore mistagged years like "97" when showing the span.
  const realYears = years.data?.filter((y) => y >= 1000) ?? []
  const yearSpan = realYears.length ? `${Math.min(...realYears)} to ${Math.max(...realYears)}` : ''
  const index: { route: Route; label: string; count?: string }[] = [
    { route: { page: 'artists' }, label: 'Artists', count: artists.data && n(artists.data.length) },
    { route: { page: 'albums' }, label: 'Albums', count: totals.data && n(totals.data.albums) },
    { route: { page: 'genres' }, label: 'Genres', count: genres.data && n(genres.data.length) },
    { route: { page: 'years' }, label: 'Years', count: yearSpan },
  ]

  return (
    <>
      <nav className="lib-index" aria-label="Browse by">
        {index.map((i) => (
          <a key={i.label} href={href(i.route)}>
            <span className="lib-index-label">{i.label}</span>
            <span className="lib-index-count">{i.count ?? ' '}</span>
          </a>
        ))}
      </nav>

      <section className="shelf">
        <header className="shelf-head">
          <h2>New music</h2>
          <a className="text-btn" href={href({ page: 'new' })}>
            See all
          </a>
        </header>
        <Status {...fresh} />
        {fresh.data && <AlbumGrid albums={fresh.data} />}
      </section>

      <section className="shelf">
        <header className="shelf-head">
          <h2>Something different</h2>
          <button className="text-btn" onClick={() => setShuffle((s) => s + 1)}>
            <Icon name="reroll" size={18} /> Shuffle
          </button>
        </header>
        <Status {...random} />
        {random.data && <AlbumGrid albums={random.data} show="both" />}
      </section>
    </>
  )
}

// --- indexes -------------------------------------------------------------------------

type IndexItem = { key: string | number; label: string; textkey?: string; route: Route }

/** A book-style index: names in columns under their initial, with a filter box. */
function BookIndex({ items, noun }: { items: IndexItem[]; noun: string }) {
  const [filter, setFilter] = useState('')
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const out = new Map<string, IndexItem[]>()
    for (const it of items) {
      if (q && !it.label.toLowerCase().includes(q)) continue
      const k = /^[A-Z]$/i.test(it.textkey ?? '') ? it.textkey!.toUpperCase() : '#'
      if (!out.has(k)) out.set(k, [])
      out.get(k)!.push(it)
    }
    return [...out.entries()]
  }, [items, filter])

  return (
    <>
      <div className="index-tools">
        <input
          className="index-filter"
          placeholder={`Filter ${n(items.length)} ${noun}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label={`Filter ${noun}`}
        />
        <nav className="index-letters" aria-label="Jump to letter">
          {groups.map(([k]) => (
            <a key={k} href={`#idx-${k}`} onClick={(e) => (e.preventDefault(), document.getElementById(`idx-${k}`)?.scrollIntoView())}>
              {k}
            </a>
          ))}
        </nav>
      </div>
      {!groups.length && <p className="page-note">No {noun} match “{filter.trim()}”.</p>}
      <div className="book-index">
        {groups.map(([k, list]) => (
          <section key={k} id={`idx-${k}`} className="index-group">
            <h3 className="index-letter">{k}</h3>
            <ul>
              {list.map((it) => (
                <li key={it.key}>
                  <a href={href(it.route)}>{it.label}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

function ArtistIndex() {
  const s = useLoad(() => lms.getAlbumArtists(), [])
  const items = useMemo(
    () =>
      (s.data ?? []).map((a) => ({
        key: a.id,
        label: a.artist,
        textkey: a.textkey,
        route: { page: 'artist', id: String(a.id), name: a.artist } as Route,
      })),
    [s.data],
  )
  return (
    <>
      <PageHead up={{ page: 'library' }} upLabel="Library" title="Artists" />
      <Status {...s} />
      {s.data && <BookIndex items={items} noun="artists" />}
    </>
  )
}

function GenreIndex() {
  const s = useLoad(() => lms.getGenres(), [])
  const items = useMemo(
    () =>
      (s.data ?? []).map((g) => ({
        key: g.id,
        label: g.genre,
        textkey: g.textkey,
        route: { page: 'genre', id: String(g.id), name: g.genre } as Route,
      })),
    [s.data],
  )
  return (
    <>
      <PageHead up={{ page: 'library' }} upLabel="Library" title="Genres" />
      <Status {...s} />
      {s.data && <BookIndex items={items} noun="genres" />}
    </>
  )
}

function YearIndex() {
  const s = useLoad(() => lms.getYears(), [])
  const decades = useMemo(() => {
    const out = new Map<number, number[]>()
    for (const y of [...(s.data ?? [])].sort((a, b) => a - b)) {
      const d = Math.floor(y / 10) * 10
      if (!out.has(d)) out.set(d, [])
      out.get(d)!.push(y)
    }
    return [...out.entries()].reverse()
  }, [s.data])
  return (
    <>
      <PageHead up={{ page: 'library' }} upLabel="Library" title="Years" />
      <Status {...s} />
      <div className="decades">
        {decades.map(([d, ys]) => (
          <section key={d} className="decade">
            <h3 className="decade-label">{d}s</h3>
            <ul className="decade-years">
              {ys.map((y) => (
                <li key={y}>
                  <a href={href({ page: 'year', year: String(y) })}>{y}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

// --- album lists -----------------------------------------------------------------------

/** Renders only once LMS confirms MusicIP can mix this, so a dead button never appears. */
function MixButton(props: { kind: 'album' | 'artist' | 'genre'; id: string | number; label: string; onMix: (s: Seed) => void; text: string }) {
  const ok = useLoad(() => lms.canMix(props.kind, props.id), [props.kind, props.id])
  if (!ok.data) return null
  return (
    <button className="primary-btn" onClick={() => props.onMix({ kind: props.kind, id: props.id, label: props.label })}>
      <Icon name="mix" size={18} /> {props.text}
    </button>
  )
}

function ArtistPage(props: Props & { id: string; name: string }) {
  const s = useLoad(() => lms.getAlbums([`artist_id:${props.id}`], 'yearalbum'), [props.id])
  return (
    <>
      <PageHead
        up={{ page: 'artists' }}
        upLabel="Artists"
        title={props.name}
        meta={s.data && `${s.data.length} ${s.data.length === 1 ? 'album' : 'albums'}`}
      >
        <MixButton kind="artist" id={props.id} label={props.name} onMix={props.onMix} text={`Mix from ${props.name}`} />
      </PageHead>
      <Status {...s} empty={s.data?.length === 0} />
      {s.data && <AlbumGrid albums={s.data} show="year" />}
    </>
  )
}

function GenrePage(props: Props & { id: string; name: string }) {
  const s = useLoad(() => lms.getAlbums([`genre_id:${props.id}`], 'artflow'), [props.id])
  return (
    <>
      <PageHead
        up={{ page: 'genres' }}
        upLabel="Genres"
        title={props.name}
        meta={s.data && `${n(s.data.length)} ${s.data.length === 1 ? 'album' : 'albums'}`}
      >
        <MixButton kind="genre" id={props.id} label={props.name} onMix={props.onMix} text={`Mix from ${props.name}`} />
      </PageHead>
      <Status {...s} empty={s.data?.length === 0} />
      {s.data && <AlbumGrid albums={s.data} />}
    </>
  )
}

function YearPage({ year }: { year: string }) {
  const s = useLoad(() => lms.getAlbums([`year:${year}`], 'artflow'), [year])
  return (
    <>
      <PageHead up={{ page: 'years' }} upLabel="Years" title={year} meta={s.data && `${n(s.data.length)} albums`} />
      <Status {...s} empty={s.data?.length === 0} />
      {s.data && <AlbumGrid albums={s.data} />}
    </>
  )
}

function NewMusic() {
  const s = useLoad(() => lms.getAlbums([], 'new', 100), [])
  return (
    <>
      <PageHead up={{ page: 'library' }} upLabel="Library" title="New music" meta="The 100 most recently added albums" />
      <Status {...s} />
      {s.data && <AlbumGrid albums={s.data} />}
    </>
  )
}

const SORTS: { value: AlbumSort; label: string }[] = [
  { value: 'artflow', label: 'Artist' },
  { value: 'album', label: 'Title' },
  { value: 'yearalbum', label: 'Year' },
]

function AllAlbums() {
  const [sort, setSort] = useState<AlbumSort>('artflow')
  const s = useLoad(() => lms.getAlbums([], sort), [sort])
  return (
    <>
      <PageHead up={{ page: 'library' }} upLabel="Library" title="Albums" meta={s.data && `${n(s.data.length)} albums`}>
        <div className="segmented" role="group" aria-label="Sort by">
          {SORTS.map((o) => (
            <button key={o.value} aria-pressed={sort === o.value} onClick={() => setSort(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </PageHead>
      <Status {...s} />
      {s.data && <AlbumGrid albums={s.data} show={sort === 'yearalbum' ? 'both' : 'artist'} />}
    </>
  )
}

// --- album ---------------------------------------------------------------------------------

function AlbumPage(props: Props & { id: string }) {
  const album = useLoad(() => lms.getAlbum(props.id), [props.id])
  const tracks = useLoad(() => lms.getAlbumTracks(props.id), [props.id])
  const [sel, setSel] = useState<number | null>(null)
  const a = album.data
  const list = tracks.data ?? []
  const total = list.reduce((s, t) => s + (t.duration ?? 0), 0)
  const discs = new Set(list.map((t) => t.disc ?? '1'))
  const multiDisc = discs.size > 1

  return (
    <>
      <Status error={album.error ?? tracks.error} loading={album.loading && !a} />
      {a && (
        <header className="album-head">
          <Cover className="album-cover" src={lms.coverUrl(a.artwork_track_id, 600)} name={a.album} full />
          <div className="album-info">
            <h2 className="page-title">{a.album}</h2>
            <p className="album-by">
              {a.artist_id ? (
                <a href={href({ page: 'artist', id: String(a.artist_id), name: a.artist ?? '' })}>{a.artist}</a>
              ) : (
                a.artist
              )}
              {a.year ? (
                <a className="album-year" href={href({ page: 'year', year: String(a.year) })}>
                  {a.year}
                </a>
              ) : null}
            </p>
            <p className="page-meta">
              {list.length} {list.length === 1 ? 'track' : 'tracks'}, {fmtDuration(total)}
            </p>
            <div className="page-actions">
              <MixButton kind="album" id={a.id} label={a.album} onMix={props.onMix} text="Mix from this album" />
              <button className="text-btn" onClick={() => props.onAlbum(a, 'load')}>
                <Icon name="play" size={18} /> Play
              </button>
              <button className="text-btn" onClick={() => props.onAlbum(a, 'insert')}>
                Play next
              </button>
              <button className="text-btn" onClick={() => props.onAlbum(a, 'add')}>
                Add to end
              </button>
            </div>
          </div>
        </header>
      )}
      <ol className="rows album-tracks">
        {list.map((t, i) => {
          const showDisc = multiDisc && (i === 0 || list[i - 1].disc !== t.disc)
          const mix = lms.isMixable(t) ? () => props.onMix({ kind: 'track', id: t.id, label: t.title }) : undefined
          return (
            <FragmentRow key={t.id} heading={showDisc ? `Disc ${t.disc ?? 1}` : undefined}>
              <TrackRow
                track={t}
                lead={<span className="row-num">{t.tracknum || ''}</span>}
                sub={t.artist && t.artist !== a?.artist ? t.artist : undefined}
                selected={sel === i}
                onSelect={() => setSel(i)}
                onActivate={mix}
                actions={[
                  ...(mix ? [{ icon: 'mix', label: 'Mix from this', run: mix } as const] : []),
                  { icon: 'playNext', label: 'Play next', run: () => props.onTrack(t, 'insert') },
                  { icon: 'add', label: 'Add to end', run: () => props.onTrack(t, 'add') },
                ]}
              />
            </FragmentRow>
          )
        })}
      </ol>
    </>
  )
}

function FragmentRow({ heading, children }: { heading?: string; children: ReactNode }) {
  return (
    <>
      {heading && <li className="disc-heading">{heading}</li>}
      {children}
    </>
  )
}
