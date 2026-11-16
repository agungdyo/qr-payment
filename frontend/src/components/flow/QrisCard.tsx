import { CircleAlert, Clock } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import { cn } from '@/lib/cn'
import { formatCountdown, formatIDR, remainingSeconds } from '@/lib/format'

interface QrisCardProps {
  qrContent: string
  merchantName: string
  total: number
  inactiveDate: string
  nowMs: number
}

export function QrisCard({
  qrContent,
  merchantName,
  total,
  inactiveDate,
  nowMs,
}: QrisCardProps) {
  const remaining = remainingSeconds(inactiveDate, nowMs)
  const urgent = remaining < 5 * 60

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200">
      <div
        className={cn(
          'flex items-center justify-between px-4 py-2.5 text-xs font-medium',
          urgent ? 'bg-red-50 text-red-700' : 'bg-zinc-50 text-zinc-600',
        )}
      >
        <span className="flex items-center gap-1.5">
          {urgent ? (
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Clock className="h-3.5 w-3.5" aria-hidden />
          )}
          Scan sebelum
        </span>
        <span className="tabular font-semibold">{formatCountdown(remaining)}</span>
      </div>

      <div className="px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight text-zinc-900">QRIS</span>
          <span className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
            GPN
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{merchantName}</p>

        <div className="mt-3 flex justify-center rounded-xl border border-zinc-200 bg-white p-3">
          <QRCodeSVG
            value={qrContent}
            size={220}
            level="M"
            marginSize={0}
            title={`Kode QRIS ${merchantName}`}
          />
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-zinc-100 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Nominal
          </span>
          <span className="tabular text-lg font-semibold text-zinc-900">
            {formatIDR(total)}
          </span>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Scan dengan aplikasi pembayaran apa saja: mobile banking, GoPay, OVO, DANA,
          dan e-wallet lain.
        </p>
      </div>
    </div>
  )
}
