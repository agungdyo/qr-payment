import { useEffect, useState } from 'react'
import {
  ArrowRight,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Menu,
  Monitor,
  QrCode,
  Users,
  X,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { PhoneShell } from '@/components/PhoneShell'
import { api, authLogin, authLogout, authMe, isDemoMode, type User } from '@/lib/api/client'
import type { Workspace } from '@/lib/api/types'
import { formatIDR } from '@/lib/format'

function TypeIcon({ workspace }: { workspace: Workspace }) {
  return workspace.type === 'room' ? (
    <Users className="h-5 w-5" aria-hidden />
  ) : (
    <Monitor className="h-5 w-5" aria-hidden />
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const loginFailed = searchParams.get('error') === 'login_failed'
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .listWorkspaces()
      .then((list) => {
        if (alive) setWorkspaces(list)
      })
      .catch(() => {
        if (alive) setWorkspaces([])
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    authMe().then((current) => {
      if (alive) setUser(current)
    })
    return () => {
      alive = false
    }
  }, [])

  const tierSummary = (workspace: Workspace) =>
    workspace.tiers
      .slice()
      .sort((a, b) => a.durationHours - b.durationHours)
      .map((t) => `${t.durationHours === 24 ? '24j' : `${t.durationHours}j`}: ${formatIDR(t.price)}`)
      .join(' · ')

  const displayName = user?.name?.trim() || user?.username || ''
  const isAdmin = Boolean(
    user?.isAdmin ||
      user?.roles?.some((role) => {
        const value = role.toLowerCase()
        return value === 'admin' || value === 'administrator'
      }),
  )

  const handleLogin = () => {
    setMenuOpen(false)
    if (isDemoMode) {
      navigate('/admin')
    } else {
      authLogin('/')
    }
  }

  const handleLogout = () => {
    setMenuOpen(false)
    if (isDemoMode) {
      setUser(null)
      navigate('/')
    } else {
      authLogout()
    }
  }

  return (
    <PhoneShell>
      {/* Hero */}
      <header className="bg-zinc-900 px-5 pb-6 pt-8 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <QrCode className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Booking App
            </p>
            <h1 className="text-lg font-semibold">UIWorks Coworking Space </h1>
          </div>

          {/* Burger menu */}
          <div className="relative ml-auto">
            <button
              type="button"
              aria-label="Menu akun"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-zinc-200 active:bg-white/10"
            >
              {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Tutup menu"
                  onClick={() => setMenuOpen(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-zinc-700 bg-zinc-800 p-1.5 shadow-xl">
                  {user ? (
                    <>
                      <div className="px-3 py-2">
                        <p className="truncate text-sm font-semibold text-white">{displayName}</p>
                        {user.email && (
                          <p className="truncate text-xs text-zinc-400">{user.email}</p>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false)
                            navigate('/admin')
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 active:bg-white/10"
                        >
                          <LayoutDashboard className="h-4 w-4" aria-hidden />
                          Dashboard admin
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 active:bg-white/10"
                      >
                        <LogOut className="h-4 w-4" aria-hidden />
                        Keluar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleLogin}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 active:bg-white/10"
                    >
                      <LogIn className="h-4 w-4" aria-hidden />
                      Masuk
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          Pilih workspace untuk mensimulasikan hasil pindai QR di meja / ruangan.
          Harga mengikuti mode tarif (paket durasi, bulanan, atau tahunan) yang diatur
          dari dashboard admin.
        </p>
      </header>

      {loginFailed && (
        <div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium leading-relaxed text-amber-800">
          Login tidak selesai — sesi Keycloak mungkin masih aktif atau alur login
          dibatalkan. Silakan coba lagi.
        </div>
      )}

      {/* Workspace list */}
      <section className="flex-1 px-5 py-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Pilih Meja / Ruangan
        </h2>
        {workspaces === null ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-300" aria-hidden />
            <p className="text-sm text-zinc-400">Memuat daftar workspace…</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <MapPin className="h-8 w-8 text-zinc-300" aria-hidden />
            <p className="text-sm text-zinc-500">Belum ada workspace.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {workspaces.map((ws) => (
              <li key={ws.code}>
                <Link
                  to={`/w/${ws.code}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm active:scale-"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                    <TypeIcon workspace={ws} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900">{ws.name}</p>
                    <p className="truncate text-xs text-zinc-400">{tierSummary(ws)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PhoneShell>
  )
}
