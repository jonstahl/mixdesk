import { useMemo, useState } from 'react'
import * as lms from './lms'
import type { LapsedTrack, Seed, StatRange, StatSummary, Track, UnplayedArtist } from './lms'
import { PageHead, Status, useLoad } from './Library'
import { href } from './router'
import { TrackRow, type RowAction } from './RunningOrder'
import { Cover, Icon } from './ui'

// What TrackStat has recorded, drawn. Every list ends in a way to start a
// mix, so a number is somewhere to start from rather than just a report.

const RANGE_KEY = 'mixdesk.statsRange'
const RANGES: { days: StatRange; label: string; phrase: string }[] = [
  { days: 30, label: '30 days', phrase: 'the last 30 days' },
  { days: 365, label: '12 months', phrase: 'the last 12 months' },
  { days: 0, label: 'All time', phrase: 'all time' },
]

const ARTIST_PAGE = 10
const LAPSED_PAGE = 8
// The longest bar in "Loved, but not lately"; anything older fills it.
const LAPSED_SCALE_YEARS = 6

const DAY = 86400
const n = (x: number) => x.toLocaleString()

function readRange(): StatRange {
  try {
    // Number(null) is 0, which would read as "All time" for a first visit.
    const raw = localStorage.getItem(RANGE_KEY)
    const saved = raw === null ? NaN : Number(raw)
    if (RANGES.some((r) => r.days === saved)) return saved as StatRange
  } catch {
    /* private window: fine to forget */
  }
  return 365
}

type Props = {
  onMix: (seed: Seed) => void
  onTrack: (track: Track, mode: 'insert' | 'add') => void
}

export function Stats({ onMix, onTrack }: Props) {
  const [range, setRangeState] = useState<StatRange>(readRange)
  const setRange = (r: StatRange) => {
    setRangeState(r)
    try {
      localStorage.setItem(RANGE_KEY, String(r))
    } catch {
      /* private window: fine to forget */
    }
  }
  const stats = useLoad(() => lms.getStats(range), [range])
  const [now] = useState(() => Date.now() / 1000)
  const phrase = RANGES.find((r) => r.days === range)!.phrase
  const s = stats.data

  return (
    <section className="library stats" aria-label="Stats">
      <PageHead
        title="Listening"
        meta={s?.available ? `${n(s.plays)} plays of ${n(s.tracks)} tracks in ${phrase}.` : undefined}
      >
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.days} aria-pressed={r.days === range} onClick={() => setRange(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </PageHead>

      <Status error={stats.error} loading={stats.loading && !s} />
      {s && !s.available && (
        <p className="page-note">TrackStat hasn't recorded any plays yet. Check that its play history is switched on in its settings.</p>
      )}
      {s?.available && (
        <>
          <Tiles s={s} range={range} now={now} />
          <Calendar s={s} now={now} />
          <Artists key={range} range={range} phrase={phrase} onMix={onMix} />
          <Lapsed now={now} onMix={onMix} onTrack={onTrack} />
          <Unplayed onMix={onMix} />
        </>
      )}
    </section>
  )
}

// --- headline figures --------------------------------------------------------------

function Tiles({ s, range, now }: { s: StatSummary; range: StatRange; now: number }) {
  const heard = s.library ? (s.tracks / s.library) * 100 : 0
  const rated = s.library ? (s.rated / s.library) * 100 : 0
  // For all time, the span is from the first play recorded.
  const span = range || Math.max(1, Math.ceil((now - s.first) / DAY))
  const stars = [5, 4, 3, 2, 1].filter((k) => s.stars[k])
  return (
    <div className="stats-tiles">
      <section className="stat-tile">
        <h3>Plays</h3>
        <p className="stat-value">{n(s.plays)}</p>
        <p className="stat-note">
          {n(s.tracks)} tracks by {n(s.artists)} artists
        </p>
      </section>
      <section className="stat-tile">
        <h3>Library heard</h3>
        <p className="stat-value">{heard >= 10 ? Math.round(heard) : heard.toFixed(1)}%</p>
        <p className="stat-note">
          {n(s.tracks)} of {n(s.library)} tracks
        </p>
        <div className="stat-meter" role="img" aria-label={`${Math.round(heard)} percent of the library`}>
          <span style={{ width: `${Math.min(100, heard)}%` }} />
        </div>
      </section>
      <section className="stat-tile">
        <h3>Rated</h3>
        <p className="stat-value">{n(s.rated)}</p>
        <p className="stat-note">
          {rated < 10 ? rated.toFixed(1) : Math.round(rated)}% of the library
          {stars.length > 0 && (
            <>
              {' · '}
              {stars.map((k) => `${s.stars[k]} at ${k}★`).join(', ')}
            </>
          )}
        </p>
      </section>
      <section className="stat-tile">
        <h3>Days listening</h3>
        <p className="stat-value">
          {n(s.activeDays)} <span className="stat-of">of {n(span)}</span>
        </p>
        <p className="stat-note">days with at least one play</p>
      </section>
    </div>
  )
}

// --- calendar ------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKS = 53

// Fixed steps, so a colour means the same thing in every range.
const level = (plays: number) => (plays === 0 ? 0 : plays < 10 ? 1 : plays < 50 ? 2 : plays < 100 ? 3 : 4)

/** A day number is days since 1970-01-01 on the viewer's calendar, so read it as UTC. */
const dayDate = (day: number) => new Date(day * DAY * 1000)
const dayLabel = (day: number) => dayDate(day).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })

