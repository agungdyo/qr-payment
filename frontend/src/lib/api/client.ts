import { ApiError, type AdminApi, type DemoApi, type PaymentApi } from './types'
import { demoApi as mockDemoApi, mockAdminApi, mockApi } from './mock'

/**
 * Auth API functions (always calls real backend, not mock)
 */
export interface AuthMeResponse {
  authenticated: boolean
  user?: {
    id: string
    username: string
    name?: string
    email?: string
  }
  roles?: string[]
}

export async function authMe(): Promise<AuthMeResponse> {
  if (!API_BASE) {
    // Demo mode: no real auth
    return { authenticated: false }
  }
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    })
    if (!res.ok) return { authenticated: false }
    return (await res.json()) as AuthMeResponse
  } catch {
    return { authenticated: false }
  }
}

export async function authLogout(): Promise<void> {
  if (!API_BASE) return
  await fetch(`${API_BASE}/auth/logout`, {
    credentials: 'include',
  })
}

export async function authLogin(): Promise<void> {
  if (!API_BASE) return
  window.location.href = `${API_BASE}/auth/login`
}

// --------------------------------------------------------------------------------
// Transport selection:
//  - no VITE_API_BASE_URL   → in-browser mock (default, for the prototype)
//  - VITE_API_BASE_URL set  → real HTTP backend (endpoints in .env.example)
// --------------------------------------------------------------------------------
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/+$/,
  '',
)

const DEMO_FORCED = import.meta.env.VITE_ENABLE_DEMO === 'true'

export const isDemoMode = !API_BASE || DEMO_FORCED

async function parseError(res: Response): Promise<ApiError> {
  let message = `Gagal (${res.status})`
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) message = body.message
  } catch {
    // non-JSON error body
  }
  return new ApiError(message, { status: res.status })
}

function makeRequest(base: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Send cookies for session auth
        ...init,
      })
    } catch {
      throw new ApiError('Tidak dapat terhubung ke server. Coba lagi.', {
        status: 0,
      })
    }
    if (!res.ok) throw await parseError(res)
    return (await res.json()) as T
  }
  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'PUT',
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  }
}

function buildPublicApi(base: string): PaymentApi {
  const { get, post } = makeRequest(base)
  return {
    listWorkspaces: () => get('/api/v1/workspaces'),
    getWorkspace: (code) => get(`/api/v1/workspaces/${code}`),
    findOpenPayment: (workspaceCode) =>
      get(`/api/v1/workspaces/${workspaceCode}/open-payment`),
    initiatePayment: (req) => post('/api/v1/payments/initiate', req),
    getPayment: (id) => get(`/api/v1/payments/${id}`),
    inquiryPayment: (id) => post(`/api/v1/payments/${id}/inquiry`),
    cancelPayment: (id) => post(`/api/v1/payments/${id}/cancel`),
    getPublicSettings: () => get('/api/v1/public/settings'),
  }
}

function buildAdminApi(base: string): AdminApi {
  const { get, post, put, del } = makeRequest(base)
  return {
    getStats: () => get('/api/v1/admin/stats'),
    listWorkspaces: () => get('/api/v1/admin/workspaces'),
    createWorkspace: (input) => post('/api/v1/admin/workspaces', input),
    updateWorkspace: (code, input) => put(`/api/v1/admin/workspaces/${code}`, input),
    listLockers: () => get('/api/v1/admin/lockers'),
    createLocker: (input) => post('/api/v1/admin/lockers', input),
    updateLocker: (id, input) => put(`/api/v1/admin/lockers/${id}`, input),
    deleteLocker: (id) => del(`/api/v1/admin/lockers/${id}`),
    getSettings: () => get('/api/v1/admin/settings'),
    updateSettings: (input) => put('/api/v1/admin/settings', input),
    listPayments: (limit = 8) => get(`/api/v1/admin/payments?limit=${limit}`),
  }
}

const realPublic: PaymentApi | null = API_BASE ? buildPublicApi(API_BASE) : null
const realAdmin: AdminApi | null = API_BASE ? buildAdminApi(API_BASE) : null

export const api: PaymentApi = isDemoMode ? mockApi : (realPublic as PaymentApi)
export const adminApi: AdminApi = isDemoMode ? mockAdminApi : (realAdmin as AdminApi)
export const demoApi: DemoApi = isDemoMode
  ? mockDemoApi
  : {
      isAvailable: false,
      markPaid: () => {
        throw new ApiError('Simulasi webhook hanya tersedia di mode demo', {
          status: 501,
        })
      },
    }
