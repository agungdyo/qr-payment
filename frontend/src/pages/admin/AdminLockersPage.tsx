import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Box, Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'

import { Button, Card, Field, Select, Switch, TextInput } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { Locker, LockerStatus } from '@/lib/api/types'
import { cn } from '@/lib/cn'

const STATUS_META: Record<LockerStatus, { label: string; cls: string }> = {
  available: { label: 'Tersedia', cls: 'bg-emerald-50 text-emerald-700' },
  occupied: { label: 'Terpakai', cls: 'bg-amber-50 text-amber-700' },
}

function isStatus(value: string): value is LockerStatus {
  return value === 'available' || value === 'occupied'
}

export function AdminLockersPage() {
  const [lockers, setLockers] = useState<Locker[] | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState<{
    code: string
    location: string
    status: LockerStatus
    note: string
  }>({
    code: '',
    location: '',
    status: 'available',
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<{ id: string; code: string; location: string; note: string } | null>(null)

  const reload = useCallback(() => {
    adminApi
      .listLockers()
      .then(setLockers)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Gagal memuat loker')
        setLockers([])
      })
  }, [])

  useEffect(reload, [reload])

  async function createLocker() {
    if (!addForm.code.trim()) {
      toast.error('Kode loker wajib diisi')
      return
    }
    setSaving(true)
    try {
      await adminApi.createLocker({
        code: addForm.code.trim().toUpperCase(),
        location: addForm.location.trim() || undefined,
        status: addForm.status,
        note: addForm.note.trim() || undefined,
      })
      toast.success('Loker ditambahkan')
      setShowAdd(false)
      setAddForm({ code: '', location: '', status: 'available', note: '' })
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menambah loker')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(locker: Locker, status: LockerStatus) {
    try {
      await adminApi.updateLocker(locker.id, {
        code: locker.code,
        location: locker.location,
        note: locker.note,
        status,
      })
      toast.success(
        status === 'available' ? `${locker.code} ditandai tersedia` : `${locker.code} ditandai terpakai`,
      )
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengubah status')
    }
  }

  async function deleteLocker(locker: Locker) {
    try {
      await adminApi.deleteLocker(locker.id)
      toast.success(`${locker.code} dihapus`)
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus loker')
    }
  }

  async function saveEdit() {
    if (!editing) return
    try {
      await adminApi.updateLocker(editing.id, {
        code: editing.code.trim().toUpperCase(),
        location: editing.location.trim() || undefined,
        note: editing.note.trim() || undefined,
        status: lockers?.find((l) => l.id === editing.id)?.status ?? 'available',
      })
      toast.success('Detail loker disimpan')
      setEditing(null)
      reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan')
    }
  }

  const available = lockers?.filter((l) => l.status === 'available').length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Loker Penyimpanan</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {lockers ? (
              <>
                {lockers.length} loker · {available} tersedia ·{' '}
                {lockers.length - available} terpakai
              </>
            ) : (
              'Memuat…'
            )}
          </p>
        </div>
        <Button onClick={() => setShowAdd((value) => !value)}>
          {showAdd ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {showAdd ? 'Tutup' : 'Tambah loker'}
        </Button>
      </div>

      {showAdd && (
        <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Kode">
            <TextInput
              value={addForm.code}
              placeholder="LK-07"
              onChange={(e) => setAddForm({ ...addForm, code: e.target.value })}
            />
          </Field>
          <Field label="Lokasi">
            <TextInput
              value={addForm.location}
              placeholder="Lantai 2 · dekat lift"
              onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <Select
              value={addForm.status}
              onChange={(e) => setAddForm({ ...addForm, status: isStatus(e.target.value) ? e.target.value : 'available' })}
            >
              <option value="available">Tersedia</option>
              <option value="occupied">Terpakai</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button className="w-full" disabled={saving} onClick={() => void createLocker()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Simpan
            </Button>
          </div>
        </Card>
      )}

      {!lockers ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
          <p className="text-sm text-zinc-500">Memuat loker…</p>
        </div>
      ) : lockers.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-zinc-400">
          Belum ada loker. Klik “Tambah loker”.
        </Card>
      ) : (
        <div className="space-y-3">
          {lockers.map((locker) => {
            const meta = STATUS_META[locker.status]
            const isEditing = editing?.id === locker.id
            return (
              <Card key={locker.id} className="p-4">
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Kode">
                      <TextInput
                        value={editing.code}
                        onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                      />
                    </Field>
                    <Field label="Lokasi">
                      <TextInput
                        value={editing.location}
                        onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                      />
                    </Field>
                    <Field label="Catatan">
                      <TextInput
                        value={editing.note}
                        onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                      />
                    </Field>
                    <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                      <Button onClick={() => void saveEdit()}>
                        <Check className="h-4 w-4" aria-hidden />
                        Simpan
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>
                        Batal
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                      <Box className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm font-semibold text-zinc-900">
                          {locker.code}
                        </p>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.cls)}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {locker.location || 'Lokasi belum diisi'}
                        {locker.note ? ` · ${locker.note}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        onClick={() => void changeStatus(locker, locker.status === 'available' ? 'occupied' : 'available')}
                      >
                        Tandai {locker.status === 'available' ? 'terpakai' : 'tersedia'}
                      </Button>
                      <Button variant="ghost" onClick={() => setEditing({ id: locker.id, code: locker.code, location: locker.location ?? '', note: locker.note ?? '' })}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button variant="ghost" onClick={() => void deleteLocker(locker)}>
                        <Trash2 className="h-4 w-4 text-red-500" aria-hidden />
                      </Button>
                    </div>
                    <Switch
                      checked={locker.status === 'available'}
                      onChange={(value) => void changeStatus(locker, value ? 'available' : 'occupied')}
                      label={`Set ${locker.code}`}
                    />
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
