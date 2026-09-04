import type { Locker, Payment, VenueSettings, Workspace } from './types'
import { seedLockers, seedSettings, seedWorkspaces } from '@/lib/seed'

/**
 * Shared demo store (localStorage-backed). One source of truth so that admin
 * edits (harga, nonaktifkan meja, Wi-Fi) are immediately visible on the
 * customer payment page.
 *
 * Shape:
 *   { version, workspaces, lockers, settings, payments }
 */

const DB_KEY = 'qr-payment.db.v1'

interface Db {
  version: number
  workspaces: Workspace[]
  lockers: Locker[]
  settings: VenueSettings
  payments: Payment[]
}

function cloneSeed<T>(value: T): T {
  return structuredClone(value)
}

function seedDb(): Db {
  return {
    version: 1,
    workspaces: cloneSeed(seedWorkspaces),
    lockers: cloneSeed(seedLockers),
    settings: cloneSeed(seedSettings),
    payments: [],
  }
}

function loadRaw(): Db | null {
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Db
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.workspaces)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/** Read the store; seeds (or repairs) it from defaults when missing/corrupt. */
export function loadDb(): Db {
  const existing = loadRaw()
  if (existing) return existing
  const fresh = seedDb()
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(fresh))
  } catch {
    // storage unavailable — session-only seed
  }
  return fresh
}

export function saveDb(db: Db): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // storage full / private mode — keep in-memory copy
  }
}

/** Load, mutate, persist, return the mutation result. */
export function mutate<T>(fn: (db: Db) => T): T {
  const db = loadDb()
  const result = fn(db)
  saveDb(db)
  return result
}

/** Deep-clone a DB value so callers cannot accidentally mutate the store. */
export function cloneDbValue<T>(value: T): T {
  return structuredClone(value)
}

/** Delete demo store (used by tests/devtools). */
export function resetDb(): void {
  try {
    localStorage.removeItem(DB_KEY)
  } catch {
    // noop
  }
}
