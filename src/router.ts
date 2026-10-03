import { useEffect, useState } from 'react'

// Hash routes keep the browser's back button working without a server.
export type Route =
  | { page: 'queue' }
  | { page: 'library' }
  | { page: 'artists' }
  | { page: 'artist'; id: string; name: string }
  | { page: 'albums' }
  | { page: 'album'; id: string }
  | { page: 'genres' }
  | { page: 'genre'; id: string; name: string }
  | { page: 'years' }
  | { page: 'year'; year: string }
  | { page: 'new' }
  | { page: 'settings'; section: 'server' | 'player' }

export function parse(hash: string): Route {
  const [page, a, b] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  switch (page) {
    case 'library':
    case 'artists':
    case 'albums':
    case 'genres':
    case 'years':
    case 'new':
      return { page }
    case 'artist':
      return { page, id: a, name: b ?? '' }
    case 'genre':
      return { page, id: a, name: b ?? '' }
    case 'album':
      return { page, id: a }
    case 'year':
      return { page, year: a }
    case 'settings':
      return { page, section: a === 'player' ? 'player' : 'server' }
    default:
      return { page: 'queue' }
  }
}

export function href(r: Route): string {
  const e = encodeURIComponent
  switch (r.page) {
    case 'artist':
    case 'genre':
      return `#/${r.page}/${e(r.id)}/${e(r.name)}`
    case 'album':
      return `#/album/${e(r.id)}`
    case 'year':
      return `#/year/${e(r.year)}`
    case 'settings':
      return `#/settings/${r.section}`
    case 'queue':
      return '#/'
    default:
      return `#/${r.page}`
  }
}

export const go = (r: Route) => {
  location.hash = href(r)
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash))
  useEffect(() => {
    const on = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}
