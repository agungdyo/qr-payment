import { bankName } from '@/lib/banks'
import { quote } from '@/lib/pricing'
import { cloneDbValue, loadDb, mutate } from './store'
import {
  ApiError,
  type AdminApi,
  type AdminStats,
  type DemoApi,
  type Locker,
  type Payment,
  type PaymentApi,
  type PublicSettings,
  type VenueSettings,
  type Workspace,
  type WorkspaceInput,
} from './types'

/**
 * In-browser mock of the MAJA-backed backend. Simulates:
 *   - public: workspace lookup, register (VA), payment notification (DemoApi),
 *     inquiry, cancel, public settings
 *   - admin: workspace/locker/settings CRUD + stats (shared store)
 */

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const randomDigits = (length: number): string => {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += Math.floor(Math.random() * 10).toString()
  }
  return out
}

const randomBookingCode = () => `BK-${randomDigits(4)}-${randomDigits(4)}`

const VA_PREFIXES: Record<string, string> = {
  bni: '8808',
  bca: '3901',
  mandiri: '89508',
  bri: '8808',
  bsi: '4518',
  permata: '8078',
}

const createVa = (bankCode: string): string => {
  const prefix = VA_PREFIXES[bankCode] ?? '8808'
  return prefix + randomDigits(12 - Math.min(prefix.length, 12))
}

const isExpired = (payment: Payment, nowMs = Date.now()): boolean =>
  Date.parse(payment.inactiveDate) <= nowMs

/** Drop-in for MAJA's OAuth password grant — no-op in mock mode. */
const authorize = async () => {
  await delay(60)
}

function findActiveWorkspace(code: string): Workspace | null {
  const workspace = loadDb().workspaces.find((w) => w.code === code)
  if (!workspace) return null
  return workspace.isActive ? cloneDbValue(workspace) : null
}

const publicApi: PaymentApi = {
  async listWorkspaces() {
    await authorize()
    await delay(150)
    return cloneDbValue(loadDb().workspaces.filter((w) => w.isActive))
  },

  async getWorkspace(code) {
    await authorize()
    await delay(180)
    const workspace = findActiveWorkspace(code)
    if (!workspace) {
      throw new ApiError('Meja/ruangan tidak ditemukan atau sedang nonaktif', {
        status: 404,
      })
    }
    return workspace
  },

  async findOpenPayment(workspaceCode) {
    await authorize()
    await delay(120)
    const db = loadDb()
    const open = db.payments.find(
      (p) =>
        p.workspaceCode === workspaceCode &&
        p.status === 'issued' &&
        !isExpired(p),
    )
    return open ? cloneDbValue(open) : null
  },

  async initiatePayment(req) {
    await authorize()
    await delay(700)

    const workspace = findActiveWorkspace(req.workspaceCode)
    if (!workspace) {
      throw new ApiError('Meja/ruangan tidak ditemukan atau sedang nonaktif', {
        status: 404,
      })
    }
    const bank = bankName(req.bankCode)
    const price = quote(workspace, req.hours)

    return mutate((db) => {
      // Idempotency: resume an existing open (issued, unexpired) VA.
      const open = db.payments.find(
        (p) =>
          p.workspaceCode === req.workspaceCode &&
          p.status === 'issued' &&
          !isExpired(p),
      )
      if (open) return cloneDbValue(open)

      // Expiry cron equivalent: close stale VAs before registering a new one.
      for (const p of db.payments) {
        if (
          p.workspaceCode === req.workspaceCode &&
          p.status === 'issued' &&
          isExpired(p)
        ) {
          p.status = 'cancelled'
        }
      }

      const now = Date.now()
      const payment: Payment = {
        id: `pay_${randomDigits(16)}`,
        bookingCode: randomBookingCode(),
        workspaceCode: workspace.code,
        workspaceName: workspace.name,
        hours: req.hours,
        subtotal: price.subtotal,
        tax: price.tax,
        adminFee: price.adminFee,
        total: price.total,
        bankCode: req.bankCode,
        bankName: bank,
        va: createVa(req.bankCode),
        status: 'issued',
        createdAt: new Date(now).toISOString(),
        // Demo: 10-minute VA window so the expiry flow is easy to test.
        inactiveDate: new Date(now + 10 * 60 * 1000).toISOString(),
        paidAt: null,
        ref: null,
      }
      db.payments.push(payment)
      return cloneDbValue(payment)
    })
  },

  async getPayment(id) {
    await authorize()
    await delay(150)
    const payment = loadDb().payments.find((p) => p.id === id)
    if (!payment) {
      throw new ApiError('Pembayaran tidak ditemukan', { status: 404 })
    }
    return cloneDbValue(payment)
  },

  async inquiryPayment(id) {
    await authorize()
    await delay(600)
    return publicApi.getPayment(id)
  },

  async cancelPayment(id) {
    await authorize()
    await delay(400)
    return mutate((db) => {
      const payment = db.payments.find((p) => p.id === id)
      if (!payment) {
        throw new ApiError('Pembayaran tidak ditemukan', { status: 404 })
      }
      if (payment.status === 'paid') {
        throw new ApiError('Invoice sudah lunas — tidak dapat dibatalkan', {
          status: 409,
        })
      }
      payment.status = 'cancelled'
      return { cancelledAt: new Date().toISOString() }
    })
  },

  async getPublicSettings() {
    await authorize()
    await delay(100)
    const s = loadDb().settings
    const out: PublicSettings = {
      venueName: s.venueName,
      wifiSsid: s.wifiSsid,
      wifiPassword: s.wifiPassword,
      showWifiToCustomer: s.showWifiToCustomer,
    }
    return out
  },
}

