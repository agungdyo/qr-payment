import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Loader2, Plus, Trash2 } from 'lucide-react'

import { Button, Card, Field, NumberInput, Select, Switch, TextInput, Textarea } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { RateTier, Workspace, WorkspaceInput, WorkspaceType } from '@/lib/api/types'
import { formatIDR } from '@/lib/format'
import { hoursLabel } from '@/lib/pricing'

interface FormState {
  code: string
  name: string
  type: WorkspaceType
  location: string
  capacity: number
  description: string
  isActive: boolean
  hourlyRate: number
  tiers: RateTier[]
}

const emptyForm: FormState = {
  code: '',
  name: '',
  type: 'desk',
  location: '',
  capacity: 1,
  description: '',
  isActive: true,
  hourlyRate: 20000,
  tiers: [],
}

function fromWorkspace(workspace: Workspace): FormState {
  return {
    code: workspace.code,
    name: workspace.name,
    type: workspace.type,
    location: workspace.location ?? '',
    capacity: workspace.capacity,
    description: workspace.description ?? '',
    isActive: workspace.isActive,
    hourlyRate: workspace.hourlyRate,
    tiers: workspace.tiers.map((t) => ({ ...t })),
  }
}

export function WorkspaceFormPage() {
  const { workspaceCode } = useParams()
  // `/admin/workspaces/new` matches the static route (no `:workspaceCode`
  // param), so a missing param means the "Tambah" (create) form as well.
  const isNew = !workspaceCode || workspaceCode === 'new'
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!workspaceCode) return
    let alive = true
    adminApi
      .listWorkspaces()
      .then((list) => {
        const found = list.find((w) => w.code === workspaceCode)
        if (!alive) return
        if (found) {
          setForm(fromWorkspace(found))
          setLoaded(true)
        } else {
          toast.error('Workspace tidak ditemukan')
          navigate('/admin/workspaces')
        }
      })
      .catch(() => {
        if (alive) toast.error('Gagal memuat workspace')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [workspaceCode, navigate])

  const patch = (partial: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...partial }))

  function updateTier(index: number, partial: Partial<RateTier>) {
    setForm((prev) => ({
      ...prev,
      tiers: prev.tiers.map((tier, i) => (i === index ? { ...tier, ...partial } : tier)),
    }))
  }

  function removeTier(index: number) {
    setForm((prev) => ({ ...prev, tiers: prev.tiers.filter((_, i) => i !== index) }))
  }

  function addTier() {
    setForm((prev) => {
      const used = new Set(prev.tiers.map((t) => t.durationHours))
      let hours = 1
      while (used.has(hours) && hours < 24) hours += 1
      if (used.has(hours)) hours = 24
      return {
        ...prev,
        tiers: [
          ...prev.tiers,
          { durationHours: hours, price: Math.round(prev.hourlyRate * Math.min(hours, 8)) },
        ],
      }
    })
  }

  function validate(): string | null {
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(form.code.trim())) {
      return 'Kode tidak valid — huruf kecil, angka, dan tanda "-" saja.'
    }
    if (!form.name.trim()) return 'Nama workspace wajib diisi.'
    if (form.capacity < 1) return 'Kapasitas minimal 1.'
    if (form.hourlyRate <= 0) return 'Tarif per jam harus lebih dari 0.'
    const durations = form.tiers.map((t) => t.durationHours)
    if (new Set(durations).size !== durations.length) {
      return 'Durasi paket tidak boleh duplikat.'
    }
    if (form.tiers.some((t) => t.durationHours < 1 || t.price <= 0)) {
      return 'Setiap paket butuh durasi ≥ 1 jam dan harga > 0.'
    }
    return null
  }

  async function handleSave() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }
    setSaving(true)
    const input: WorkspaceInput = {
      name: form.name.trim(),
      type: form.type,
      location: form.location.trim() || undefined,
      capacity: form.capacity,
      description: form.description.trim() || undefined,
      isActive: form.isActive,
      hourlyRate: form.hourlyRate,
      tiers: form.tiers
        .map((t) => ({ ...t, label: t.label }))
        .sort((a, b) => a.durationHours - b.durationHours),
    }
    try {
      if (isNew) {
        await adminApi.createWorkspace({ ...input, code: form.code.trim().toLowerCase() })
        toast.success('Workspace ditambahkan')
      } else if (workspaceCode) {
        await adminApi.updateWorkspace(workspaceCode, input)
        toast.success('Perubahan disimpan')
      }
      navigate('/admin/workspaces')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function copyCustomerUrl() {
    const url = `${window.location.origin}/w/${form.code.trim()}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Tautan customer disalin', { description: url })
    } catch {
      toast.error('Tidak dapat menyalin otomatis')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
        <p className="text-sm text-zinc-500">Memuat workspace…</p>
      </div>
    )
  }

  const tiersTotal = formatIDR(
    form.tiers.reduce((sum, t) => sum + t.price, 0) + form.hourlyRate,
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={() => navigate('/admin/workspaces')}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Kembali
        </Button>
        <h1 className="text-xl font-bold text-zinc-900">
          {isNew ? 'Tambah Meja / Ruangan' : `Edit — ${form.code}`}
        </h1>
      </div>

      {/* Info dasar */}
      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Info dasar
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Kode (isi QR)"
            hint={isNew ? 'Huruf kecil & "-", mis. meja-13' : 'Tidak bisa diubah'}
          >
            <TextInput
              value={form.code}
              disabled={!isNew}
              placeholder="meja-13"
              onChange={(e) => patch({ code: e.target.value })}
            />
          </Field>
          <Field label="Nama tampilan">
            <TextInput
              value={form.name}
              placeholder="Meja 13 — Hot Desk"
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="Tipe">
            <Select
              value={form.type}
              onChange={(e) => patch({ type: e.target.value as WorkspaceType })}
            >
              <option value="desk">Meja (desk)</option>
              <option value="room">Ruangan (room)</option>
            </Select>
          </Field>
          <Field label="Lokasi">
            <TextInput
              value={form.location}
              placeholder="Lantai 2 · dekat jendela"
              onChange={(e) => patch({ location: e.target.value })}
            />
          </Field>
          <Field label="Kapasitas (orang)">
            <NumberInput
              value={form.capacity}
              min={1}
              onChange={(e) => patch({ capacity: Number(e.target.value) || 1 })}
            />
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2">
            <Textarea
              value={form.description}
              placeholder="Catatan untuk customer…"
              onChange={(e) => patch({ description: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Tampil di halaman customer</p>
            <p className="text-xs text-zinc-500">
              Nonaktif = tidak muncul & kode QR menolak pembayaran.
            </p>
          </div>
          <Switch
            checked={form.isActive}
            onChange={(value) => patch({ isActive: value })}
            label="Workspace aktif"
          />
        </div>
      </Card>

      {/* Tarif sewa */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Tarif sewa
          </h2>
          <Button variant="outline" onClick={addTier}>
            <Plus className="h-4 w-4" aria-hidden />
            Tambah paket durasi
          </Button>
        </div>
        <Field
          label="Tarif per jam (fallback)"
          hint="Dipakai saat durasi tidak masuk paket (paket durasi lebih utama)."
        >
          <NumberInput
            value={form.hourlyRate}
            min={1}
            step={1000}
            onChange={(e) => patch({ hourlyRate: Number(e.target.value) || 0 })}
          />
        </Field>

        {form.tiers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-400">
            Belum ada paket durasi. Tambahkan mis. 1 jam, 3 jam, 8 jam, dan Harian (24 jam).
          </p>
        ) : (
          <div className="space-y-2">
            {form.tiers.map((tier, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 p-2.5"
              >
                <div className="flex min-w-28 flex-1 items-center gap-2">
                  <NumberInput
                    aria-label="Durasi paket (jam)"
                    className="w-20"
                    value={tier.durationHours}
                    min={1}
                    max={24}
                    onChange={(e) =>
                      updateTier(index, { durationHours: Number(e.target.value) || 0 })
                    }
                  />
                  <span className="text-xs text-zinc-500">jam</span>
                </div>
                <div className="flex flex-1 items-center gap-2">
                  <NumberInput
                    aria-label="Harga paket"
                    value={tier.price}
                    min={1}
                    step={1000}
                    onChange={(e) => updateTier(index, { price: Number(e.target.value) || 0 })}
                  />
                  <span className="shrink-0 text-xs font-semibold tabular text-zinc-600">
                    {hoursLabel(tier.durationHours)}
                  </span>
                  <button
                    type="button"
                    aria-label="Hapus paket"
                    onClick={() => removeTier(index)}
                    className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-zinc-400">
          PPN 11% + biaya admin VA Rp3.500 ditambahkan otomatis di sisi backend. Estimasi
          nilai tarif aktif saat ini: {tiersTotal} (belum termasuk pajak/admin).
        </p>
      </Card>

      {/* Akses customer */}
      {!isNew && loaded && form.code && (
        <Card className="flex items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Tautan untuk stiker QR
            </p>
            <p className="mt-1 truncate font-mono text-sm text-zinc-700">
              {window.location.origin}/w/{form.code}
            </p>
          </div>
          <Button variant="outline" onClick={() => void copyCustomerUrl()}>
            <Copy className="h-4 w-4" aria-hidden />
            Salin
          </Button>
        </Card>
      )}

      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" onClick={() => navigate('/admin/workspaces')}>
          Batal
        </Button>
        <Button disabled={saving} onClick={() => void handleSave()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>
    </div>
  )
}
