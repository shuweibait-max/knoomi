import { useState, useEffect } from 'react'
import api from '../utils/api'

// Generic fetch hook
export function useFetch(url, deps = []) {
  const [data, setData]       = useState(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!url) return
    setLoading(true)
    api.get(url)
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, deps)

  return { data, loading, error, setData }
}

// Mood history hook
export function useMoodHistory() {
  return useFetch('/mood/', [])
}

// Latest mood hook
export function useLatestMood() {
  return useFetch('/mood/latest', [])
}

// My groups hook
export function useMyGroups() {
  return useFetch('/groups/mine', [])
}