function sortTiers(input: WorkspaceInput): WorkspaceInput {
  const tiers = [...input.tiers].sort((a, b) => a.durationHours - b.durationHours)
  return { ...input, tiers }
}

const adminApi: AdminApi = {
  async getStats() {
    await delay(120)
    const db = loadDb()
    const stats: AdminStats = {
      workspaceTotal: db.workspaces.length,
      workspaceActive: db.workspaces.filter((w) => w.isActive).length,
      lockerTotal: db.lockers.length,
      lockerAvailable: db.lockers.filter((l) => l.status === 'available').length,
      paymentPaidTotal: db.payments.filter((p) => p.status === 'paid').length,
      paymentPendingTotal: db.payments.filter((p) => p.status === 'issued').length,
    }
    return stats
  },

  async listWorkspaces() {
    await delay(120)
    return cloneDbValue(loadDb().workspaces)
  },

  async createWorkspace(input) {
    await delay(300)
    return mutate((db) => {
      const code = input.code.trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(code)) {
        throw new ApiError('Kode tidak valid — gunakan huruf kecil, angka, dan "-"')
      }
      if (db.workspaces.some((w) => w.code === code)) {
        throw new ApiError('Kode workspace sudah dipakai', { status: 409 })
      }
      const workspace: Workspace = {
        code,
        venueName: db.settings.venueName,
        ...sortTiers(input),
      }
      db.workspaces.push(workspace)
      return cloneDbValue(workspace)
    })
  },

  async updateWorkspace(code, input) {
    await delay(300)
    return mutate((db) => {
      const workspace = db.workspaces.find((w) => w.code === code)
      if (!workspace) {
        throw new ApiError('Workspace tidak ditemukan', { status: 404 })
      }
      Object.assign(workspace, sortTiers(input))
      return cloneDbValue(workspace)
    })
  },

  async listLockers() {
    await delay(120)
    return cloneDbValue(loadDb().lockers)
  },

  async createLocker(input) {
    await delay(250)
    return mutate((db) => {
      if (db.lockers.some((l) => l.code === input.code)) {
        throw new ApiError('Kode loker sudah dipakai', { status: 409 })
      }
      const locker: Locker = { id: `lk-${randomDigits(6)}`, ...input }
      db.lockers.push(locker)
      return cloneDbValue(locker)
    })
  },

  async updateLocker(id, input) {
    await delay(250)
    return mutate((db) => {
      const locker = db.lockers.find((l) => l.id === id)
      if (!locker) {
        throw new ApiError('Loker tidak ditemukan', { status: 404 })
      }
      if (input.code !== locker.code && db.lockers.some((l) => l.code === input.code)) {
        throw new ApiError('Kode loker sudah dipakai', { status: 409 })
      }
      Object.assign(locker, input)
      return cloneDbValue(locker)
    })
  },

  async deleteLocker(id) {
    await delay(200)
    return mutate((db) => {
      const index = db.lockers.findIndex((l) => l.id === id)
      if (index === -1) {
        throw new ApiError('Loker tidak ditemukan', { status: 404 })
      }
      db.lockers.splice(index, 1)
      return { ok: true as const }
    })
  },

  async getSettings() {
    await delay(100)
    return cloneDbValue(loadDb().settings)
  },

  async updateSettings(input: VenueSettings) {
    await delay(250)
    return mutate((db) => {
      db.settings = { ...input }
      // Keep workspace venue names in sync with the venue display name.
      for (const w of db.workspaces) w.venueName = input.venueName
      return cloneDbValue(db.settings)
    })
  },

  async listPayments(limit = 8) {
    await delay(120)
    const sorted = [...loadDb().payments].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
    return cloneDbValue(sorted.slice(0, limit))
  },
}

/** Simulates MAJA's payment notification hitting the merchant webhook. */
const demoApi: DemoApi = {
  isAvailable: true,
  async markPaid(id) {
    await delay(400)
    return mutate((db) => {
      const payment = db.payments.find((p) => p.id === id)
      if (!payment) {
        throw new ApiError('Pembayaran tidak ditemukan', { status: 404 })
      }
      payment.status = 'paid'
      payment.paidAt = new Date().toISOString()
      payment.ref = `REF${randomDigits(12)}`
      return cloneDbValue(payment)
    })
  },
}

export { publicApi as mockApi, adminApi as mockAdminApi, demoApi }
