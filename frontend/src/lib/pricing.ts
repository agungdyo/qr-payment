import type { BillingMode, RateTier } from './api/types'

/**
 * Pricing rules (shared by the customer preview and the mock backend — the
 * backend is the source of truth for the final invoice).
 *
 * Sources of price, each toggled per workspace by the admin:
 *  1. Fixed-price duration packages (tarif per durasi).
 *  2. Optional hourly fallback for durations without a package.
 *  3. Monthly/annual pass, charged once per calendar period.
 */

export const TAX_RATE = 0.11 // PPN
export const VA_ADMIN_FEE = 3500 // biaya admin VA per transaksi (MAJA)
export const MIN_HOURS = 1
export const MAX_HOURS = 24

export interface Rates {
  durationEnabled: boolean
  hourlyEnabled: boolean
  periodicEnabled: boolean
  hourlyRate: number
  monthlyPrice: number
  annualPrice: number
  tiers: RateTier[]
}

export interface PriceSelection {
  mode: BillingMode
  hours?: number
}

/** Display label for a duration in hours. */
export function hoursLabel(hours: number): string {
  return hours === 24 ? 'Harian (24 jam)' : `${hours} jam`
}

/** Short label for a billing mode (mode picker). */
export function billingModeLabel(mode: BillingMode): string {
  if (mode === 'monthly') return 'Bulanan'
  if (mode === 'annual') return 'Tahunan'
  return 'Per durasi'
}

/** Label for what the customer bought (receipt / breakdown). */
export function billingSelectionLabel(mode: BillingMode, hours: number): string {
  if (mode === 'monthly') return 'Bulanan (1 bulan)'
  if (mode === 'annual') return 'Tahunan (1 tahun)'
  return hoursLabel(hours)
}

/** Exact tier for a duration, if the workspace defines one. */
export function tierFor(rates: Rates, hours: number): RateTier | undefined {
  return rates.tiers.find((t) => t.durationHours === hours)
}

/** Unique sorted tier durations (for the duration chips). */
export function tierDurations(rates: Rates): number[] {
  return [...new Set(rates.tiers.map((t) => t.durationHours))].sort((a, b) => a - b)
}

/** Enabled modes, in display order. Duration needs a package or hourly rate. */
export function availableBillingModes(rates: Rates): BillingMode[] {
  const modes: BillingMode[] = []
  if (rates.durationEnabled && (rates.tiers.length > 0 || rates.hourlyEnabled)) {
    modes.push('duration')
  }
  if (rates.periodicEnabled && rates.monthlyPrice > 0) modes.push('monthly')
  if (rates.periodicEnabled && rates.annualPrice > 0) modes.push('annual')
  return modes
}

/** Default selection when a workspace is loaded. */
export function defaultSelection(rates: Rates): { mode: BillingMode; hours: number } {
  const mode = availableBillingModes(rates)[0] ?? 'duration'
  const first = tierDurations(rates)[0]
  return { mode, hours: mode === 'duration' && first ? first : MIN_HOURS }
}

/**
 * Package price for an exact duration. Without a package the hourly rate is
 * only used when the admin enables it; otherwise the duration is not billable.
 */
export function resolveSubtotal(rates: Rates, hours: number): number | null {
  const tier = tierFor(rates, hours)
  if (tier) return Math.round(tier.price)
  if (!rates.hourlyEnabled) return null
  return Math.round(rates.hourlyRate * hours)
}

export interface PriceBreakdown {
  mode: BillingMode
  hours: number
  label: string
  tiered: boolean
  subtotal: number
  tax: number
  adminFee: number
  total: number
}

export function quote(rates: Rates, selection: PriceSelection): PriceBreakdown | null {
  const mode = selection.mode
  const hours = selection.hours ?? 0
  let subtotal: number | null
  let tiered = false
  if (mode === 'duration') {
    subtotal = resolveSubtotal(rates, hours)
    tiered = Boolean(tierFor(rates, hours))
  } else {
    subtotal = mode === 'monthly' ? rates.monthlyPrice : rates.annualPrice
  }
  if (subtotal === null || subtotal <= 0) return null
  const tax = Math.round(subtotal * TAX_RATE)
  return {
    mode,
    hours,
    label: billingSelectionLabel(mode, hours),
    tiered,
    subtotal,
    tax,
    adminFee: VA_ADMIN_FEE,
    total: subtotal + tax + VA_ADMIN_FEE,
  }
}
