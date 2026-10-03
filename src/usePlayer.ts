import { useCallback, useEffect, useRef, useState } from 'react'
import { getQueue, getStatus, type Status, type Track } from './lms'

const POLL_MS = 1000

/**
 * Polls the light-weight status once a second and refetches the full queue
 * only when LMS bumps playlist_timestamp. `clock` records when the last
 * position arrived so the progress bar can interpolate between polls.
 */
export function usePlayer(player: string | null) {
  const [status, setStatus] = useState<Status | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [error, setError] = useState<string | null>(null)
  const stamp = useRef(0)
  const polledAt = useRef({ at: 0, time: 0 })

  const refresh = useCallback(async () => {
    if (!player) return
    try {
      const q = await getQueue(player)
      stamp.current = q.status.playlistTimestamp
      polledAt.current = { at: performance.now(), time: q.status.time }
      setStatus(q.status)
      setTracks(q.tracks)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [player])

  useEffect(() => {
    if (!player) return
    let cancelled = false
    refresh()
    const id = setInterval(async () => {
      try {
        const s = await getStatus(player)
        if (cancelled) return
        if (s.playlistTimestamp !== stamp.current) return refresh()
        polledAt.current = { at: performance.now(), time: s.time }
        setStatus(s)
        setError(null)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [player, refresh])

  return { status, tracks, error, refresh, clock: polledAt }
}
