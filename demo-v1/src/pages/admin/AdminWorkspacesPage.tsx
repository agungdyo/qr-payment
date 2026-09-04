import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Link2, Loader2, Monitor, Pencil, Plus, Users } from 'lucide-react'

import { Button, Card, Switch } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { Workspace, WorkspaceInput } from '@/lib/api/types'
import { cn } from '@/lib/cn'
import { formatIDR } from '@/lib/format'
import { hoursLabel } from '@/lib/pricing'

function toInput(workspace: Workspace): WorkspaceInput {
  return {
    name: workspace.name,
    type: workspace.type,
    location: workspace.location,
    capacity: workspace.capacity,
    description: workspace.description,
    isActive: workspace.isActive,
    hourlyRate: workspace.hourlyRate,
    tiers: workspace.tiers,
  }
}

export function AdminWorkspacesPage() {
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)

  const reload = useCallback(() => {
    adminApi
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Gagal memuat meja')
        setWorkspaces([])
      })
  }, [])

  useEffect(reload, [reload])

  async function toggleActive(workspace: Workspace) {
    try {
      await adminApi.updateWorkspace(workspace.code, {
        ...toInput(workspace),
        isActive: !workspace.isActive,
      })
      toast.success(
        !workspace.isActive
          ? `${workspace.name} diaktifkan`
          : `${workspace.name} dinonaktifkan dari halaman customer`,
      )
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengubah status')
    }
  }

  async function copyQrLink(workspace: Workspace) {
    const url = `${window.location.origin}/w/${workspace.code}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Tautan QR disalin', { description: url })
    } catch {
      toast.error('Tidak dapat menyalin otomatis')
    }
  }

  if (!workspaces) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
        <p className="text-sm text-zinc-500">Memuat daftar meja…</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Meja &amp; Ruangan</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Setting custom per workspace: nama, kapasitas, status aktif, dan tarif
            sewa per durasi.
          </p>
        </div>
        <Button onClick={() => navigate('/admin/workspaces/new')}>
          <Plus className="h-4 w-4" aria-hidden />
          Tambah
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-zinc-400">
          Belum ada workspace. Klik “Tambah”.
        </Card>
      ) : (
        <div className="space-y-3">
          {workspaces.map((workspace) => {
            const active = workspace.isActive
            const typeLabel = workspace.type === 'room' ? 'Ruang' : 'Meja'
            return (
              <Card
                key={workspace.code}
                className={cn('p-4 transition', !active && 'opacity-60')}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                    {workspace.type === 'room' ? (
                      <Users className="h-5 w-5" aria-hidden />
                    ) : (
                      <Monitor className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-zinc-900">
                        {workspace.name}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500',
                        )}
                      >
                        {active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-zinc-400">
                      {workspace.code} · {typeLabel} · {workspace.location}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                      <span className="font-semibold tabular">
                        {formatIDR(workspace.hourlyRate)}/jam
                      </span>
                      <span className="text-zinc-400">
                        Paket:{' '}
                        {workspace.tiers
                          .slice()
                          .sort((a, b) => a.durationHours - b.durationHours)
                          .map((t) => `${hoursLabel(t.durationHours)} ${formatIDR(t.price)}`)
                          .join(' · ') || '—'}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="ghost" onClick={() => void copyQrLink(workspace)}>
                      <Link2 className="h-4 w-4" aria-hidden />
                      <span className="hidden sm:inline">Salin QR</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate(`/admin/workspaces/${workspace.code}`)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      Edit
                    </Button>
                    <Switch
                      checked={active}
                      onChange={() => void toggleActive(workspace)}
                      label={`Aktifkan ${workspace.name}`}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
