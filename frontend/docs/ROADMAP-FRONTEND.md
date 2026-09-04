# QR Payment - Development Roadmap

> Backlog items untuk pengembangan fitur frontend QR Payment coworking space.
> Status: Draft

---

## Overview Proyek

Sistem pembayaran QR untuk sewa meja dan ruangan coworking space. Customer memindai QR di meja/ruangan, memilih durasi, dan membayar via Virtual Account.

**Tech Stack:**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router v6
- Zustand (planned)
- React Hook Form + Zod (planned)

**Repo Structure:**
```
qr-payment/
├── frontend/          # Main application (production)
│   ├── src/
│   │   ├── pages/     # Customer & Admin pages
│   │   ├── components/# Reusable components
│   │   └── lib/       # API, state machine, utils
│   └── docs/          # This file
├── demo-v1/           # Prototype v1 (archived)
└── docs/              # UX & architecture docs
```

---

## Backlog Items

### Priority: HIGH

Fitur-fitur yang wajib diimplementasikan untuk production-ready.

---

#### [HIGH-001] Authentication & Authorization

**Deskripsi:**
Sistem login untuk admin console dengan role-based access control.

**Scope:**
- Login page dengan email/password
- Session management (JWT atau session-based)
- Role: `admin` (full access), `operator` (limited)
- Protected routes untuk `/admin/*`
- Logout functionality

**Acceptance Criteria:**
- [ ] User tidak bisa akses `/admin` tanpa login
- [ ] Redirect ke `/login` saat unauthorized
- [ ] Admin bisa logout
- [ ] Role operator tidak bisa delete workspace

**Estimasi:** 3-4 hari

---

#### [HIGH-002] Transaksi Lengkap & Export

**Deskripsi:**
Halaman riwayat transaksi dengan filter, search, dan kemampuan export.

**Scope:**
- Halaman `/admin/transactions` dengan data table
- Filter: date range, status (paid/pending/cancelled), workspace, bank
- Search: booking code, workspace name
- Pagination atau infinite scroll
- Export: CSV, PDF

**Acceptance Criteria:**
- [ ] List transaksi dengan pagination
- [ ] Filter berfungsi (date, status, workspace)
- [ ] Search by booking code
- [ ] Export CSV dengan semua field
- [ ] Export PDF untuk invoice individual

**Estimasi:** 2-3 hari

---

#### [HIGH-003] Manajemen User Admin

**Deskripsi:**
CRUD untuk user staff admin dengan role differentiation.

**Scope:**
- Halaman `/admin/users`
- Create/Edit/Delete user
- Role assignment (admin/operator)
- Password reset functionality
- Activity status (last login)

**Acceptance Criteria:**
- [ ] List semua user dengan role
- [ ] Tambah user baru
- [ ] Edit role user
- [ ] Delete user (soft delete)
- [ ] Admin tidak bisa delete dirinya sendiri

**Estimasi:** 2-3 hari

---

#### [HIGH-004] QR Code Generator

**Deskripsi:**
Tool untuk generate dan download QR code printable untuk ditempel di meja/ruangan.

**Scope:**
- Generate QR image per workspace
- QR berisi URL: `{origin}/w/{workspaceCode}`
- Multiple sizes (small, medium, large)
- Printable format (PDF atau langsung print)
- Batch generate semua workspace

**Acceptance Criteria:**
- [ ] Generate QR untuk single workspace
- [ ] Download sebagai PNG/SVG
- [ ] Generate printable PDF dengan multiple QR
- [ ] Preview sebelum generate

**Estimasi:** 1-2 hari

---

#### [HIGH-005] Form Validation Enhancement

**Deskripsi:**
Implementasi React Hook Form + Zod untuk validasi form yang lebih robust.

**Scope:**
- Centralized validation schemas
- Inline error messages
- Real-time validation
- Error summary untuk form panjang

**Acceptance Criteria:**
- [ ] Semua form menggunakan React Hook Form
- [ ] Inline error messages yang informatif
- [ ] Submit button disabled saat invalid
- [ ] Zod schemas untuk: Workspace, Locker, User

**Estimasi:** 1-2 hari

---

### Priority: MEDIUM

Fitur yang meningkatkan UX dan operational efficiency.

---

#### [MEDIUM-001] Dashboard Analytics

**Deskripsi:**
Halaman analytics dengan grafik revenue dan occupancy.

**Scope:**
- Revenue chart (daily/weekly/monthly)
- Occupancy rate per workspace
- Popular time slots
- Average transaction value
- Top performing workspaces

**Acceptance Criteria:**
- [ ] Line chart untuk revenue trend
- [ ] Bar chart untuk occupancy
- [ ] Date range selector
- [ ] Responsive charts

**Estimasi:** 2-3 hari

---

#### [MEDIUM-002] Reservation System

**Deskripsi:**
Fitur booking ahead untuk workspace tertentu.

**Scope:**
- Calendar view untuk availability
- Reserve workspace untuk tanggal tertentu
- Confirmation email/SMS (optional)
- Reminder sebelum start time

**Acceptance Criteria:**
- [ ] Calendar view dengan availability
- [ ] Create reservation
- [ ] Cancel reservation
- [ ] Conflict detection

**Estimasi:** 4-5 hari

---

#### [MEDIUM-003] Locker Integration

**Deskripsi:**
Hubungkan locker dengan transaksi aktif.

