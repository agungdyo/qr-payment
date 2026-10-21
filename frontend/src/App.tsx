import { useEffect } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'

import { AuthGuard } from '@/components/AuthGuard'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminLockersPage } from '@/pages/admin/AdminLockersPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminWorkspacesPage } from '@/pages/admin/AdminWorkspacesPage'
import { WorkspaceFormPage } from '@/pages/admin/WorkspaceFormPage'
import { HomePage } from '@/pages/HomePage'
import { PaymentFlowPage } from '@/pages/PaymentFlowPage'
import { authLogin } from '@/lib/api/client'

export default function App() {
  return (
    <Routes>
      {/* Customer */}
      <Route path="/" element={<HomePage />} />
      <Route path="/w/:workspaceCode" element={<PaymentFlowPage />} />

      {/* Login */}
      <Route path="/login" element={<LoginPage />} />

      {/* Admin console - protected */}
      <Route
        path="/admin"
        element={
          <AuthGuard>
            <AdminLayout />
          </AuthGuard>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="workspaces" element={<AdminWorkspacesPage />} />
        <Route path="workspaces/new" element={<WorkspaceFormPage />} />
        <Route path="workspaces/:workspaceCode" element={<WorkspaceFormPage />} />
        <Route path="lockers" element={<AdminLockersPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Halaman login, redirect ke backend auth. Kalau callback gagal, tampilkan
// pesan dan tombol coba lagi supaya tidak berputar antara /login dan Keycloak.
function LoginPage() {
  const [params] = useSearchParams()
  const error = params.get('error')

  useEffect(() => {
    if (!error) authLogin('/admin')
  }, [error])

  if (!error) return null

  const message =
    error === 'auth_failed'
      ? 'Autentikasi gagal. Silakan coba lagi.'
      : error === 'no_code'
        ? 'Kode otorisasi tidak ditemukan.'
        : error === 'state_mismatch'
          ? 'Sesi login tidak valid. Mulai ulang dari halaman ini.'
          : 'Login dibatalkan atau gagal.'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-100 px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-zinc-900">Login gagal</h1>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
        <button
          onClick={() => authLogin('/admin')}
          className="mt-5 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Coba lagi
        </button>
        <a href="/" className="mt-3 block text-center text-sm text-zinc-500">
          Kembali ke beranda
        </a>
      </div>
    </div>
  )
}
