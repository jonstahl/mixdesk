import type { Seed, Track } from './lms'
import { TrackRow } from './RunningOrder'
import { fmtDuration, Icon } from './ui'

export type DraftState = { seed: Seed; tracks: Track[]; loading: boolean; error?: string; empty?: boolean }

export function Draft(props: {
  draft: DraftState
  variety: number
  selected: number
  onSelect: (i: number) => void
  onCut: (i: number) => void
  onReroll: () => void
  onVariety: (v: number) => void
  onCommit: (mode: 'load' | 'insert' | 'add') => void
  onDiscard: () => void
}) {
  const { draft } = props
  const total = draft.tracks.reduce((s, t) => s + (t.duration ?? 0), 0)
  return (
    <section className="draft" aria-label="Proposed mix">
      <header className="draft-head">
        <div>
          <h2 className="draft-title">Mix from {draft.seed.label}</h2>
          <p className="draft-meta">
            {draft.loading
              ? 'Asking MusicIP…'
              : draft.tracks.length
                ? `${draft.tracks.length} tracks, ${fmtDuration(total)}. Cut what you don't want, then play it.`
                : 'No mix'}
          </p>
        </div>
        <div className="draft-tune">
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
          {draft.tracks.map((t, i) => (
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
        <button className="primary-btn" onClick={() => props.onCommit('load')} disabled={!draft.tracks.length}>
          <Icon name="play" size={18} /> Play this mix <kbd>⌘↵</kbd>
        </button>
        <button className="text-btn" onClick={() => props.onCommit('insert')} disabled={!draft.tracks.length}>
          After this track
        </button>
        <button className="text-btn" onClick={() => props.onCommit('add')} disabled={!draft.tracks.length}>
          Add to end
        </button>
        <button className="text-btn draft-discard" onClick={props.onDiscard}>
          Discard <kbd>Esc</kbd>
        </button>
      </footer>
    </section>
  )
}