**Scope:**
- Assign locker saat checkout
- Link locker ke payment/booking
- Locker release saat booking expire
- Locker history per transaction

**Acceptance Criteria:**
- [ ] Assign locker saat payment succeed
- [ ] View locker di e-ticket
- [ ] Auto-release saat expired
- [ ] Locker history log

**Estimasi:** 2-3 hari

---

#### [MEDIUM-004] Audit Log

**Deskripsi:**
Log untuk semua perubahan sistem.

**Scope:**
- Track: create, update, delete actions
- Include: user, timestamp, before/after values
- Filterable by action type, user, date
- Retention policy

**Acceptance Criteria:**
- [ ] Log semua admin actions
- [ ] View log di `/admin/audit`
- [ ] Filter by action type
- [ ] Immutable log (append-only)

**Estimasi:** 2-3 hari

---

#### [MEDIUM-005] Notification System

**Deskripsi:**
Sistem notifikasi untuk aktivitas penting.

**Scope:**
- Toast notifications untuk actions
- In-app notification center
- Notification types: info, success, warning, error
- Mark as read functionality

**Acceptance Criteria:**
- [ ] Toast untuk semua actions
- [ ] Bell icon dengan unread count
- [ ] Notification list
- [ ] Mark all as read

**Estimasi:** 1-2 hari

---

### Priority: LOW

Enhancement dan nice-to-have features.

---

#### [LOW-001] Dark Mode

**Deskripsi:**
Toggle dark mode untuk admin interface.

**Scope:**
- Theme toggle di settings
- Persist preference
- System preference detection

**Estimasi:** 0.5 hari

---

#### [LOW-002] Multi-Venue Support

**Deskripsi:**
Kemampuan mengelola beberapa lokasi coworking.

**Scope:**
- Venue selector di admin
- Workspace per venue
- Venue-specific settings
- Cross-venue analytics

**Estimasi:** 3-4 hari

---

#### [LOW-003] Customer Receipt Delivery

**Deskripsi:**
Kirim struk via email/SMS setelah pembayaran.

**Scope:**
- Input email/phone saat checkout
- Email template dengan e-ticket
- SMS notification (optional)
- Delivery status tracking

**Estimasi:** 2-3 hari

---

#### [LOW-004] Customer Support Integration

**Deskripsi:**
Chat atau helpdesk untuk customer.

**Scope:**
- WhatsApp integration
- Live chat widget
- FAQ page
- Support ticket system

**Estimasi:** 2-3 hari

---

#### [LOW-005] Device Preview Tool

**Deskripsi:**
Dev tool untuk preview di berbagai device sizes.

**Scope:**
- Responsive testing view
- Preset devices (iPhone, Android, Tablet)
- Screenshot functionality
- Rotate orientation

**Estimasi:** 1 hari

---

## Technical Improvements

### Infrastructure

| Item | Priority | Estimasi | Notes |
|------|----------|----------|-------|
| React Query / SWR | HIGH | 1 hari | Replace manual fetch dengan caching |
| Zustand state management | MEDIUM | 1 hari | Global state untuk user, settings |
| Error Boundary | MEDIUM | 0.5 hari | Graceful error handling |
| AbortController for requests | LOW | 0.5 hari | Cancel stale requests |

### Performance

| Item | Priority | Estimasi | Notes |
|------|----------|----------|-------|
| Route lazy loading | MEDIUM | 0.5 hari | Code splitting |
| Virtual list untuk data panjang | MEDIUM | 1 hari | Transaction list |
| Image optimization | LOW | 0.5 hari | QR code images |

### Testing

| Item | Priority | Estimasi | Notes |
|------|----------|----------|-------|
| Unit tests (Vitest) | MEDIUM | 2-3 hari | Core functions, components |
| E2E tests (Playwright) | MEDIUM | 3-4 hari | Critical flows |
| Storybook components | LOW | 2-3 hari | Component documentation |

---

## Quick Wins

Fitur yang bisa diimplementasi dalam < 1 hari:

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Confirmation modal untuk delete | 1-2 jam | Prevent accidental delete |
| 2 | Search filter di workspace list | 2-3 jam | Faster navigation |
| 3 | Keyboard shortcuts untuk admin | 2-3 jam | Better UX power user |
| 4 | Toast notification untuk auto-update | 1-2 jam | Better feedback |
| 5 | Empty state illustrations | 2-3 jam | Better UX |

---

## Release Planning

### v1.1 (Sprint 1) - Foundation
- [HIGH-001] Authentication & Authorization
- [HIGH-005] Form Validation Enhancement
- Quick Wins items

### v1.2 (Sprint 2) - Operations
- [HIGH-002] Transaksi Lengkap & Export
- [HIGH-004] QR Code Generator
- [MEDIUM-005] Notification System

### v1.3 (Sprint 3) - Management
- [HIGH-003] Manajemen User Admin
- [MEDIUM-004] Audit Log
- [MEDIUM-003] Locker Integration

### v1.4 (Sprint 4) - Analytics
- [MEDIUM-001] Dashboard Analytics
- [MEDIUM-002] Reservation System (partial)

### Future (v2.0)
- [LOW-002] Multi-Venue Support
- [LOW-003] Customer Receipt Delivery
- [LOW-004] Customer Support Integration

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-09-05 | 0.1 | Initial backlog draft |

---

*Document status: Draft - perlu di-review oleh stakeholder sebelum implementasi*
