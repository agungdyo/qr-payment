import { Navigate, Route, Routes } from 'react-router-dom'

import { AuthGuard } from '@/components/AuthGuard'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminLockersPage } from '@/pages/admin/AdminLockersPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { AdminWorkspacesPage } from '@/pages/admin/AdminWorkspacesPage'
import { WorkspaceFormPage } from '@/pages/admin/WorkspaceFormPage'
import { HomePage } from '@/pages/HomePage'
import { PaymentFlowPage } from '@/pages/PaymentFlowPage'

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

// Halaman login - redirect ke backend auth
function LoginPage() {
  // Redirect langsung ke backend login endpoint
  window.location.href = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/auth/login`
  return null
}
