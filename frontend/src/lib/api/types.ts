export interface ApiErrorOptions {
  status?: number
}

/** Error thrown by the API layer (mock or real HTTP). */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status ?? 0
  }
}

export type WorkspaceType = 'desk' | 'room'

/** Price mode: duration packages, or a monthly/annual pass (paid once). */
export type BillingMode = 'duration' | 'monthly' | 'annual'

/** Fixed-price rental package, e.g. "3 jam Rp 55.000" or "Harian Rp 400.000". */
export interface RateTier {
  /** Package duration in hours (24 = daily pass). */
  durationHours: number
  /** Optional display label; when empty, derived from durationHours. */
  label?: string
  price: number
}

export interface Workspace {
  code: string
  name: string
  venueName: string
  type: WorkspaceType
  location?: string
  capacity: number
  description?: string
  /** Admin toggle — inactive workspaces are hidden and not bookable. */
  isActive: boolean
  /** Admin toggle — fixed-price duration packages are bookable. */
  durationEnabled: boolean
  /** Admin toggle — arbitrary durations may be charged hourlyRate × hours. */
  hourlyEnabled: boolean
  /** Admin toggle — monthly/annual pass is bookable. */
  periodicEnabled: boolean
  /** Fallback price per hour, only used when hourlyEnabled is on. */
  hourlyRate: number
  monthlyPrice: number
  annualPrice: number
  /** Fixed-price duration packages (tarif per durasi). */
  tiers: RateTier[]
}

/** Editable workspace fields (code is the immutable key). */
export interface WorkspaceInput {
  name: string
  type: WorkspaceType
  location?: string
  capacity: number
  description?: string
  isActive: boolean
  durationEnabled: boolean
  hourlyEnabled: boolean
  periodicEnabled: boolean
  hourlyRate: number
  monthlyPrice: number
  annualPrice: number
  tiers: RateTier[]
}

export interface BankOption {
  code: string
  name: string
}

export type PaymentStatus = 'issued' | 'paid' | 'cancelled' | 'failed'

export interface Payment {
  id: string
  /** Booking code — used as the MAJA invoice number (reconciliation anchor). */
  bookingCode: string
  workspaceCode: string
  workspaceName: string
  hours: number
  billingMode: BillingMode
  subtotal: number
  tax: number
  adminFee: number
  total: number
  bankCode: string
  bankName: string
  va: string
  status: PaymentStatus
  createdAt: string
  /** VA payment deadline (mirrors MAJA register inactiveDate). */
  inactiveDate: string
  paidAt: string | null
  /** MAJA notification reference — reconciliation anchor. */
  ref: string | null
}

export interface InitiatePaymentRequest {
  workspaceCode: string
  /** Duration in hours; 0 for monthly/annual passes. */
  hours: number
  bankCode: string
  billingMode: BillingMode
}

export interface CancelResult {
  cancelledAt: string
}

export type LockerStatus = 'available' | 'occupied'

export interface Locker {
  id: string
  code: string
  location?: string
  status: LockerStatus
  note?: string
}

export interface LockerInput {
  code: string
  location?: string
  status: LockerStatus
  note?: string
}

export interface VenueSettings {
  venueName: string
  wifiSsid: string
  wifiPassword: string
  /** Show SSID + password on the customer's paid e-ticket. */
  showWifiToCustomer: boolean
}

export interface PublicSettings {
  venueName: string
  wifiSsid: string
  wifiPassword: string
  showWifiToCustomer: boolean
}

export interface AdminStats {
  workspaceTotal: number
  workspaceActive: number
  lockerTotal: number
  lockerAvailable: number
  paymentPaidTotal: number
  paymentPendingTotal: number
}

/** Customer-facing endpoints (also used by the demo home page). */
export interface PaymentApi {
  listWorkspaces(): Promise<Workspace[]>
  getWorkspace(code: string): Promise<Workspace>
  /** Resume support: the open (issued, unexpired) VA matching the selection. */
  findOpenPayment(
    workspaceCode: string,
    billingMode?: BillingMode,
    hours?: number,
  ): Promise<Payment | null>
  /** POST /payments/initiate → MAJA register → returns issued payment with VA. */
  initiatePayment(req: InitiatePaymentRequest): Promise<Payment>
  /** Polling endpoint used while the VA screen is open. */
  getPayment(id: string): Promise<Payment>
  /** "Saya sudah bayar" → MAJA inquiry. */
  inquiryPayment(id: string): Promise<Payment>
  /** Cancel an unpaid invoice → MAJA cancel. */
  cancelPayment(id: string): Promise<CancelResult>
  getPublicSettings(): Promise<PublicSettings>
}

/** Admin console endpoints. */
export interface AdminApi {
  getStats(): Promise<AdminStats>
  listWorkspaces(): Promise<Workspace[]>
  createWorkspace(input: WorkspaceInput & { code: string }): Promise<Workspace>
  updateWorkspace(code: string, input: WorkspaceInput): Promise<Workspace>
  listLockers(): Promise<Locker[]>
  createLocker(input: LockerInput): Promise<Locker>
  updateLocker(id: string, input: LockerInput): Promise<Locker>
  deleteLocker(id: string): Promise<{ ok: true }>
  getSettings(): Promise<VenueSettings>
  updateSettings(input: VenueSettings): Promise<VenueSettings>
  listPayments(limit?: number): Promise<Payment[]>
}

export interface DemoApi {
  isAvailable: boolean
  /** Simulate the MAJA payment notification webhook marking the VA as paid. */
  markPaid(id: string): Promise<Payment>
}
