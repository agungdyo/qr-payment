import { useEffect, useState, type ReactNode } from 'react'
import { Box, CircleCheckBig, Clock3, Loader2, Monitor } from 'lucide-react'

import { Card } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { AdminStats, Payment } from '@/lib/api/types'
import { formatDateTime, formatIDR } from '@/lib/format'

const STATUS_LABEL: Record<Payment['status'], { label: string; cls: string }> = {
  issued: { label: 'Menunggu', cls: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Lunas', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Dibatalkan', cls: 'bg-zinc-100 text-zinc-500' },
  failed: { label: 'Gagal', cls: 'bg-red-50 text-red-600' },
}

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: number
  sub: string
  icon: ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
        <span className="text-zinc-300">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular text-zinc-900">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>
    </Card>
  )
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [payments, setPayments] = useState<Payment[] | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([adminApi.getStats(), adminApi.listPayments(8)])
      .then(([s, p]) => {
        if (!alive) return
        setStats(s)
        setPayments(p)
      })
      .catch(() => {
        if (alive) {
          setStats(null)
          setPayments([])
        }
      })
    return () => {
      alive = false
    }
  }, [])

  if (!stats || !payments) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
        <p className="text-sm text-zinc-500">Memuat ringkasan…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Ringkasan</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Status venue & transaksi (shared demo store — perubahan admin langsung
          terlihat di halaman customer).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Meja / Ruangan"
          value={stats.workspaceTotal}
          sub={`${stats.workspaceActive} aktif`}
          icon={<Monitor className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Loker"
          value={stats.lockerTotal}
          sub={`${stats.lockerAvailable} tersedia`}
          icon={<Box className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Transaksi lunas"
          value={stats.paymentPaidTotal}
          sub="total (demo)"
          icon={<CircleCheckBig className="h-4 w-4" aria-hidden />}
        />
        <StatCard
          label="Menunggu bayar"
          value={stats.paymentPendingTotal}
          sub="VA belum dibayar"
          icon={<Clock3 className="h-4 w-4" aria-hidden />}
        />
      </div>

      <Card>
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-900">Transaksi terakhir</h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">
            Belum ada transaksi. Coba alur pembayaran dari halaman customer dulu.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {payments.map((payment) => {
              const status = STATUS_LABEL[payment.status]
              return (
                <li
                  key={payment.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-zinc-900">
                      {payment.workspaceName}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {payment.bookingCode} · VA {payment.bankName} ·{' '}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`hidden rounded-full px-2 py-0.5 text-xs font-semibold sm:inline ${status.cls}`}
                  >
                    {status.label}
                  </span>
                  <p className="tabular font-semibold text-zinc-900">
                    {formatIDR(payment.total)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
