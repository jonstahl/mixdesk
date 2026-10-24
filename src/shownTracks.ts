import type { DraftState, Fresh } from './Draft'
import type { Track } from './lms'

/** The seed track stays whatever its play count: it's what the mix is built from. */
export function shownTracks(draft: DraftState, fresh: Fresh): Track[] {
  const { plays } = draft
  if (!fresh.on || !plays) return draft.tracks
  const seed = draft.seed.kind === 'track' ? String(draft.seed.id) : null
  return draft.tracks.filter((t) => String(t.id) === seed || (plays[String(t.id)] ?? 0) <= fresh.max)
}
