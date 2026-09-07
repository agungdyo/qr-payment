import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Loader2,
  MapPin,
  Monitor,
  QrCode,
  Settings2,
  Users,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { PhoneShell } from '@/components/PhoneShell'
import { api, authLogin, authMe } from '@/lib/api/client'
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

  const tierSummary = (workspace: Workspace) =>
    workspace.tiers
      .slice()
      .sort((a, b) => a.durationHours - b.durationHours)
      .map((t) => `${t.durationHours === 24 ? '24j' : `${t.durationHours}j`}: ${formatIDR(t.price)}`)
      .join(' · ')

  const handleOpenAdmin = async () => {
    // Check if already authenticated
    const auth = await authMe()
    if (auth.authenticated) {
      navigate('/admin')
    } else {
      // Redirect to Keycloak login
      authLogin()
    }
  }

  return (
    <PhoneShell>
      {/* Hero */}
      <header className="bg-zinc-900 px-5 pb-6 pt-8 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <QrCode className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Booking App            
            </p>
            <h1 className="text-lg font-semibold">UIPay x UIWorks Coworking Space </h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          Pilih workspace untuk mensimulasikan hasil pindai QR di meja / ruangan.
          Harga mengikuti paket durasi (1 jam, 3 jam, dst.) yang diatur dari dashboard
          admin.
        </p>
        <button
          type="button"
          onClick={handleOpenAdmin}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 active:bg-white/10"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          Buka dashboard admin 
        </button>
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
            <p className="text-sm text-zinc-500">
              Belum ada workspace. Buka dashboard admin untuk menambah meja / ruangan.
            </p>
            <button
              type="button"
              onClick={handleOpenAdmin}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white"
            >
              Buka dashboard admin <ArrowRight className="h-3 w-3" aria-hidden />
            </button>
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
