import { useEffect, useState } from 'react'
import { fetchMyParent } from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import type { Parent } from '../lib/types'

interface UseMyParentResult {
  parent: Parent | null
  loading: boolean
  error: string | null
}

export function useMyParent(): UseMyParentResult {
  const [parent, setParent] = useState<Parent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchMyParent()
      .then((result) => {
        if (!active) return
        setParent(result)
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(getErrorMessage(err))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { parent, loading, error }
}
