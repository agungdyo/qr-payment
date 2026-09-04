import { useEffect, useMemo, useReducer, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CircleAlert,
  CircleCheckBig,
  KeyRound,
  Loader2,
  MapPin,
  Monitor,
  QrCode,
  RotateCcw,
  Users,
  Wifi,
} from 'lucide-react'

import { BankGrid } from '@/components/flow/BankGrid'
import { DemoPanel } from '@/components/flow/DemoPanel'
import { Instructions } from '@/components/flow/Instructions'
import { PhoneShell } from '@/components/PhoneShell'
import { VaBox } from '@/components/flow/VaBox'
import { api, demoApi, isDemoMode } from '@/lib/api/client'
import type { PublicSettings, Workspace } from '@/lib/api/types'
import { COW_BANKS } from '@/lib/banks'
import { cn } from '@/lib/cn'
import { formatDateTime, formatIDR, groupDigits, remainingSeconds } from '@/lib/format'
import {
  MAX_HOURS,
  MIN_HOURS,
  hoursLabel,
  quote,
  tierDurations,
} from '@/lib/pricing'
import { initialState, paymentReducer } from '@/lib/paymentMachine'

function errorMessageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Terjadi kesalahan. Silakan coba lagi.'
}

function WorkspaceTypeIcon({ type }: { type: Workspace['type'] }) {
  return type === 'room' ? (
    <Users className="h-4 w-4" aria-hidden />
  ) : (
    <Monitor className="h-4 w-4" aria-hidden />
  )
}

