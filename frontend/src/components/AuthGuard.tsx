import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authCheck, type User } from '@/lib/api/client'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const location = useLocation()

  useEffect(() => {
    let alive = true
    authCheck().then((result) => {
      if (!alive) return
      setUser(result.authenticated ? result.user : null)
    })
    return () => {
      alive = false
    }
  }, [])

  if (user === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const isAdmin = user.isAdmin || user.roles.includes('admin')
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
