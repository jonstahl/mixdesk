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
  tracknum?: string
  disc?: string
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

// Tag letters: a artist, c coverid, d duration, e album_id, l album, y year (t tracknum, i disc for album pages).
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

// Year seeds aren't offered: MusicIP returns nothing for them on this server.
export type Seed = { kind: 'track' | 'album' | 'artist' | 'genre'; id: string | number; label: string }

const SEED_PARAM: Record<Seed['kind'], string> = { track: 'song_id', album: 'album_id', artist: 'artist_id', genre: 'genre_id' }
const seedParam = (s: Seed) => `${SEED_PARAM[s.kind]}:${s.id}`

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

export type Album = {
  id: number
  album: string
  artist?: string
  artist_id?: number
  artwork_track_id?: string
  year?: number
  textkey?: string
}
export type Artist = { id: number; artist: string; textkey?: string }
export type Genre = { id: number; genre: string; textkey?: string }

export async function search(term: string) {
  const [t, al, ar] = await Promise.all([
    rpc<{ titles_loop?: Track[] }>('', ['titles', 0, 30, `search:${term}`, TRACK_TAGS]),
    rpc<{ albums_loop?: Album[] }>('', ['albums', 0, 12, `search:${term}`, 'tags:alyj']),
    rpc<{ artists_loop?: Artist[] }>('', ['artists', 0, 8, `search:${term}`]),
  ])
  return { tracks: t.titles_loop ?? [], albums: al.albums_loop ?? [], artists: ar.artists_loop ?? [] }
}

// --- library -------------------------------------------------------------------

// Library data barely changes during a session, so list fetches are memoised.
// Random albums opt out so "Shuffle" gets a fresh set.
const memo = new Map<string, Promise<unknown>>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) memo.set(key, load().catch((e) => (memo.delete(key), Promise.reject(e))))
  return memo.get(key) as Promise<T>
}

const ALBUM_TAGS = 'tags:alyjSs'
const ALL = 10000

// LMS 9.1 answers sort:yearartist with an error, so year order is yearalbum.
export type AlbumSort = 'artflow' | 'album' | 'yearalbum' | 'new' | 'random'

export function getAlbums(filters: string[] = [], sort: AlbumSort = 'artflow', count = ALL): Promise<Album[]> {
  const cmd = ['albums', 0, count, `sort:${sort}`, ALBUM_TAGS, ...filters]
  const load = () => rpc<{ albums_loop?: Album[] }>('', cmd).then((r) => r.albums_loop ?? [])
  return sort === 'random' ? load() : cached(cmd.join(' '), load)
}

export function getAlbum(id: string | number): Promise<Album | undefined> {
  return getAlbums([`album_id:${id}`], 'album', 1).then((a) => a[0])
}

export function getAlbumTracks(id: string | number): Promise<Track[]> {
  return cached(`tracks ${id}`, () =>
    rpc<{ titles_loop?: Track[] }>('', ['titles', 0, 500, `album_id:${id}`, 'sort:tracknum', TRACK_TAGS + 'ti']).then(
      (r) => r.titles_loop ?? [],
    ),
  )
}

export function getAlbumArtists(): Promise<Artist[]> {
  return cached('album artists', () =>
    rpc<{ artists_loop?: Artist[] }>('', ['artists', 0, ALL, 'role_id:ALBUMARTIST', 'tags:s']).then((r) => r.artists_loop ?? []),
  )
}

export function getGenres(): Promise<Genre[]> {
  return cached('genres', () =>
    rpc<{ genres_loop?: Genre[] }>('', ['genres', 0, ALL, 'tags:s']).then((r) => r.genres_loop ?? []),
  )
}

export function getYears(): Promise<number[]> {
  return cached('years', () =>
    rpc<{ years_loop?: { year: number }[] }>('', ['years', 0, ALL]).then((r) =>
      (r.years_loop ?? []).map((y) => Number(y.year)).filter((y) => y > 0),
    ),
  )
}

export type LibraryTotals = { albums: number; artists: number; songs: number }

export function getTotals(): Promise<LibraryTotals> {
  return cached('totals', () =>
    rpc<Record<string, number>>('', ['serverstatus', 0, 0]).then((r) => ({
      albums: Number(r['info total albums'] ?? 0),
      artists: Number(r['info total artists'] ?? 0),
      songs: Number(r['info total songs'] ?? 0),
    })),
  )
}
