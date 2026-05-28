import { useEffect, useState } from 'react'

// Tracks connectivity via the browser's online/offline events. Note these
// report the OS network state, not whether Supabase is reachable, so award
// failures still fall back to the queue defensively.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
