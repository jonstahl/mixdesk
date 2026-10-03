import { useCallback, useEffect, useRef, useState } from 'react'
import * as lms from './lms'
import type { Seed, Track } from './lms'
import { usePlayer } from './usePlayer'
import { NowPlaying } from './NowPlaying'
import { RunningOrder } from './RunningOrder'
import { Draft, type DraftState } from './Draft'
import { Search } from './Search'
import { Library } from './Library'
import { go, href, useRoute } from './router'
import { accentFromCover } from './palette'
import { Icon } from './ui'

const PLAYER_KEY = 'mixdesk.player'
const LEAVE_MS = 160
const CURSOR_IDLE_MS = 4000

type Toast = { text: string; undo?: () => void }

function readSaved(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export default function App() {
  const route = useRoute()
  const onQueue = route.page === 'queue'
  const [players, setPlayers] = useState<lms.Player[]>([])
  const [player, setPlayer] = useState<string | null>(null)
  const { status, tracks, error, refresh, clock } = usePlayer(player)
  const [selected, setSelected] = useState<number | null>(null)
  const [leaving, setLeaving] = useState<Set<number>>(new Set())
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [draftSel, setDraftSel] = useState(0)
  const [cursorOn, setCursorOn] = useState(false)
  const [variety, setVarietyState] = useState(6)
  const [searching, setSearching] = useState(false)
  const [initialTerm, setInitialTerm] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [volume, setVolumeState] = useState<number | null>(null)

  // Queue edits run one at a time so indices stay valid between them.
  const chain = useRef<Promise<unknown>>(Promise.resolve())
  const enqueue = useCallback(
    (op: () => Promise<unknown>) => {
      chain.current = chain.current
        .then(op)
        .catch((e) => setToast({ text: `LMS refused that change: ${e instanceof Error ? e.message : e}` }))
        .then(refresh)
      return chain.current
    },
    [refresh],
  )

  useEffect(() => {
    lms.getPlayers().then((ps) => {
      setPlayers(ps)
      const saved = readSaved(PLAYER_KEY)
      const pick = ps.find((p) => p.playerid === saved) ?? ps.find((p) => p.connected) ?? ps[0]
      if (pick) setPlayer(pick.playerid)
    })
    lms.getVariety().then(setVarietyState)
  }, [])

  useEffect(() => {
    if (!player) return
    try {
      localStorage.setItem(PLAYER_KEY, player)
    } catch {
      /* private window: fine to forget */
    }
  }, [player])

  useEffect(() => {
    if (status && volume === null) setVolumeState(status.volume)
  }, [status, volume])

  const cur = status?.currentIndex ?? 0
  const current = tracks[cur]
  const sel = selected ?? Math.min(cur + 1, tracks.length - 1)

  // The keyboard cursor stays hidden until it's used, then fades out and
  // falls back to the next track. Hidden or not, x/n/m act on `sel`.
  const cursorTimer = useRef(0)
  const showCursor = () => {
    setCursorOn(true)
    clearTimeout(cursorTimer.current)
    cursorTimer.current = window.setTimeout(() => {
      setCursorOn(false)
      setSelected(null)
      setDraftSel(0)
    }, CURSOR_IDLE_MS)
  }

  // The current cover sets the accent for the whole desk.
  const coverKey = current ? lms.coverUrl(current.coverid, 600) : ''
  useEffect(() => {
    accentFromCover(coverKey).then((c) => {
      document.documentElement.style.setProperty('--accent', c ?? 'var(--amber)')
    })
  }, [coverKey])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(id)
  }, [toast])

  // --- queue actions -----------------------------------------------------

  const cut = (i: number) => {
    const tr = tracks[i]
    if (!tr || !player || leaving.has(i)) return
    setLeaving((s) => new Set(s).add(i))
    setTimeout(() => {
      enqueue(() => lms.removeAt(player, i)).then(() =>
        setLeaving((s) => {
          const n = new Set(s)
          n.delete(i)
          return n
        }),
      )
      setToast({ text: `Cut “${tr.title}”`, undo: () => enqueue(() => lms.restoreAt(player, tr.id, i)) })
    }, LEAVE_MS)
  }

  const playNext = (i: number) => {
    if (!player || i === cur || i === cur + 1) return
    const to = i < cur ? cur : cur + 1
    enqueue(() => lms.move(player, i, to))
    setSelected(to)
  }

  // Bulk changes keep a copy of the queue, position and elapsed time so Undo can put it all back.
  const snapshot = () => {
    if (!player) return undefined
    const ids = tracks.map((t) => t.id)
    const index = cur
    const time = status?.time ?? 0
    const p = player
    return () => enqueue(() => lms.restoreQueue(p, ids, index, time))
  }

  const clearPlayed = () => {
    if (!player || cur === 0) return
    const n = cur
    const restore = snapshot()
    enqueue(() => lms.clearPlayed(player, n))
    setSelected(null)
    setToast({ text: `Cleared ${n} played tracks`, undo: restore })
  }

  // --- drafts ------------------------------------------------------------

  const startDraft = useCallback(
    async (seed: Seed) => {
      if (!player) return
      setSearching(false)
      setDraftSel(0)
      setDraft((d) => ({ seed, tracks: d && d.seed === seed ? d.tracks : [], loading: true }))
      try {
        const mix = await lms.previewMix(player, seed)
        setDraft({ seed, tracks: mix, loading: false, empty: !mix.length })
      } catch (e) {
        setDraft({ seed, tracks: [], loading: false, error: e instanceof Error ? e.message : String(e) })
      }
    },
    [player],
  )

  const mixFrom = (t: Track) => startDraft({ kind: 'track', id: t.id, label: t.title })

  const varietyTimer = useRef(0)
  const changeVariety = (v: number) => {
    setVarietyState(v)
    clearTimeout(varietyTimer.current)
    varietyTimer.current = window.setTimeout(async () => {
      await lms.setVariety(v)
      if (draft) startDraft(draft.seed)
    }, 350)
  }

  const commitDraft = (mode: lms.AddMode) => {
    if (!player || !draft) return
    const ids = draft.tracks.map((t) => t.id)
    const restore = mode === 'load' ? snapshot() : undefined
    enqueue(() => lms.addTracks(player, ids, mode))
    setDraft(null)
    setSelected(null)
    go({ page: 'queue' })
    const verb = mode === 'load' ? 'Playing' : mode === 'insert' ? 'Queued after this track:' : 'Added to the end:'
    setToast({ text: `${verb} mix from ${draft.seed.label}`, undo: restore })
  }

  const cutDraft = (i: number) =>
    setDraft((d) => {
      if (!d) return d
      const next = d.tracks.filter((_, k) => k !== i)
      setDraftSel((s) => Math.max(0, Math.min(s, next.length - 1)))
      return { ...d, tracks: next }
    })

  const addTrack = (t: Track, mode: 'insert' | 'add') => {
    if (!player) return
    setSearching(false)
    enqueue(() => lms.addTracks(player, [t.id], mode))
    setToast({ text: mode === 'insert' ? `“${t.title}” plays next` : `Added “${t.title}” to the end` })
  }

  const addAlbum = (a: lms.Album, mode: lms.AddMode) => {
    if (!player) return
    setSearching(false)
    const restore = mode === 'load' ? snapshot() : undefined
    enqueue(() => lms.addAlbum(player, a.id, mode))
    const text = mode === 'load' ? `Playing ${a.album}` : mode === 'insert' ? `${a.album} plays next` : `Added ${a.album} to the end`
    setToast({ text, undo: restore })
  }

  const undo = () => {
    toast?.undo?.()
    setToast(null)
  }

  // --- keyboard ----------------------------------------------------------

  const keys = useRef<(e: KeyboardEvent) => void>(() => {})
  keys.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement
    if (searching || el.closest('input, select, textarea')) return
    const meta = e.metaKey || e.ctrlKey
    if (draft && meta && e.key === 'Enter') {
      e.preventDefault()
      commitDraft('load')
      return
    }
    if ((meta && e.key === 'k') || e.key === '/') {
      e.preventDefault()
      setInitialTerm('')
      setSearching(true)
      return
    }
    if (meta && e.key === 'z') {
      e.preventDefault()
      undo()
      return
    }
    if (meta || e.altKey) return
    if (e.key === ' ' && player) {
      e.preventDefault()
      ;(status?.mode === 'play' ? lms.pause(player) : lms.play(player)).then(refresh)
      return
    }
    const down = e.key === 'ArrowDown' || e.key === 'j'
    const up = e.key === 'ArrowUp' || e.key === 'k'
    const cutKey = e.key === 'x' || e.key === 'Backspace' || e.key === 'Delete'
    // The first move only reveals the cursor, so you see where it is before it goes anywhere.
    const reveal = (down || up) && !cursorOn
    if (draft) {
      const n = draft.tracks.length
      // In a draft a hidden cursor sits on the seed, so cutting needs it visible first.
      if (down || up || cutKey) {
        if (!reveal && cursorOn) {
          if (down) setDraftSel((s) => Math.min(s + 1, n - 1))
          else if (up) setDraftSel((s) => Math.max(s - 1, 0))
          else cutDraft(draftSel)
        }
        showCursor()
      } else if (e.key === 'r') startDraft(draft.seed)
      else if (e.key === 'Escape') setDraft(null)
      else return typeToSearch(e)
      e.preventDefault()
      return
    }
    // Queue shortcuts only apply while the queue is on screen.
    if (!onQueue || !tracks.length) return typeToSearch(e)
    if (down || up) {
      if (!reveal) setSelected(down ? Math.min(sel + 1, tracks.length - 1) : Math.max(sel - 1, 0))
      showCursor()
    } else if (cutKey) cut(sel)
    else if (e.key === 'n') playNext(sel)
    else if (e.key === 'm' && tracks[sel]) mixFrom(tracks[sel])
    else if (e.key === 'Enter' && player) enqueue(() => lms.jumpTo(player, sel))
    else if (e.key === 'u') undo()
    else return typeToSearch(e)
    e.preventDefault()
  }

  // Any other letter starts a search, so typing with search closed can't fire queue shortcuts mid-word.
  const typeToSearch = (e: KeyboardEvent) => {
    if (e.key.length !== 1 || !/\S/.test(e.key)) return
    e.preventDefault()
    setInitialTerm(e.key)
    setSearching(true)
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // --- render ------------------------------------------------------------

  const volTimer = useRef(0)
  const remainingNow = Math.max(0, (status?.duration ?? current?.duration ?? 0) - (status?.time ?? 0))

  return (
    <div className="desk">
      <header className="topbar">
        <nav className="views" aria-label="View">
          <a href={href({ page: 'queue' })} aria-current={onQueue ? 'page' : undefined}>
            Queue
            {tracks.length > cur + 1 && <span className="views-count">{tracks.length - cur - 1}</span>}
          </a>
          <a href={href({ page: 'library' })} aria-current={!onQueue ? 'page' : undefined}>
            Library
          </a>
        </nav>
        <button
          className="search-trigger"
          onClick={() => {
            setInitialTerm('')
            setSearching(true)
          }}
        >
          <Icon name="search" size={18} />
          <span>Find a track to mix from</span>
          <kbd>/</kbd>
        </button>
        <div className="topbar-player">
          {players.length > 1 ? (
            <select value={player ?? ''} onChange={(e) => setPlayer(e.target.value)} aria-label="Player">
              {players.map((p) => (
                <option key={p.playerid} value={p.playerid}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="player-name">{players[0]?.name}</span>
          )}
          <label className="volume">
            <Icon name="volume" size={18} />
            <input
              type="range"
              min={0}
              max={100}
              value={volume ?? 0}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolumeState(v)
                clearTimeout(volTimer.current)
                volTimer.current = window.setTimeout(() => player && lms.setVolume(player, v), 120)
              }}
            />
          </label>
        </div>
      </header>

      {error && <p className="banner">Can't reach Lyrion: {error}. Check that the server is running and that LMS_HOST in .env.local is right.</p>}

      <main className="stage">
        <NowPlaying
          track={current}
          status={status}
          clock={clock}
          onToggle={() => player && (status?.mode === 'play' ? lms.pause(player) : lms.play(player)).then(refresh)}
          onPrev={() => player && enqueue(() => lms.prev(player))}
          onNext={() => player && enqueue(() => lms.next(player))}
          onSeek={(s) => player && lms.seek(player, s).then(refresh)}
          onMix={mixFrom}
        />
        {draft ? (
          <Draft
            draft={draft}
            variety={variety}
            selected={cursorOn ? draftSel : -1}
            onSelect={(i) => {
              setDraftSel(i)
              showCursor()
            }}
            onCut={cutDraft}
            onReroll={() => startDraft(draft.seed)}
            onVariety={changeVariety}
            onCommit={commitDraft}
            onDiscard={() => setDraft(null)}
          />
        ) : !onQueue ? (
          <Library route={route} onMix={startDraft} onAlbum={addAlbum} onTrack={addTrack} />
        ) : (
          <RunningOrder
            tracks={tracks}
            currentIndex={cur}
            remainingNow={remainingNow}
            selected={cursorOn ? sel : -1}
            leaving={leaving}
            onSelect={(i) => {
              setSelected(i)
              showCursor()
            }}
            onJump={(i) => player && enqueue(() => lms.jumpTo(player, i))}
            onCut={cut}
            onPlayNext={playNext}
            onMix={mixFrom}
            onClearPlayed={clearPlayed}
          />
        )}
      </main>

      {searching && (
        <Search
          initialTerm={initialTerm}
          onClose={() => setSearching(false)}
          onMix={startDraft}
          onTrack={addTrack}
          onAlbum={addAlbum}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="text-btn" onClick={undo}>
              Undo <kbd>U</kbd>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
