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
import { Link, useNavigate } from 'react-router-dom'

import { PhoneShell } from '@/components/PhoneShell'
import { api } from '@/lib/api/client'
import type { Workspace } from '@/lib/api/types'
import { formatIDR } from '@/lib/format'

function TypeIcon({ workspace }: { workspace: Workspace }) {
  return workspace.type === 'room' ? (
    <Users className="h-5 w-5" aria-hidden />
  ) : (
    <Monitor className="h-5 w-5" aria-hidden />
  )
}

export function DemoHomePage() {
  const navigate = useNavigate()
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
              Prototype
            </p>
            <h1 className="text-lg font-semibold">QR Payment Meja &amp; Ruangan</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">
          Pilih workspace untuk mensimulasikan hasil pindai QR di meja / ruangan.
          Harga mengikuti paket durasi (1 jam, 3 jam, dst.) yang diatur dari dashboard
          admin.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-200 active:bg-white/10"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          Buka dashboard admin (demo)
        </button>
      </header>

      {/* Active QR targets */}
      <main className="flex-1 px-4 py-5">
        {workspaces === null ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
            <p className="text-sm text-zinc-500">Memuat daftar meja…</p>
          </div>
        ) : workspaces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Belum ada meja aktif. Tambahkan dari dashboard admin.
          </div>
        ) : (
          <div className="space-y-2.5">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Workspace aktif ({workspaces.length})
            </p>
            {workspaces.map((workspace) => (
              <Link
                key={workspace.code}
                to={`/w/${workspace.code}`}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3.5 transition active:bg-zinc-50"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                  <TypeIcon workspace={workspace} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {workspace.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    {workspace.venueName} · {workspace.location}
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-zinc-400">
                    {tierSummary(workspace)}
                  </p>
                </div>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {formatIDR(workspace.hourlyRate)}/jam
                  </span>
                  <span className="flex items-center gap-0.5 text-xs font-medium text-zinc-400">
                    Buka <ArrowRight className="h-3 w-3" aria-hidden />
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-xs leading-relaxed text-zinc-500">
          <strong className="text-zinc-700">Di produksi:</strong> stiker QR di tiap
          meja/ruangan berisi URL <span className="font-mono">/w/&#123;kode&#125;</span>.
          Panel <strong>Demo</strong> di layar Virtual Account mensimulasikan webhook
          pembayaran MAJA. Perubahan dari dashboard admin (harga, status aktif,
          Wi-Fi) langsung terlihat di halaman ini.
        </div>
      </main>
    </PhoneShell>
  )
}
