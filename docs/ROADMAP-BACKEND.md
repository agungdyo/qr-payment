# QR Payment — Backend Roadmap

> Backlog & status untuk backend service QR Payment (walk-in coworking payment via MAJA billing gateway).
> Stack: **Rust · Axum · SQLx · PostgreSQL · Keycloak OIDC · MAJA H2H**.
> Berlokasi di root `qr-payment/` (sejajar `frontend/`). Status: Draft.

---

## Overview

| Aspek | Detail |
| :--- | :--- |
| Lokasi | Root `qr-payment/` (Cargo.toml, `src/`, `migrations/`, `docker-compose.yml`, `keycloak/`) |
| Auth | Keycloak OIDC — authorization code + PKCE, session server-side di Postgres (`tower-sessions`) |
| Login restricted | Hanya role realm **`admin`** dan **`operator`** (selain itu → 403 di `/auth/callback`) |
| Proteksi | Semua `/api/v1/admin/*` wajib session + role `admin`/`operator` (extractor `AuthAdmin`) |
| Logout | RP-initiated logout ke `end_session_endpoint` Keycloak (`id_token_hint` + `post_logout_redirect_uri`) |
| Pembayaran | MAJA H2H v2.2: token ROPG, `register` (VA), `inquiry`, `cancel`, webhook notification |
| Harga | Server-side: tier/hourly → subtotal + PPN 11% + VA admin fee **Rp 3.500** |

---

## Status ringkasan

- ✅ **Backend inti (BE-001 … BE-008) sudah diimplementasikan** — kompilasi lolos (`cargo check`), unit test pricing 3/3.
- ⏳ **Backlog belum dikerjakan** — BE-009 … BE-018 (fitur produksi lanjutan).
- ⏳ **Frontend integration patch belum dikerjakan** — FE-AUTH-1 … 4 (agar proteksi `/admin` end-to-end).
- ⛔ **Blocker eksternal** — EXT-001 … 003 butuh aksi tim MAJA; EXT-004 hardening produksi.

---

## Implemented (sudah ada)

### BE-001 — Scaffold & infra
- [x] `Cargo.toml`, `src/` (axum 0.8, sqlx 0.8, openidconnect 4.0, tower-sessions 0.14)
- [x] `docker-compose.yml`: PostgreSQL 16 (`:5433`), Keycloak 26 (`:8082`), pgAdmin (`:5052`) — port non-konflik dengan stack lain
- [x] `keycloak/realm-export.json` + `pgadmin/servers.json`

### BE-002 — Realm Keycloak `qr-payment`
- [x] Role realm: `admin`, `operator`; `registrationAllowed: false`
- [x] Client confidential `qr-payment` (PKCE S256, redirect `{BASE_URL}/auth/callback`, `post.logout.redirect.uris` → frontend)
- [x] Demo user: `admin/admin123`, `operator/operator123`, `customer/customer123` (customer **ditolak login**)

### BE-003 — Auth (Keycloak OIDC)
- [x] `GET /auth/login` — authorize URL + PKCE/state/nonce
- [x] `GET /auth/callback` — validasi state/nonce, exchange code, **role check `admin`|`operator`** → selain itu 403
- [x] `GET /auth/me` — `{authenticated, user, roles}` (probe guard frontend)
- [x] `GET /auth/logout` — flush session + end_session Keycloak (RP-initiated)
- [x] Extractor `AuthAdmin` → 401 tanpa session, 403 tanpa role

### BE-004 — Database (SQLx migrations)
- [x] `0001_init.sql`: `workspaces`, `workspace_tiers`, `lockers`, `settings` (single-row), `bookings` (= MAJA invoice number), `payments`, `payment_events` (audit), unique index idempotensi `uq_payments_paid_invoice`
- [x] `0002_seed.sql`: demo workspace (meja-01, meja-12, ruang-01) + tiers + locker

### BE-005 — Public API + pricing
- [x] `GET /api/v1/workspaces`, `GET /workspaces/{code}`, `GET /workspaces/{code}/open-payment` (resume VA)
- [x] `POST /payments/initiate` (pricing server-side, resume open VA, rollback saat register gagal)
- [x] `GET /payments/{id}`, `POST /payments/{id}/inquiry`, `POST /payments/{id}/cancel`
- [x] `GET /public/settings` (Wi-Fi disembunyikan saat `showWifiToCustomer=false`)
- [x] `pricing.rs` + unit test (tier match, hourly fallback, invalid input)

### BE-006 — Client MAJA + webhook
- [x] `maja.rs`: token ROPG (cache 5 menit), `register`, `inquiry`, `cancel` (idempotent "sudah dibatalkan" = sukses)
- [x] `webhook.rs`: `POST /api/v1/payments/callback` — cocokkan invoice, idempoten, partial payment tetap `issued`, `code=00` → paid + booking confirmed
- [x] Kredensial kosong → 503 jelas (bukan mock diam-diam)

### BE-007 — Admin API + guard
- [x] `GET /admin/stats`, CRUD `/admin/workspaces`, CRUD `/admin/lockers`, GET/PUT `/admin/settings`, `GET /admin/payments?limit=`

### BE-008 — Cron jobs
- [x] `expire-pending-payments` (1 mnt, grace 5 mnt) — cancel MAJA best-effort + release slot
- [x] `reconcile-open-vas` (1 jam) — inquiry healing webhook hilang
- [x] `complete-sessions` (5 mnt) — `confirmed` + `end_at` lewat → `completed`

---

## Backlog — Backend (belum dikerjakan)

### Priority HIGH

