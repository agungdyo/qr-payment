import { useEffect, useState, useCallback } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authMe } from '@/lib/api/client'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const location = useLocation()

  const checkAuth = useCallback(async () => {
    try {
      const result = await authMe()
      console.log('🔍 authMe result:', result)  // DEBUG
      setIsAuthenticated(result.authenticated)
    } catch (err) {
      console.log('🔍 authMe error:', err)  // DEBUG
      setIsAuthenticated(false)
    }
  }, [])


  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Authenticated - render children
  return <>{children}</>
}
