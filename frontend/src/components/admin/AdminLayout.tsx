import { Box, LayoutDashboard, LogOut, Monitor, QrCode, Wifi } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/cn'
import { authLogout, authMe, type AuthMeResponse } from '@/lib/api/client'

const NAV_ITEMS = [
  { to: '/admin', label: 'Ringkasan', icon: LayoutDashboard, end: true },
  { to: '/admin/workspaces', label: 'Meja & Ruangan', icon: Monitor, end: false },
  { to: '/admin/lockers', label: 'Loker', icon: Box, end: false },
  { to: '/admin/settings', label: 'Wi-Fi & Venue', icon: Wifi, end: false },
]

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200',
  )
}

export function AdminLayout() {
  const navigate = useNavigate()
  const [auth, setAuth] = useState<AuthMeResponse | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    authMe().then(setAuth)
  }, [])

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await authLogout()
    } finally {
      // Navigate to home page regardless of logout result
      navigate('/')
      setLoggingOut(false)
    }
  }

  const userEmail = auth?.user?.email || auth?.user?.username || 'Admin'

  return (
    <div className="min-h-dvh bg-zinc-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-zinc-900 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
            <QrCode className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Admin Console</p>
            <p className="text-[11px] text-zinc-500">QR Payment · Coworking</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/"
          className="border-t border-white/10 px-5 py-4 text-xs font-medium text-zinc-400 hover:text-zinc-200"
        >
          ← Lihat halaman customer
        </Link>
      </aside>

      {/* Main column */}
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
                <QrCode className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold">Admin</p>
            </div>
            <p className="hidden text-sm font-semibold lg:block">Dashboard Admin</p>
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="hidden rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 sm:block"
              >
                Halaman customer ↗
              </Link>
              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-zinc-500 sm:block">{userEmail}</span>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            </div>
          </div>
          {/* Mobile nav */}
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:hidden">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold',
                    isActive ? 'bg-zinc-900 text-white' : 'text-zinc-500',
                  )
                }
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
