// Thin client for LMS's JSON-RPC endpoint. Every call is
// ["slim.request", [playerId, [command...]]]; queries return a `result` object.

export type Track = {
  id: number
  title: string
  artist?: string
  album?: string
  album_id?: string
  coverid?: string
  duration?: number
  year?: string
  'playlist index'?: number
}

export type Status = {
  mode: 'play' | 'pause' | 'stop'
  time: number
  duration?: number
  volume: number
  power: number
  currentIndex: number
  trackCount: number
  playlistTimestamp: number
  repeat: number
}

export type Player = { playerid: string; name: string; connected: number; isplaying: number }

// Tag letters: a artist, c coverid, d duration, e album_id, l album, y year.
// Album title is silently dropped without `l`.
export const TRACK_TAGS = 'tags:acdely'

let rpcId = 0

export async function rpc<T = Record<string, unknown>>(player: string, cmd: (string | number)[]): Promise<T> {
  const res = await fetch('/jsonrpc.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ++rpcId, method: 'slim.request', params: [player, cmd] }),
  })
  if (!res.ok) throw new Error(`LMS returned ${res.status}`)
  const body = await res.json()
  return (body.result ?? {}) as T
}

/** Empty when LMS has no artwork for the track (no coverid), so callers can draw their own. */
export function coverUrl(coverid: string | undefined, size = 600) {
  return coverid ? `/music/${coverid}/cover_${size}x${size}_o` : ''
}

export async function getPlayers(): Promise<Player[]> {
  const r = await rpc<{ players_loop?: Player[] }>('', ['players', 0, 50])
  return r.players_loop ?? []
}

type RawStatus = Record<string, unknown> & { playlist_loop?: Track[] }

function toStatus(r: RawStatus): Status {
  return {
    mode: (r.mode as Status['mode']) ?? 'stop',
    time: Number(r.time ?? 0),
    duration: r.duration != null ? Number(r.duration) : undefined,
    volume: Number(r['mixer volume'] ?? 0),
    power: Number(r.power ?? 0),
    currentIndex: Number(r.playlist_cur_index ?? 0),
    trackCount: Number(r.playlist_tracks ?? 0),
    playlistTimestamp: Number(r.playlist_timestamp ?? 0),
    repeat: Number(r['playlist repeat'] ?? 0),
  }
}

export async function getStatus(player: string): Promise<Status> {
  return toStatus(await rpc<RawStatus>(player, ['status', '-', 1, 'tags:']))
}

export async function getQueue(player: string, max = 1000): Promise<{ status: Status; tracks: Track[] }> {
  const r = await rpc<RawStatus>(player, ['status', 0, max, TRACK_TAGS])
  return { status: toStatus(r), tracks: r.playlist_loop ?? [] }
}

// --- transport -------------------------------------------------------------

export const play = (p: string) => rpc(p, ['play'])
export const pause = (p: string) => rpc(p, ['pause'])
export const next = (p: string) => rpc(p, ['playlist', 'index', '+1'])
export const prev = (p: string) => rpc(p, ['playlist', 'index', '-1'])
export const jumpTo = (p: string, i: number) => rpc(p, ['playlist', 'index', i])
export const seek = (p: string, secs: number) => rpc(p, ['time', secs])
export const setVolume = (p: string, v: number) => rpc(p, ['mixer', 'volume', Math.round(v)])

// --- queue editing ---------------------------------------------------------

export const removeAt = (p: string, i: number) => rpc(p, ['playlist', 'delete', i])
export const move = (p: string, from: number, to: number) => rpc(p, ['playlist', 'move', from, to])

/** Put a track back at an exact position (used for undoing a cut). */
export async function restoreAt(p: string, trackId: number, index: number) {
  await rpc(p, ['playlistcontrol', 'cmd:add', `track_id:${trackId}`])
  const { trackCount } = await getStatus(p)
  if (trackCount - 1 !== index) await move(p, trackCount - 1, index)
}

export type AddMode = 'load' | 'insert' | 'add'

/** load replaces the whole queue; insert goes after the current track; add appends. */
export const addTracks = (p: string, ids: number[], mode: AddMode) =>
  rpc(p, ['playlistcontrol', `cmd:${mode}`, `track_id:${ids.join(',')}`])

export const addAlbum = (p: string, albumId: string | number, mode: AddMode) =>
  rpc(p, ['playlistcontrol', `cmd:${mode}`, `album_id:${albumId}`])

/** Put back a queue saved before a bulk change: same tracks, same track playing, same position. */
export async function restoreQueue(p: string, ids: number[], index: number, time: number) {
  await addTracks(p, ids, 'load')
  if (index > 0) await jumpTo(p, index)
  if (time > 1) await seek(p, time)
}

export async function clearPlayed(p: string, currentIndex: number) {
  for (let i = currentIndex - 1; i >= 0; i--) await removeAt(p, i)
}

// --- MusicIP -----------------------------------------------------------------

export type Seed =
  | { kind: 'track'; id: number; label: string }
  | { kind: 'album'; id: string | number; label: string }
  | { kind: 'artist'; id: string | number; label: string }

const seedParam = (s: Seed) =>
  s.kind === 'track' ? `song_id:${s.id}` : s.kind === 'album' ? `album_id:${s.id}` : `artist_id:${s.id}`

/** Ask MusicIP for a mix without touching the queue. */
export async function previewMix(p: string, seed: Seed): Promise<Track[]> {
  const r = await rpc<{ titles_loop?: Track[] }>(p, ['musicip', 'mix', seedParam(seed), TRACK_TAGS])
  return r.titles_loop ?? []
}

export async function getVariety(): Promise<number> {
  const r = await rpc<{ _p2?: string }>('', ['pref', 'plugin.musicip:mix_variety', '?'])
  return Number(r._p2 ?? 0)
}

export const setVariety = (v: number) => rpc('', ['pref', 'plugin.musicip:mix_variety', v])

// --- search ------------------------------------------------------------------

export type Album = { id: number; album: string; artist?: string; artwork_track_id?: string; year?: number }
export type Artist = { id: number; artist: string }

export async function search(term: string) {
  const [t, al, ar] = await Promise.all([
    rpc<{ titles_loop?: Track[] }>('', ['titles', 0, 30, `search:${term}`, TRACK_TAGS]),
    rpc<{ albums_loop?: Album[] }>('', ['albums', 0, 12, `search:${term}`, 'tags:alyj']),
    rpc<{ artists_loop?: Artist[] }>('', ['artists', 0, 8, `search:${term}`]),
  ])
  return { tracks: t.titles_loop ?? [], albums: al.albums_loop ?? [], artists: ar.artists_loop ?? [] }
}
