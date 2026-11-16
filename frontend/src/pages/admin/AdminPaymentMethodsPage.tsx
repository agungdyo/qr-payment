import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Card, Switch } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { PaymentMethodItem } from '@/lib/api/types'
import { cn } from '@/lib/cn'

const GROUPS = [
  {
    key: 'va' as const,
    label: 'Virtual Account',
    hint: 'Nomor VA per bank, dibayar lewat mobile banking, ATM, atau internet banking.',
  },
  {
    key: 'qris' as const,
    label: 'QRIS',
    hint: 'Satu kode QR yang bisa discan dari aplikasi pembayaran apa saja.',
  },
]

export function AdminPaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethodItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [savingCode, setSavingCode] = useState<string | null>(null)

  const reload = useCallback(() => {
    setFailed(false)
    adminApi
      .listPaymentMethods()
      .then(setMethods)
      .catch(() => {
        setMethods([])
        setFailed(true)
        toast.error('Gagal memuat metode pembayaran')
      })
  }, [])

  useEffect(reload, [reload])

  async function toggle(method: PaymentMethodItem, isActive: boolean) {
    if (savingCode) return
    setSavingCode(method.code)
    try {
      const updated = await adminApi.togglePaymentMethod(method.code, isActive)
      setMethods(
        (prev) =>
          prev?.map((m) => (m.code === updated.code ? updated : m)) ?? prev,
      )
      toast.success(
        `${updated.name} ${updated.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Gagal mengubah status',
      )
    } finally {
      setSavingCode(null)
    }
  }

  const activeCount = methods?.filter((m) => m.isActive).length ?? 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Metode Pembayaran</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          {methods
            ? `${activeCount} dari ${methods.length} metode aktif di halaman pembayaran customer.`
            : 'Memuat…'}
        </p>
      </div>

      {failed ? (
        <Card className="flex flex-col items-start gap-2 px-4 py-6">
          <p className="text-sm text-red-600">Gagal memuat metode pembayaran.</p>
          <button
            type="button"
            onClick={() => reload()}
            className="text-sm font-semibold text-zinc-900 underline underline-offset-2"
          >
            Coba lagi
          </button>
        </Card>
      ) : !methods ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
          <p className="text-sm text-zinc-500">Memuat metode pembayaran…</p>
        </div>
      ) : methods.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-zinc-400">
          Belum ada metode pembayaran terdaftar.
        </Card>
      ) : (
        GROUPS.map((group) => {
          const rows = methods.filter((m) => m.category === group.key)
          if (rows.length === 0) return null
          return (
            <section key={group.key}>
              <h2 className="text-sm font-semibold text-zinc-900">{group.label}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{group.hint}</p>
              <Card className="mt-2 divide-y divide-zinc-100">
                {rows.map((method) => (
                  <div key={method.code} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-900">
                        {method.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-zinc-500">
                        {method.code}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        method.isActive ? 'text-emerald-600' : 'text-zinc-400',
                      )}
                    >
                      {method.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                    {savingCode === method.code ? (
                      <Loader2
                        className="mx-3 h-5 w-5 animate-spin text-zinc-400"
                        aria-hidden
                      />
                    ) : (
                      <Switch
                        checked={method.isActive}
                        onChange={(value) => void toggle(method, value)}
                        label={`Aktifkan ${method.name}`}
                      />
                    )}
                  </div>
                ))}
              </Card>
            </section>
          )
        })
      )}

      <p className="text-xs leading-relaxed text-zinc-500">
        Metode nonaktif disembunyikan dari halaman pembayaran customer. Transaksi
        baru yang memakai metode nonaktif ditolak backend.
      </p>
    </div>
  )
}
