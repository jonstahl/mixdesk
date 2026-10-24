import { useEffect, useState } from 'react'

export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  useEffect(() => {
    let stale = false
    setState((s) => ({ data: s.data, loading: true }))
    load().then(
      (data) => !stale && setState({ data, loading: false }),
      (e) => !stale && setState({ error: e instanceof Error ? e.message : String(e), loading: false }),
    )
    return () => {
      stale = true
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}
