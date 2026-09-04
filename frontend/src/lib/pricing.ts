import type { RateTier } from './api/types'

/**
 * Pricing rules (shared by the customer preview and the mock backend — the
 * backend is the source of truth for the final invoice).
 *
 * Two sources of price:
 *  1. Fixed-price duration tiers (tarif per durasi): an exact duration
 *     match uses the tier price (e.g. "3 jam Rp 55.000", "Harian Rp 400.000").
 *  2. Fallback hourly rate: any other duration is charged hourlyRate × hours.
 */

export const TAX_RATE = 0.11 // PPN
export const VA_ADMIN_FEE = 3500 // biaya admin VA per transaksi (MAJA)
export const MIN_HOURS = 1
export const MAX_HOURS = 24

export interface Rates {
  hourlyRate: number
  tiers: RateTier[]
}

/** Display label for a duration in hours. */
export function hoursLabel(hours: number): string {
  return hours === 24 ? 'Harian (24 jam)' : `${hours} jam`
}

/** Exact tier for a duration, if the workspace defines one. */
export function tierFor(rates: Rates, hours: number): RateTier | undefined {
  return rates.tiers.find((t) => t.durationHours === hours)
}

/** Unique sorted tier durations (for the duration chips). */
export function tierDurations(rates: Rates): number[] {
  return [...new Set(rates.tiers.map((t) => t.durationHours))].sort((a, b) => a - b)
}

export function resolveSubtotal(rates: Rates, hours: number): number {
  const tier = tierFor(rates, hours)
  if (tier) return Math.round(tier.price)
  return Math.round(rates.hourlyRate * hours)
}

export interface PriceBreakdown {
  hours: number
  label: string
  tiered: boolean
  subtotal: number
  tax: number
  adminFee: number
  total: number
}

export function quote(rates: Rates, hours: number): PriceBreakdown {
  const tier = tierFor(rates, hours)
  const subtotal = resolveSubtotal(rates, hours)
  const tax = Math.round(subtotal * TAX_RATE)
  const total = subtotal + tax + VA_ADMIN_FEE
  return {
    hours,
    label: tier ? hoursLabel(tier.durationHours) : `${hoursLabel(hours)} · tarif per jam`,
    tiered: Boolean(tier),
    subtotal,
    tax,
    adminFee: VA_ADMIN_FEE,
    total,
  }
}
