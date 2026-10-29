import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Data-fetching hook with loading/error state and a manual refetch.
 * `deps` follows useEffect semantics; `fetcher` is re-read on each run.
 */
export function useAsync(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(immediate)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcherRef.current()
      if (mounted.current) setData(result)
      return result
    } catch (cause) {
      if (mounted.current) setError(cause)
      return null
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, refetch: run, setData }
}

/** Polls a fetcher on an interval until `shouldStop` returns true. */
export function usePolling(fetcher, { intervalMs = 1500, enabled = true, shouldStop } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const stopRef = useRef(shouldStop)
  stopRef.current = shouldStop

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    let timer = null

    const tick = async () => {
      try {
        const result = await fetcherRef.current()
        if (cancelled) return
        setData(result)
        setError(null)
        if (stopRef.current && stopRef.current(result)) return
      } catch (cause) {
        if (cancelled) return
        setError(cause)
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs])

  return { data, error }
}
