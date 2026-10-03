import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueue, getStatus, type Status, type Track } from './lms'

const POLL_MS = 1000
// LMS is single-threaded and stalls for seconds while it resizes artwork, so
// one slow or failed poll isn't an outage. Only say so after several in a row.
const POLL_TIMEOUT_MS = 6000
const FAILURES_BEFORE_ERROR = 3

/**
 * Polls the light-weight status once a second and refetches the full queue
 * only when LMS bumps playlist_timestamp. `clock` records when the last
 * position arrived so the progress bar can interpolate between polls.
 *
 * Polls never overlap: the next one is scheduled when the last one settles,
 * so a stalled server can't pile up requests (and starve the browser's few
 * connections to it, which is what made commands lag).
 */
export function usePlayer(player: string | null) {
  const [status, setStatus] = useState<Status | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [error, setError] = useState<string | null>(null)
  const stamp = useRef(0)
  const polledAt = useRef({ at: 0, time: 0 })
  const failures = useRef(0)
  // Bumped by every local change; a poll that started before it is stale and
  // would undo an optimistic update, so its answer is dropped.
  const generation = useRef(0)

  const ok = () => {
    failures.current = 0
    setError(null)
  }
  const failed = (e: unknown) => {
    if (++failures.current >= FAILURES_BEFORE_ERROR) setError(e instanceof Error ? e.message : String(e))
  }

  const refresh = useCallback(async () => {
    if (!player) return
    const gen = ++generation.current
    try {
      const q = await getQueue(player)
      if (gen !== generation.current) return
      stamp.current = q.status.playlistTimestamp
      polledAt.current = { at: performance.now(), time: q.status.time }
      setStatus(q.status)
      setTracks(q.tracks)
      ok()
    } catch (e) {
      failed(e)
    }
  }, [player])

  /** Show a change straight away, before LMS confirms it. */
  const patch = useCallback(
    (change: Partial<Status>) => {
      generation.current++
      // Pausing freezes the clock where it got to; resuming restarts it from there.
      if (change.mode && change.mode !== status?.mode) {
        const now = performance.now()
        const c = polledAt.current
        polledAt.current = { at: now, time: status?.mode === 'play' ? c.time + (now - c.at) / 1000 : c.time }
      }
      setStatus((s) => (s ? { ...s, ...change } : s))
    },
    [status?.mode],
  )

  useEffect(() => {
    if (!player) return
    let cancelled = false
    let polling = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      clearTimeout(timer)
      if (polling) return
      polling = true
      const gen = generation.current
      try {
        const s = await getStatus(player, POLL_TIMEOUT_MS)
        if (cancelled) return
        if (s.playlistTimestamp !== stamp.current) await refresh()
        else if (gen === generation.current) {
          polledAt.current = { at: performance.now(), time: s.time }
          setStatus(s)
          ok()
        }
      } catch (e) {
        if (!cancelled) failed(e)
      } finally {
        polling = false
        if (!cancelled) timer = setTimeout(poll, POLL_MS)
      }
    }

    // Background tabs throttle timers; catch up as soon as the tab is back.
    const onVisible = () => document.visibilityState === 'visible' && poll()

    refresh().then(() => !cancelled && (timer = setTimeout(poll, POLL_MS)))
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [player, refresh])

  return { status, tracks, error, refresh, patch, clock: polledAt }
}
