const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function formatIDR(value: number): string {
  return idrFormatter.format(value)
}

/** Group a plain digit string in blocks of `size` (default 4) — used for VA numbers. */
export function groupDigits(value: string, size = 4): string {
  const digits = value.replace(/\s+/g, '')
  return digits.replace(new RegExp(`\\B(?=(\\d{${size}})+(?!\\d))`, 'g'), ' ')
}

/** Whole seconds left until `inactiveDate`, never negative. */
export function remainingSeconds(inactiveDate: string, nowMs = Date.now()): number {
  return Math.max(0, Math.floor((Date.parse(inactiveDate) - nowMs) / 1000))
}

/** Format a seconds countdown as mm:ss (or h:mm:ss when >= 1 hour). */
export function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
