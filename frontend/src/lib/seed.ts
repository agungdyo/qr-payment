import type { Locker, VenueSettings, Workspace } from './api/types'

/** Seed data for the shared demo store (workspaces, lockers, venue settings). */

const VENUE_NAME = 'Maja Coworking Senopati'

export const seedWorkspaces: Workspace[] = [
  {
    code: 'meja-12',
    name: 'Meja 12 — Hot Desk',
    venueName: VENUE_NAME,
    type: 'desk',
    location: 'Lantai 2 · dekat jendela',
    capacity: 1,
    description: 'Meja fleksibel dengan colokan listrik dan Wi-Fi cepat.',
    isActive: true,
    hourlyRate: 20000,
    tiers: [
      { durationHours: 1, price: 20000 },
      { durationHours: 3, price: 55000 },
      { durationHours: 5, price: 85000 },
      { durationHours: 24, price: 400000 },
    ],
  },
  {
    code: 'meja-04',
    name: 'Meja 04 — Quiet Zone',
    venueName: VENUE_NAME,
    type: 'desk',
    location: 'Lantai 2 · zona tenang',
    capacity: 1,
    description: 'Zona tenang untuk fokus, tersedia lampu baca.',
    isActive: true,
    hourlyRate: 25000,
    tiers: [
      { durationHours: 1, price: 25000 },
      { durationHours: 3, price: 70000 },
      { durationHours: 8, price: 170000 },
      { durationHours: 24, price: 450000 },
    ],
  },
  {
    code: 'ruang-a',
    name: 'Ruang A — Meeting Room',
    venueName: VENUE_NAME,
    type: 'room',
    location: 'Lantai 3',
    capacity: 6,
    description: 'Ruang meeting kapasitas 6 orang, TV & whiteboard.',
    isActive: true,
    hourlyRate: 150000,
    tiers: [
      { durationHours: 1, price: 150000 },
      { durationHours: 3, price: 400000 },
      { durationHours: 8, price: 1000000 },
      { durationHours: 24, price: 2500000 },
    ],
  },
]

export const seedLockers: Locker[] = [
  { id: 'lk-1', code: 'LK-01', location: 'Lantai 2 · dekat lift', status: 'available' },
  { id: 'lk-2', code: 'LK-02', location: 'Lantai 2 · dekat lift', status: 'occupied', note: 'Disewa s.d. akhir bulan' },
  { id: 'lk-3', code: 'LK-03', location: 'Lantai 3 · belakang pantry', status: 'available' },
  { id: 'lk-4', code: 'LK-04', location: 'Lantai 3 · belakang pantry', status: 'occupied', note: 'Disewa s.d. 2 minggu lagi' },
]

export const seedSettings: VenueSettings = {
  venueName: VENUE_NAME,
  wifiSsid: 'MAJA_5G',
  wifiPassword: 'senopati2026',
  showWifiToCustomer: true,
}