function Calendar({ s, now }: { s: StatSummary; now: number }) {
  const cal = useMemo(() => {
    const tz = -new Date(now * 1000).getTimezoneOffset() * 60
    const today = Math.floor((now + tz) / DAY)
    // Weeks run Monday to Sunday and the last column is this week. 1970-01-01 was a Thursday.
    const monday = today - ((today + 3) % 7)
    const start = monday - (WEEKS - 1) * 7
    const plays = new Map(s.days.map((d) => [d.day, d.plays]))
    const cells = Array.from({ length: WEEKS * 7 }, (_, i) => ({ day: start + i, plays: plays.get(start + i) ?? 0, future: start + i > today }))
    const peak = cells.reduce((best, c) => (c.plays > best.plays ? c : best), cells[0])
    const months = Array.from({ length: WEEKS }, (_, c) => {
      const m = dayDate(start + c * 7).getUTCMonth()
      const prev = c ? dayDate(start + (c - 1) * 7).getUTCMonth() : -1
      // The last two columns have no room for a name.
      return m !== prev && c < WEEKS - 2 ? MONTHS[m] : ''
    })
    return { cells, months, busiest: peak.plays, busiestDay: peak.day }
  }, [s.days, now])

  return (
    <section className="stat-card">
      <header className="stat-head">
        <div>
          <h2>Plays per day</h2>
          <p>
            Last 12 months
            {cal.busiest > 0 && `. Busiest: ${dayLabel(cal.busiestDay)}, ${n(cal.busiest)} plays`}
          </p>
        </div>
        <div className="cal-legend" aria-hidden="true">
          <span>Fewer</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`cal-cell l${l}`} />
          ))}
          <span>More</span>
        </div>
      </header>
      <div className="cal-scroll">
        <div className="cal" role="img" aria-label={`Plays per day over the last year. ${n(cal.busiest)} plays on the busiest day.`}>
          <span />
          <div className="cal-months">
            {cal.months.map((m, c) => (
              <span key={c}>{m}</span>
            ))}
          </div>
          <div className="cal-days">
            <span>Mon</span>
            <span />
            <span>Wed</span>
            <span />
            <span>Fri</span>
            <span />
            <span>Sun</span>
          </div>
          <div className="cal-grid">
            {cal.cells.map((c) =>
              c.future ? (
                <span key={c.day} />
              ) : (
                <span
                  key={c.day}
                  className={`cal-cell l${level(c.plays)}${c.day === cal.busiestDay ? ' is-peak' : ''}`}
                  title={`${dayLabel(c.day)}: ${c.plays ? `${n(c.plays)} plays` : 'no plays'}`}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// --- paging --------------------------------------------------------------------------

function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  if (total <= size) return null
  const from = page * size + 1
  const to = Math.min(total, (page + 1) * size)
  return (
    <div className="stat-pager">
      <span>
        {n(from)}–{n(to)} of {n(total)}
      </span>
      <button className="icon-btn" onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
        <Icon name="left" />
      </button>
      <button className="icon-btn" onClick={() => onPage(page + 1)} disabled={to >= total} aria-label="Next page">
        <Icon name="right" />
      </button>
    </div>
  )
}

// --- artists -------------------------------------------------------------------------

function Artists({ range, phrase, onMix }: { range: StatRange; phrase: string; onMix: (seed: Seed) => void }) {
  const [page, setPage] = useState(0)
  const list = useLoad(() => lms.getStatArtists(range, page * ARTIST_PAGE, ARTIST_PAGE), [range, page])
  // Bars are measured against the top artist, who is only on the first page,
  // so that page's figure is kept for the others.
  const [top, setTop] = useState(0)
  const items = list.data?.artists ?? []
  const scale = Math.max(1, page === 0 ? (items[0]?.plays ?? 0) : top)
  const goTo = (p: number) => {
    if (page === 0 && items.length) setTop(items[0].plays)
    setPage(p)
  }

  return (
    <section className="stat-card">
      <header className="stat-head">
        <div>
          <h2>Most played artists</h2>
          <p>By plays in {phrase}.</p>
        </div>
        <Pager page={page} size={ARTIST_PAGE} total={list.data?.total ?? 0} onPage={goTo} />
      </header>
      <Status error={list.error} loading={list.loading && !list.data} empty={!!list.data && !items.length} />
      <ol className="stat-list" aria-busy={list.loading}>
        {items.map((a) => (
          <li key={a.id} className="stat-row">
            <a className="stat-name" href={href({ page: 'artist', id: String(a.id), name: a.artist })}>
              {a.artist}
            </a>
            <span className="stat-bar" aria-hidden="true">
              <span style={{ width: `${(a.plays / scale) * 100}%` }} />
            </span>
            <span className="stat-count">{n(a.plays)}</span>
            {a.mixable ? (
              <button
                className="icon-btn"
                title="Mix from this artist"
                aria-label={`Mix from ${a.artist}`}
                onClick={() => onMix({ kind: 'artist', id: a.id, label: a.artist })}
              >
                <Icon name="mix" size={18} />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

// --- loved, but not lately -------------------------------------------------------

const YEAR = 365.25 * DAY

function Lapsed({ now, onMix, onTrack }: Pick<Props, 'onMix' | 'onTrack'> & { now: number }) {
  const [page, setPage] = useState(0)
  const list = useLoad(() => lms.getLapsed(page * LAPSED_PAGE, LAPSED_PAGE), [page])
  const items = list.data?.tracks ?? []

  const actions = (t: LapsedTrack): RowAction[] => [
    { icon: 'playNext', label: 'Play next', run: () => onTrack(t, 'insert') },
    ...(lms.isMixable(t) ? [{ icon: 'mix', label: 'Mix from this', run: () => onMix({ kind: 'track', id: t.id, label: t.title }) } as RowAction] : []),
  ]

  return (
    <section className="stat-card">
      <header className="stat-head">
        <div>
          <h2>Loved, but not lately</h2>
          <p>Rated 4 or 5 stars and not played in over a year, most played first.</p>
        </div>
        <Pager page={page} size={LAPSED_PAGE} total={list.data?.total ?? 0} onPage={setPage} />
      </header>
      <Status error={list.error} loading={list.loading && !list.data} empty={!!list.data && !items.length} />
      <ol className="rows stat-lapsed" aria-busy={list.loading}>
        {items.map((t) => {
          const years = t.last ? (now - t.last) / YEAR : 0
          const when = t.last ? new Date(t.last * 1000).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''
          return (
            <TrackRow
              key={t.id}
              track={t}
              actions={actions(t)}
              aside={
                t.last ? (
                  <span className="lapse" title={`${t.plays} plays, last played ${when}`}>
                    <span className="stat-bar" aria-hidden="true">
                      <span style={{ width: `${Math.min(100, (years / LAPSED_SCALE_YEARS) * 100)}%` }} />
                    </span>
                    <span className="lapse-years">{years.toFixed(1)} yr</span>
                  </span>
                ) : (
                  <span className="lapse-years">Never played</span>
                )
              }
            />
          )
        })}
      </ol>
    </section>
  )
}

// --- never played -------------------------------------------------------------------

const UNPLAYED_COUNT = 12

/**
 * A random handful of artists you own and have never played, as a grid: the
 * square opens them in the library, and the round button mixes from them.
 */
function Unplayed({ onMix }: Pick<Props, 'onMix'>) {
  const [shuffle, setShuffle] = useState(0)
  const list = useLoad(() => lms.getUnplayedArtists(UNPLAYED_COUNT), [shuffle])
  const items = list.data?.artists ?? []
  // No unplayed artists is a good problem; the section only appears with some.
  if (list.data && !list.data.total) return null

  return (
    <section className="stat-card">
      <header className="stat-head">
        <div>
          <h2>Never played</h2>
          <p>
            {list.data ? `${n(list.data.total)} artists in your library you haven't played yet.` : 'Artists in your library you haven’t played yet.'}
          </p>
        </div>
        <button className="text-btn" onClick={() => setShuffle((x) => x + 1)}>
          <Icon name="reroll" size={18} /> Shuffle
        </button>
      </header>
      <Status error={list.error} loading={list.loading && !list.data} />
      <ul className="album-grid stat-unplayed" aria-busy={list.loading}>
        {items.map((a) => (
          <UnplayedTile key={a.id} artist={a} onMix={onMix} />
        ))}
      </ul>
    </section>
  )
}

function UnplayedTile({ artist: a, onMix }: { artist: UnplayedArtist; onMix: Props['onMix'] }) {
  return (
    <li className="tile">
      {a.mixable && (
        <div className="tile-actions">
          <button
            className="tile-btn"
            title="Mix from this artist"
            aria-label={`Mix from ${a.artist}`}
            onClick={() => onMix({ kind: 'artist', id: a.id, label: a.artist })}
          >
            <Icon name="mix" size={14} />
          </button>
        </div>
      )}
      <a href={href({ page: 'artist', id: String(a.id), name: a.artist })}>
        <Cover className="tile-cover" src={lms.coverUrl(a.coverid, 300)} name={a.artist} />
        <span className="tile-title">{a.artist}</span>
        <span className="tile-sub">{a.albums === 1 ? '1 album' : `${n(a.albums)} albums`}</span>
      </a>
    </li>
  )
}
