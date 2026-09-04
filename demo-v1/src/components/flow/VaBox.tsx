import { CircleAlert, Clock, Copy } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatCountdown, groupDigits, remainingSeconds } from '@/lib/format'

interface VaBoxProps {
  va: string
  inactiveDate: string
  nowMs: number
  onCopy: () => void
}

export function VaBox({ va, inactiveDate, nowMs, onCopy }: VaBoxProps) {
  const remaining = remainingSeconds(inactiveDate, nowMs)
  const urgent = remaining < 5 * 60

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200">
      {/* Countdown header */}
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
          Selesaikan pembayaran sebelum
        </span>
        <span className="tabular font-semibold">{formatCountdown(remaining)}</span>
      </div>

      {/* VA number */}
      <div className="px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Nomor Virtual Account
        </p>
        <p
          aria-label={`Nomor virtual account: ${groupDigits(va)}`}
          className="mt-1 font-mono text-2xl font-semibold tracking-wide text-zinc-900"
        >
          {groupDigits(va)}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 active:bg-zinc-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Salin nomor VA
        </button>
      </div>
    </div>
  )
}
