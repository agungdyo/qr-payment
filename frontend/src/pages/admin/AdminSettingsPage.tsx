import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Wifi } from 'lucide-react'

import { Button, Card, Field, Switch, TextInput } from '@/components/admin/controls'
import { adminApi } from '@/lib/api/client'
import type { VenueSettings } from '@/lib/api/types'

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<VenueSettings | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    adminApi
      .getSettings()
      .then((s) => {
        if (alive) setSettings(s)
      })
      .catch(() => {
        if (alive) toast.error('Gagal memuat pengaturan')
      })
    return () => {
      alive = false
    }
  }, [])

  const patch = (partial: Partial<VenueSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev))

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    try {
      await adminApi.updateSettings({
        ...settings,
        venueName: settings.venueName.trim() || 'Coworking Space',
      })
      toast.success('Pengaturan disimpan')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" aria-hidden />
        <p className="text-sm text-zinc-500">Memuat pengaturan…</p>
      </div>
    )
  }

  const preview = settings.showWifiToCustomer && settings.wifiSsid

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Pengaturan Venue &amp; Wi-Fi</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Nama venue & kredensial Wi-Fi yang tampil ke customer.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <Field label="Nama venue" hint="Ditampilkan di header halaman customer & struk.">
          <TextInput
            value={settings.venueName}
            onChange={(e) => patch({ venueName: e.target.value })}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Wifi className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Wi-Fi venue</h2>
            <p className="text-xs text-zinc-500">Update SSID & kata sandi Wi-Fi.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SSID">
            <TextInput
              value={settings.wifiSsid}
              placeholder="MAJA_5G"
              onChange={(e) => patch({ wifiSsid: e.target.value })}
            />
          </Field>
          <Field label="Kata sandi Wi-Fi">
            <div className="relative">
              <TextInput
                type={showPassword ? 'text' : 'password'}
                value={settings.wifiPassword}
                autoComplete="new-password"
                placeholder="••••••••"
                onChange={(e) => patch({ wifiPassword: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-zinc-400 hover:text-zinc-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">Tampilkan ke customer</p>
            <p className="text-xs text-zinc-500">
              SSID & kata sandi muncul di e-ticket setelah pembayaran berhasil.
            </p>
          </div>
          <Switch
            checked={settings.showWifiToCustomer}
            onChange={(value) => patch({ showWifiToCustomer: value })}
            label="Tampilkan Wi-Fi di e-ticket"
          />
        </div>

        {preview && (
          <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50 px-4 py-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
              Pratinjau di e-ticket customer
            </p>
            <p className="mt-1.5 text-zinc-600">
              Wi-Fi venue — {settings.venueName}:{' '}
              <span className="font-mono font-semibold text-zinc-900">{settings.wifiSsid}</span>{' '}
              ·{' '}
              <span className="font-mono font-semibold text-zinc-900">
                {settings.wifiPassword || '—'}
              </span>
            </p>
          </div>
        )}
      </Card>

      <div className="flex justify-end pb-8">
        <Button disabled={saving} onClick={() => void handleSave()}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan pengaturan
        </Button>
      </div>
    </div>
  )
}