#### [BE-009] Transaksi: filter, search, pagination
- [ ] `GET /admin/payments` dengan filter date range / status / workspace / bank + search booking code
- [ ] Pagination (cursor atau offset)
- **Memenuhi:** HIGH-002 (frontend roadmap)

#### [BE-010] Export transaksi
- [ ] Export CSV (semua field) + PDF invoice per transaksi
- [ ] Endpoint `GET /admin/payments/export` (CSV) atau generate server-side
- **Memenuhi:** HIGH-002

#### [BE-011] Manajemen user (Keycloak Admin API proxy)
- [ ] Proxy Keycloak Admin REST: list user, create, assign role, reset password, disable (soft delete), last login
- [ ] Akses **admin only**; admin tidak bisa disable dirinya sendiri
- **Memenuhi:** HIGH-003

#### [BE-012] QR Code generation
- [ ] Endpoint QR PNG/SVG per workspace + PDF batch (atau keputusan: generate di frontend)
- **Memenuhi:** HIGH-004

### Priority MEDIUM

#### [BE-013] Dashboard analytics
- [ ] Revenue daily/weekly/monthly, occupancy rate, top workspace, avg transaction value
- **Memenuhi:** MEDIUM-001

#### [BE-014] Reservation & availability
- [ ] Endpoint availability + conflict detection per workspace/waktu
- **Memenuhi:** MEDIUM-002

#### [BE-015] Locker integration
- [ ] Assign locker saat payment `paid`, auto-release saat expire, history per transaksi
- **Memenuhi:** MEDIUM-003

#### [BE-016] Audit log aksi admin
- [ ] Tabel audit untuk create/update/delete workspace/locker/settings/user (append-only) + `GET /admin/audit`
- **Memenuhi:** MEDIUM-004

### Priority LOW

#### [BE-017] Receipt delivery
- [ ] Simpan email/phone customer saat `initiate` + kirim e-ticket via email (SMTP)
- **Memenuhi:** LOW-003

#### [BE-018] Multi-venue
- [ ] Normalisasi `settings` → tabel `venues` + relasi workspace per venue
- **Memenuhi:** LOW-002

---

## Backlog — Frontend integration (wajib agar HIGH-001 end-to-end)

| ID | Item | Status |
| :--- | :--- | :--- |
| FE-AUTH-1 | `client.ts` kirim cookie (`credentials: 'include'`) | [ ] |
| FE-AUTH-2 | Guard route `/admin` → cek `/auth/me` → 401 → redirect `/auth/login` | [ ] |
| FE-AUTH-3 | Tombol Logout di AdminLayout → `/auth/logout` | [ ] |
| FE-AUTH-4 | Role-based UI (operator tidak bisa hapus/destroy — sembunyikan aksi delete) | [ ] |

---

## Dependensi eksternal (blocker — butuh tim MAJA)

| ID | Item | Notes |
| :--- | :--- | :--- |
| EXT-001 | Kredensial H2H MAJA (username/password + client id/secret) | Isi `MAJA_*` di `.env`; dev bisa pakai `billing-dev.maja.id` |
| EXT-002 | Registrasi callback URL webhook + **allow-list IP** server | Spesifikasi mensyaratkan whitelist IP |
| EXT-003 | Konfirmasi endpoint `update` (v2.3) | Fallback saat ini: cancel + register ulang |
| EXT-004 | Hardening produksi | `SESSION_SECURE=true` + HTTPS, secret non-dev, alerting antrian *payment-without-active-booking* |

---

## Cara menjalankan (dev)

```bash
# 1. Infra (Postgres 5433, Keycloak 8082, pgAdmin 5052)
cd qr-payment && docker compose up -d

# 2. Backend
cp .env.example .env        # isi MAJA_* bila sudah punya kredensial
cargo run                   # http://localhost:3000

# 3. Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Login admin: `admin/admin123` · operator: `operator123` · Keycloak console: `http://localhost:8082` (admin/admin).

---

## Endpoint map

| Method | Path | Auth |
| :--- | :--- | :--- |
| GET | `/api/health` | — |
| GET | `/auth/login`, `/auth/callback`, `/auth/me`, `/auth/logout` | — |
| GET | `/api/v1/workspaces` · `/workspaces/{code}` · `/workspaces/{code}/open-payment` | — |
| POST | `/api/v1/payments/initiate` · `/payments/{id}/inquiry` · `/payments/{id}/cancel` | — |
| GET | `/api/v1/payments/{id}` · `/public/settings` | — |
| POST | `/api/v1/payments/callback` (webhook MAJA) | MAJA |
| GET/POST | `/api/v1/admin/workspaces` · PUT `/{code}` | Admin/Operator |
| GET/POST | `/api/v1/admin/lockers` · PUT/DELETE `/{id}` | Admin/Operator |
| GET/PUT | `/api/v1/admin/settings` · GET `/admin/stats` · GET `/admin/payments` | Admin/Operator |

---

## Testing & QA

- [x] Unit test pricing (`cargo test`)
- [ ] E2E auth: login admin → akses `/admin/*`; login customer → 403
- [ ] E2E payment: initiate (real MAJA) → bayar VA → webhook → booking confirmed
- [ ] Webhook idempotency: kirim notifikasi duplikat → no-op 200
- [ ] Cron: expire/reconcile/complete dengan data sintetis

---

## Changelog

| Date | Version | Changes |
| :--- | :--- | :--- |
| 2026-09-05 | 0.1 | Initial draft — assessment + implementasi backend inti (BE-001..BE-008) |

---

*Document status: Draft - perlu direview stakeholder sebelum implementasi fase berikutnya.*