export function PaymentFlowPage() {
  const { workspaceCode = '' } = useParams()
  const navigate = useNavigate()

  const [state, dispatch] = useReducer(paymentReducer, undefined, initialState)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [demoBusy, setDemoBusy] = useState(false)
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null)

  const { phase, workspace, hours, bankCode, payment, errorMessage, cancelledAt } =
    state

  // ----- Boot: resolve workspace, then resume an open (unpaid) VA if any -----
  useEffect(() => {
    let alive = true
    dispatch({ type: 'reset' })
    api
      .getWorkspace(workspaceCode)
      .then(async (ws) => {
        if (!alive) return
        dispatch({ type: 'loaded', workspace: ws })
        const open = await api.findOpenPayment(workspaceCode)
        if (!alive) return
        if (open) dispatch({ type: 'resumed', payment: open })
      })
      .catch(() => {
        if (alive) dispatch({ type: 'loadFailed' })
      })
    return () => {
      alive = false
    }
  }, [workspaceCode])

  // ----- Venue public settings (Wi-Fi shown on the paid e-ticket) -----
  useEffect(() => {
    api
      .getPublicSettings()
      .then(setPublicSettings)
      .catch(() => {
        // settings unavailable — Wi-Fi box simply won't render
      })
  }, [])

  // ----- 1s ticker (countdown + auto-expiry) -----
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  // ----- Auto-expire: past VA deadline while showing the VA screen -----
  useEffect(() => {
    if (phase !== 'va' || !payment) return
    if (remainingSeconds(payment.inactiveDate, nowMs) <= 0) {
      dispatch({ type: 'expired' })
    }
  }, [phase, payment, nowMs])

  // ----- Poll payment status while the VA screen is open -----
  useEffect(() => {
    if (phase !== 'va' || !payment) return
    const paymentId = payment.id
    const timer = window.setInterval(() => {
      api
        .getPayment(paymentId)
        .then((p) => dispatch({ type: 'polled', payment: p }))
        .catch(() => {
          // transient polling failure — next tick retries
        })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [phase, payment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const breakdown = useMemo(
    () => (workspace ? quote(workspace, hours) : null),
    [workspace, hours],
  )

  // ----- Actions -----
  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} disalin`)
    } catch {
      toast.error(`Tidak dapat menyalin ${label.toLowerCase()} otomatis`)
    }
  }

  async function handleRegister() {
    if (!workspace) return
    if (!bankCode) {
      toast.error('Pilih metode pembayaran dulu')
      return
    }
    dispatch({ type: 'registerStart' })
    try {
      const p = await api.initiatePayment({
        workspaceCode: workspace.code,
        hours,
        bankCode,
      })
      dispatch({ type: 'registerSuccess', payment: p })
    } catch (error) {
      dispatch({ type: 'registerError', message: errorMessageOf(error) })
    }
  }

  async function handleNewVa() {
    if (!bankCode) {
      // edge: no channel stored (shouldn't happen) — restart the flow
      dispatch({ type: 'startOver' })
      return
    }
    await handleRegister()
  }

  async function handleCheckPaid() {
    if (!payment || checking) return
    setChecking(true)
    try {
      const p = await api.inquiryPayment(payment.id)
      if (p.status === 'paid') {
        dispatch({ type: 'paid', payment: p })
      } else {
        toast.info('Pembayaran belum kami terima', {
          description:
            'Cek kembali nomor VA dan nominalnya. Transfer bisa butuh 1–2 menit.',
        })
      }
    } catch (error) {
      toast.error(errorMessageOf(error))
    } finally {
      setChecking(false)
    }
  }

  async function handleCancelBooking() {
    if (!payment || cancelling) return
    setCancelling(true)
    try {
      await api.cancelPayment(payment.id)
      dispatch({ type: 'cancelSuccess', at: new Date().toISOString() })
      toast.success('Pemesanan dibatalkan')
    } catch (error) {
      toast.error(errorMessageOf(error))
    } finally {
      setCancelling(false)
    }
  }

  async function handleDemoMarkPaid() {
    if (!payment || demoBusy) return
    setDemoBusy(true)
    try {
      const p = await demoApi.markPaid(payment.id)
      dispatch({ type: 'paid', payment: p })
      toast.success('Demo: notifikasi pembayaran dari MAJA diterima')
    } catch (error) {
      toast.error(errorMessageOf(error))
    } finally {
      setDemoBusy(false)
    }
  }

  // ----- Small UI pieces -----
  const retryButton = (
    <button
      type="button"
      onClick={() => dispatch({ type: 'startOver' })}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white active:bg-zinc-700"
    >
      <RotateCcw className="h-4 w-4" aria-hidden />
      Coba lagi
    </button>
  )

  function renderBody() {
    switch (phase) {
      case 'loading':
        return (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" aria-hidden />
            <p className="text-sm text-zinc-500">Memuat ruangan…</p>
          </div>
        )

      case 'notfound':
        return (
          <div className="flex flex-col items-center gap-3 px-2 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
              <QrCode className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Kode tidak dikenali</h2>
            <p className="text-sm leading-relaxed text-zinc-500">
              QR dengan kode <span className="font-mono">{workspaceCode}</span> tidak
              ditemukan, atau meja/ruangan sedang dinonaktifkan oleh admin.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white active:bg-zinc-700"
            >
              Kembali ke beranda
            </button>
          </div>
        )

      case 'error':
        return (
          <div className="flex flex-col items-center gap-3 px-2 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
              <CircleAlert className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Pembayaran gagal dibuat</h2>
            <p className="text-sm leading-relaxed text-zinc-500">{errorMessage}</p>
            <div className="mt-2 w-full max-w-xs">{retryButton}</div>
          </div>
        )

      case 'registering':
        return (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-900" aria-hidden />
            <p className="text-sm font-medium text-zinc-800">
              Membuat Virtual Account…
            </p>
            <p className="text-xs text-zinc-500">
              Menghubungi bank {bankCode ? COW_BANKS.find((b) => b.code === bankCode)?.name : ''}
            </p>
          </div>
        )

      case 'select': {
        if (!workspace || !breakdown) return null
        const customStep = hours >= 10 ? 2 : 1
        const durations = tierDurations(workspace)
        const isTier = durations.includes(hours)
        const adjust = (delta: number) => {
          dispatch({
            type: 'setHours',
            hours: Math.min(MAX_HOURS, Math.max(MIN_HOURS, hours + delta)),
          })
        }
        return (
          <div className="space-y-5">
            {/* Duration */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-900">Lama sewa</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Harga paket per durasi — durasi lain dihitung dari tarif per jam.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {durations.map((duration) => (
                  <button
                    key={duration}
                    type="button"
                    onClick={() => dispatch({ type: 'setHours', hours: duration })}
                    className={cn(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
                      hours === duration
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50',
                    )}
                  >
                    {hoursLabel(duration)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Durasi lain
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Kurangi durasi"
                    disabled={hours <= MIN_HOURS}
                    onClick={() => adjust(-customStep)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-lg font-semibold text-zinc-700 active:bg-zinc-50 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-14 text-center text-sm font-semibold tabular">
                    {hours} jam
                  </span>
                  <button
                    type="button"
                    aria-label="Tambah durasi"
                    disabled={hours >= MAX_HOURS}
                    onClick={() => adjust(customStep)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-lg font-semibold text-zinc-700 active:bg-zinc-50 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
              {!isTier && (
                <p className="mt-2 text-xs text-amber-600">
                  Tidak ada paket {hoursLabel(hours)} — harga dihitung dari tarif per
                  jam ({formatIDR(workspace.hourlyRate)}/jam).
                </p>
              )}
            </section>

            {/* Price */}
            <section className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Sewa {workspace.name} · {breakdown.label}</span>
                <span className="tabular">{formatIDR(breakdown.subtotal)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-zinc-600">
                <span>PPN 11%</span>
                <span className="tabular">{formatIDR(breakdown.tax)}</span>
              </div>
              <div className="mt-1.5 flex justify-between text-zinc-600">
                <span>Biaya admin VA</span>
                <span className="tabular">{formatIDR(breakdown.adminFee)}</span>
              </div>
              <div className="mt-2.5 flex justify-between border-t border-zinc-200 pt-2.5 text-base font-semibold text-zinc-900">
                <span>Total</span>
                <span className="tabular">{formatIDR(breakdown.total)}</span>
              </div>
            </section>

            {/* Channel */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-900">
                Metode pembayaran
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Transfer bank (Virtual Account) — via mobile banking, ATM, atau
                internet banking
              </p>
              <div className="mt-2">
                <BankGrid
                  banks={COW_BANKS}
                  selected={bankCode}
                  onSelect={(code) => dispatch({ type: 'setBank', bankCode: code })}
                />
              </div>
            </section>

            <button
              type="button"
              disabled={!bankCode}
              onClick={handleRegister}
              className={cn(
                'w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition',
                bankCode
                  ? 'bg-zinc-900 text-white active:bg-zinc-700'
                  : 'cursor-not-allowed bg-zinc-200 text-zinc-400',
              )}
            >
              Bayar {formatIDR(breakdown.total)}
            </button>
            <p className="-mt-3 text-center text-xs text-zinc-400">
              Nominal termasuk biaya admin VA Rp3.500 per transaksi
            </p>
          </div>
        )
      }

      case 'va': {
        if (!payment) return null
        const remaining = remainingSeconds(payment.inactiveDate, nowMs)
        const urgent = remaining < 5 * 60
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <CircleCheckBig className="h-5 w-5 text-emerald-600" aria-hidden />
              Virtual Account dibuat
            </div>

            <VaBox
              va={payment.va}
              inactiveDate={payment.inactiveDate}
              nowMs={nowMs}
              onCopy={() => void copyText(payment.va, 'Nomor VA')}
            />

            <div
              className={cn(
                'flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm',
                urgent
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-amber-200 bg-amber-50 text-amber-800',
              )}
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Bayar <strong className="tabular">{formatIDR(payment.total)}</strong>{' '}
                tepat ke nomor VA di atas. Nominal berbeda tidak akan tertagih
                otomatis.
              </span>
            </div>

            <Instructions
              bankName={payment.bankName}
              va={groupDigits(payment.va)}
              totalText={formatIDR(payment.total)}
            />

            <p className="text-xs leading-relaxed text-zinc-400">
              Status pembayaran dicek otomatis — halaman ini akan berubah sendiri
              begitu pembayaran diterima.
            </p>

            <button
              type="button"
              disabled={checking}
              onClick={() => void handleCheckPaid()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-900 px-4 py-3 text-sm font-semibold text-zinc-900 active:bg-zinc-50"
            >
              {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Saya sudah bayar
            </button>

            <button
              type="button"
              disabled={cancelling}
              onClick={() => void handleCancelBooking()}
              className="mx-auto block text-xs font-medium text-zinc-400 underline-offset-2 active:text-zinc-600"
            >
              {cancelling ? 'Membatalkan…' : 'Batalkan pesanan'}
            </button>
          </div>
        )
      }

      case 'expired':
        return (
          <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <CircleAlert className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Virtual Account kedaluwarsa</h2>
            <p className="text-sm leading-relaxed text-zinc-500">
              Nomor VA lama sudah tidak berlaku dan slot dilepas kembali. Anda bisa
              membuat VA baru dengan durasi &amp; bank yang sama.
            </p>
            <div className="mt-2 w-full max-w-xs space-y-2">
              <button
                type="button"
                onClick={() => void handleNewVa()}
                className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white active:bg-zinc-700"
              >
                Buat VA baru
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={() => void handleCancelBooking()}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 active:bg-zinc-50"
              >
                {cancelling ? 'Membatalkan…' : 'Batalkan pesanan'}
              </button>
            </div>
          </div>
        )

      case 'cancelled':
        return (
          <div className="flex flex-col items-center gap-3 px-2 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
              <CircleAlert className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="text-base font-semibold">Pemesanan dibatalkan</h2>
            <p className="text-sm leading-relaxed text-zinc-500">
              {payment
                ? `Invoice ${payment.bookingCode} dibatalkan dan slot sudah dilepas.`
                : 'Slot sudah dilepas kembali.'}
              {cancelledAt ? ` Dibatalkan ${formatDateTime(cancelledAt)}.` : ''}
            </p>
            <div className="mt-2 w-full max-w-xs space-y-2">
              <button
                type="button"
                onClick={() => dispatch({ type: 'startOver' })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white active:bg-zinc-700"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                Mulai dari awal
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-600 active:bg-zinc-50"
              >
                Kembali ke beranda
              </button>
            </div>
          </div>
        )

      case 'paid': {
        if (!payment) return null
        const token = payment.bookingCode.replace(/\D/g, '').slice(-6).split('').join(' ')
        const receiptLines = [
          `Booking: ${payment.bookingCode}`,
          `${payment.workspaceName} · ${payment.hours} jam`,
          `Total dibayar: ${formatIDR(payment.total)}`,
          `VA ${payment.bankName}: ${payment.va}`,
          `Dibayar: ${formatDateTime(payment.paidAt)}`,
          `Ref: ${payment.ref ?? '—'}`,
        ].join('\n')
        return (
          <div className="flex flex-col items-center gap-4 px-1 py-8 text-center">
            <CircleCheckBig className="h-14 w-14 text-emerald-500" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Pembayaran berhasil
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                {payment.workspaceName} kamu sudah terkunci selama {payment.hours} jam.
              </p>
            </div>

            {/* E-ticket */}
            <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left">
              <p className="text-center text-xs font-medium uppercase tracking-wide text-zinc-500">
                Kode check-in — tunjukkan ke staf
              </p>
              <p className="mt-2 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-zinc-900">
                {token}
              </p>
              <dl className="mt-4 space-y-1.5 border-t border-zinc-200 pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Booking</dt>
                  <dd className="font-medium text-zinc-900">{payment.bookingCode}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Detail</dt>
                  <dd className="text-right font-medium text-zinc-900">
                    {payment.workspaceName} · {payment.hours} jam
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Total dibayar</dt>
                  <dd className="tabular font-semibold text-zinc-900">
                    {formatIDR(payment.total)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Metode</dt>
                  <dd className="font-medium text-zinc-900">VA {payment.bankName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-zinc-500">Dibayar</dt>
                  <dd className="font-medium text-zinc-900">
                    {formatDateTime(payment.paidAt)}
                  </dd>
                </div>
                {payment.ref && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-zinc-500">Ref</dt>
                    <dd className="font-mono text-xs text-zinc-600">{payment.ref}</dd>
                  </div>
                )}
              </dl>
            </div>

            {publicSettings?.showWifiToCustomer && publicSettings.wifiSsid && (
              <div className="w-full rounded-2xl border border-dashed border-sky-200 bg-sky-50 p-4 text-left">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
                  <Wifi className="h-3.5 w-3.5" aria-hidden />
                  Wi-Fi venue — {publicSettings.venueName}
                </p>
                <div className="mt-2 space-y-1.5 text-sm">
                  <p className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">SSID</span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {publicSettings.wifiSsid}
                    </span>
                  </p>
                  <p className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1 text-zinc-500">
                      <KeyRound className="h-3 w-3" aria-hidden />
                      Kata sandi
                    </span>
                    <span className="font-mono font-semibold text-zinc-900">
                      {publicSettings.wifiPassword || '—'}
                    </span>
                  </p>
                </div>
              </div>
            )}

            <div className="w-full space-y-2">
              <button
                type="button"
                onClick={() => void copyText(receiptLines, 'Struk')}
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-700 active:bg-zinc-50"
              >
                Salin struk
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white active:bg-zinc-700"
              >
                Selesai
              </button>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }

  return (
    <PhoneShell>
      {isDemoMode && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-800">
          Mode demo — data simulasi, tanpa pembayaran sungguhan.
        </div>
      )}

      {/* Header / hero */}
      <header className="bg-zinc-900 px-4 pb-5 pt-4 text-white">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Kembali ke beranda"
          className="flex items-center gap-1 text-xs font-medium text-zinc-400 active:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Beranda
        </button>
        {workspace ? (
          <div className="mt-3 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <WorkspaceTypeIcon type={workspace.type} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {workspace.venueName}
              </p>
              <h1 className="truncate text-lg font-semibold">{workspace.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-400">
                {workspace.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {workspace.location}
                  </span>
                )}
                {workspace.type === 'room' && workspace.capacity > 1 && (
                  <span>Kapasitas {workspace.capacity} orang</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              MAJA Coworking
            </p>
            <h1 className="text-lg font-semibold">Pembayaran Workspace</h1>
          </div>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-5 pb-28">{renderBody()}</main>

      {/* Demo webhook simulator (VA & expired screens only) */}
      {demoApi.isAvailable && (phase === 'va' || phase === 'expired') && (
        <DemoPanel busy={demoBusy} onMarkPaid={() => void handleDemoMarkPaid()} />
      )}
    </PhoneShell>
  )
}
