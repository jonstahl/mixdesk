import type { Seed, Track } from './lms'
import { TrackRow } from './RunningOrder'
import { fmtDuration, Icon } from './ui'

export type DraftState = {
  seed: Seed
  /** The whole mix, less what was cut by hand; the fresh-only filter is applied on top (see shownTracks). */
  tracks: Track[]
  /** Times each track is in the play history; absent when the server can't say. */
  plays?: Record<string, number>
  loading: boolean
  error?: string
  empty?: boolean
}

/** Fresh-only: leave out tracks played more than `max` times. */
export type Fresh = { on: boolean; max: number }

/** The seed track stays whatever its play count: it's what the mix is built from. */
export function shownTracks(draft: DraftState, fresh: Fresh): Track[] {
  const { plays } = draft
  if (!fresh.on || !plays) return draft.tracks
  const seed = draft.seed.kind === 'track' ? String(draft.seed.id) : null
  return draft.tracks.filter((t) => String(t.id) === seed || (plays[String(t.id)] ?? 0) <= fresh.max)
}

export function Draft(props: {
  draft: DraftState
  /** The tracks to list: the draft's, less any the fresh-only filter hides. */
  tracks: Track[]
  fresh: Fresh
  variety: number
  selected: number
  onSelect: (i: number) => void
  onCut: (i: number) => void
  onReroll: () => void
  onVariety: (v: number) => void
  onFresh: (f: Fresh) => void
  onCommit: (mode: 'load' | 'insert' | 'add') => void
  onDiscard: () => void
}) {
  const { draft, tracks } = props
  const hidden = draft.tracks.length - tracks.length
  const total = tracks.reduce((s, t) => s + (t.duration ?? 0), 0)
  return (
    <section className="draft" aria-label="Proposed mix">
      <header className="draft-head">
        <div>
          <h2 className="draft-title">Mix from {draft.seed.label}</h2>
          <p className="draft-meta">
            {draft.loading
              ? 'Asking MusicIP…'
              : tracks.length
                ? `${tracks.length} tracks, ${fmtDuration(total)}. ${hidden ? `${hidden} hidden, played more than ${props.fresh.max} ${props.fresh.max === 1 ? 'time' : 'times'}. ` : ''}Cut what you don't want, then play it.`
                : 'No mix'}
          </p>
        </div>
        <div className="draft-tune">
          {draft.plays && (
            <label className="fresh" title="Leave out tracks you've played more than this many times">
              <input type="checkbox" checked={props.fresh.on} onChange={(e) => props.onFresh({ ...props.fresh, on: e.target.checked })} />
              <span>Fresh only</span>
              {props.fresh.on && (
                <span className="fresh-max">
                  ≤
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={props.fresh.max}
                    onChange={(e) => props.onFresh({ ...props.fresh, max: Math.max(0, Math.min(99, Math.floor(Number(e.target.value)) || 0)) })}
                    aria-label="Most plays a track can have"
                  />
                  ×
                </span>
              )}
            </label>
          )}
          <label className="variety">
            <span>Closer</span>
            <input type="range" min={0} max={9} value={props.variety} onChange={(e) => props.onVariety(Number(e.target.value))} aria-label="Mix variety" />
            <span>Wider</span>
          </label>
          <button className="text-btn" onClick={props.onReroll} disabled={draft.loading}>
            <Icon name="reroll" size={18} /> New mix <kbd>R</kbd>
          </button>
        </div>
      </header>
      {draft.error ? (
        <p className="draft-error">MusicIP didn't answer: {draft.error}. Check that MusicIP is running and that LMS can reach it (see the MusicIP plugin settings).</p>
      ) : draft.empty ? (
        <p className="draft-error">
          MusicIP has no mix for {draft.seed.label}. Usually that means it hasn't analysed these tracks yet; recently added
          music needs a MusicIP rescan first. Try mixing from something older.
        </p>
      ) : (
        <ol className={'rows' + (draft.loading ? ' is-loading' : '')}>
          {tracks.map((t, i) => (
            <TrackRow
              key={t.id}
              track={t}
              selected={props.selected === i}
              current={i === 0 && draft.seed.kind === 'track'}
              onSelect={() => props.onSelect(i)}
              actions={[{ icon: 'cut', label: 'Cut', key: 'X', run: () => props.onCut(i), danger: true }]}
            />
          ))}
        </ol>
      )}
      <footer className="draft-foot">
        <button className="primary-btn" onClick={() => props.onCommit('load')} disabled={!tracks.length}>
          <Icon name="play" size={18} /> Play this mix <kbd>⌘↵</kbd>
        </button>
        <button className="text-btn" onClick={() => props.onCommit('insert')} disabled={!tracks.length}>
          After this track
        </button>
        <button className="text-btn" onClick={() => props.onCommit('add')} disabled={!tracks.length}>
          Add to end
        </button>
        <button className="text-btn draft-discard" onClick={props.onDiscard}>
          Discard <kbd>Esc</kbd>
        </button>
      </footer>
    </section>
  )
}
