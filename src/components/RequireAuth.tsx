import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { FullScreenSpinner } from './FullScreenSpinner'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return <FullScreenSpinner />
  }
  if (!session) {
    return <Navigate to="/signin" replace />
  }
  return <>{children}</>
}
