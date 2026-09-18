# PRD Detail — User Stories & Acceptance Criteria
# QR-Payment v1.0

Dokumen ini berisi spesifikasi detail setiap feature module, termasuk user stories, acceptance criteria, dan edge cases. Baseline untuk semua reference adalah `PRD1.md`.

---

## Module F1: Authentication & Session Management

### Overview
Admin console dilindungi oleh Keycloak OIDC. User harus memiliki role "admin" di Keycloak realm "maja" untuk bisa mengakses fitur admin.

---

### User Story F1.1: Initiate OIDC Login

> **As a** unauthenticated admin user,
> **I want to** initiate the login process via Keycloak OIDC,
> **So that** I can securely authenticate with my venue credentials.

#### Acceptance Criteria (AC):
- **AC 1**: Clicking "Buka dashboard admin" triggers `GET /auth/me` to check session.
- **AC 2**: If session is invalid/expired, redirect to `GET /auth/login`.
- **AC 3**: Backend generates OIDC authorization URL with:
  - PKCE Code Challenge (SHA-256)
  - CSRF State Token (32+ bytes random)
  - Nonce (replay attack prevention)
- **AC 4**: CSRF state, nonce, and PKCE verifier are stored in session.
- **AC 5**: Browser redirects to Keycloak authorization endpoint.

---

### User Story F1.2: Handle OIDC Callback

> **As a** system,
> **I want to** process the authorization code from Keycloak,
> **So that** authenticated admins can access the system.

#### Acceptance Criteria (AC):
- **AC 1**: `GET /auth/callback` receives `code` and `state` query parameters.
- **AC 2**: Server validates state parameter against stored CSRF (constant-time comparison).
- **AC 3**: If state mismatch → log warning, redirect to `/?error=login_failed`.
- **AC 4**: Server exchanges authorization code for tokens using PKCE verifier.
- **AC 5**: Server verifies ID token signature and claims (issuer, audience, nonce).
- **AC 6**: Server extracts roles from JWT payload: `resource_access.{client_id}.roles`.
- **AC 7**: If "admin" role is missing → flush session, redirect to Keycloak logout with post_logout_redirect_uri.
- **AC 8**: If role is valid → upsert user in database, save session with user_id, redirect to `/admin`.

---

### User Story F1.3: Session Probe (Auth Guard)

> **As a** frontend AuthGuard component,
> **I want to** verify current session status,
> **So that** I can protect admin routes appropriately.

#### Acceptance Criteria (AC):
- **AC 1**: `GET /auth/me` returns `{ authenticated: true, user: {id, username, name, email} }` if valid session exists.
- **AC 2**: Returns `{ authenticated: false }` if no valid session.
- **AC 3**: Frontend shows loading spinner during auth check.
- **AC 4**: Unauthenticated access to `/admin/*` redirects to `/login` (which redirects to Keycloak).
- **AC 5**: Display logged-in admin name in header.

---

### User Story F1.4: Admin Logout

> **As an** authenticated admin,
> **I want to** log out completely,
> **So that** my session is terminated and I return to customer page.

#### Acceptance Criteria (AC):
- **AC 1**: Clicking "Logout" calls `GET /auth/logout`.
- **AC 2**: Backend retrieves `id_token_hint` from session.
- **AC 3**: Backend flushes session data from database.
- **AC 4**: Backend redirects to Keycloak logout endpoint with `id_token_hint` and `post_logout_redirect_uri`.
- **AC 5**: User ends up on customer homepage.

#### Edge Cases & Error States:

| Error | Handling |
|---|---|
| Keycloak unreachable | Show error toast, retry button |
| Invalid state parameter | Redirect to `/?error=login_failed` |
| User cancelled login | Keycloak redirects with `error=access_denied`, treated as cancelled |
| Concurrent login attempt | Keycloak returns `error=already_logged_in`, redirect to retry |
| Token exchange failure | Redirect to `/?error=login_failed` with explanation |

---

## Module F2: Customer Payment Flow

### Overview
Customer flow adalah inti dari sistem: scan QR → pilih durasi → bayar VA → dapat e-ticket. State machine dikelola via `paymentMachine.ts` di frontend.

### State Machine Phases

```
choice → scheduleType → datePicker → select → registering → va → paid
                                              ↓
                                        expired / cancelled
```

---

### User Story F2.1: QR Code Resolution

> **As a** customer,
> **I want to** scan a QR code on a workspace and see its details,
> **So that** I know which desk/room I'm booking.

#### Acceptance Criteria (AC):
- **AC 1**: QR code encodes URL: `{APP_URL}/w/{workspaceCode}` (e.g., `/w/meja-12`).
- **AC 2**: Page loads workspace via `GET /api/v1/workspaces/:code`.
- **AC 3**: Display: workspace name, type icon (desk/room), venue name, location, capacity.
- **AC 4**: If workspace not found or `isActive: false` → show error "Kode tidak dikenali".
- **AC 5**: If network error → show "Memuat ruangan..." then error with retry.

#### Error States:
1. **Workspace not found**: "Kode tidak dikenali" message + QR code shown in error display.
2. **Workspace inactive**: Same error, explaining workspace is disabled by admin.

---

### User Story F2.2: User Choice Selection

> **As a** customer,
> **I want to** choose between "Pesan Meja" and "Pesan Makan",
> **So that** I can access the appropriate booking flow.

#### Acceptance Criteria (AC):
- **AC 1**: After workspace loads, show choice screen with two large buttons.
- **AC 2**: "Pesan Meja" button → proceed to schedule type selection.
- **AC 3**: "Pesan Makan" button → show toast "Fitur pesan makan segera hadir!" (placeholder).
- **AC 4**: Visual design: blue icon for Meja, amber icon for Makan.

---

### User Story F2.3: Schedule Type Selection

> **As a** customer selecting "Pesan Meja",
> **I want to** choose when I want to use the workspace,
> **So that** I can book for today or a future date.

#### Acceptance Criteria (AC):
- **AC 1**: Show two options: "Pesan Hari Ini" (green icon) and "Pesan Hari Lain" (purple icon).
- **AC 2**: "Pesan Hari Ini" → set `bookingDate = null`, proceed to duration selection.
- **AC 3**: "Pesan Hari Lain" → show date picker.
- **AC 4**: Calendar restricts selection to today and future dates only.

---

### User Story F2.4: Date Picker

> **As a** customer,
> **I want to** select a specific date for my booking,
> **So that** I can reserve for a future date.

#### Acceptance Criteria (AC):
- **AC 1**: Calendar UI with current month visible.
- **AC 2**: Navigate to previous months disabled.
- **AC 3**: Past dates are visually disabled and not selectable.
- **AC 4**: On date selection → proceed to duration selection.
- **AC 5**: Selected date stored in format ISO string (YYYY-MM-DD).

---

### User Story F2.5: Duration Selection

> **As a** customer,
> **I want to** select how long I want to rent the workspace,
> **So that** I see the correct price.

#### Acceptance Criteria (AC):
- **AC 1**: Display tier chips based on workspace's configured durations.
- **AC 2**: Tier chips highlight when selected (e.g., 1j, 3j, 8j, Harian).
- **AC 3**: "Durasi lain" section with +/- buttons for custom hours.
- **AC 4**: Minimum: 1 hour, Maximum: 24 hours.
- **AC 5**: If no tier for selected duration → show warning "Tidak ada paket X jam — harga dihitung dari tarif per jam".
- **AC 6**: Default selection: first tier duration from workspace config.

#### Price Calculation:
```
Subtotal = tier.price (if exact match) OR (workspace.hourlyRate × hours)
PPN 11%  = Subtotal × 0.11
Admin VA = Rp 3.500 (flat)
Total    = Subtotal + PPN + Admin VA
```

---

### User Story F2.6: Bank Selection

> **As a** customer,
> **I want to** choose my preferred bank for the Virtual Account,
> **So that** I can pay using my bank's mobile app or ATM.

#### Acceptance Criteria (AC):
- **AC 1**: Display grid of bank options with icons.
- **AC 2**: Supported banks: BCA, Mandiri, BNI, BRI, CIMB, Danamon, Permata, BII, Hana, BSI.
- **AC 3**: Single selection (toggle behavior).
- **AC 4**: Selected bank visually highlighted.
- **AC 5**: Bank list sourced from `lib/banks.ts` (shared config).

---

### User Story F2.7: Initiate VA Registration

> **As a** customer,
> **I want to** create a Virtual Account so I can pay,
> **So that** I receive a payable VA number.

#### Acceptance Criteria (AC):
- **AC 1**: "Bayar Rp XXX.XXX" button disabled until bank selected.
- **AC 2**: On click → loading state "Membuat Virtual Account...".
- **AC 3**: Backend creates booking + calls MAJA `register`.
- **AC 4**: Success → transition to VA screen with payment details.
- **AC 5**: Failure → show error with retry button.

#### Backend Flow:
```
1. Create booking record (status: pending)
2. Call MAJA POST /api/v2/bill/register
   - invoice_number = booking.code
   - amount = computed total
   - payment_method = bank_code
   - customer_email = walkin@qr-payment.local
   - inactive_date = now + 24 hours
3. Store VA, MAJA invoice ID, inactive_date
4. Return PaymentDto to frontend
```

---

### User Story F2.8: Resume Open Payment

> **As a** returning customer,
> **I want to** resume my previous unpaid payment if it hasn't expired,
> **So that** I don't lose my progress when re-scanning the QR.

#### Acceptance Criteria (AC):
- **AC 1**: On page load, call `GET /api/v1/workspaces/:code/open-payment`.
- **AC 2**: Backend returns open payment (status: 'issued', not expired).
- **AC 3**: Frontend transitions directly to VA screen with existing payment.
- **AC 4**: If no open payment → start fresh from choice screen.

---

### User Story F2.9: VA Display & Payment Instructions

> **As a** customer,
> **I want to** see my VA number and clear payment instructions,
> **So that** I know exactly how to complete the transfer.

#### Acceptance Criteria (AC):
- **AC 1**: VA number displayed in prominent box (large, monospace font).
- **AC 2**: "Salin" button copies VA number to clipboard with toast confirmation.
- **AC 3**: Countdown timer showing time remaining until VA expires.
- **AC 4**: If remaining time < 5 minutes → urgent red warning styling.
- **AC 5**: Step-by-step instructions for the selected bank.
- **AC 6**: Payment amount shown prominently: "Bayar tepat Rp XXX.XXX".

---

### User Story F2.10: Payment Status Polling

> **As a** customer,
> **I want to** see my payment status update automatically,
> **So that** I know immediately when my transfer is confirmed.

#### Acceptance Criteria (AC):
- **AC 1**: While on VA screen, poll `GET /api/v1/payments/:id` every 3 seconds.
- **AC 2**: If `status === 'paid'` → transition to success screen.
- **AC 3**: If `status === 'cancelled'` → show cancelled message.
- **AC 4**: If polling fails → silently retry on next interval (no user-visible error).

---

### User Story F2.11: Manual Payment Check

> **As a** customer who just transferred,
> **I want to** manually check if my payment was received,
> **So that** I don't have to wait for automatic polling.

#### Acceptance Criteria (AC):
- **AC 1**: "Saya sudah bayar" button available on VA screen.
- **AC 2**: On click → call `POST /api/v1/payments/:id/inquiry` (MAJA inquiry).
- **AC 3**: Loading state while inquiry in progress.
- **AC 4**: If paid → transition to success screen.
- **AC 5**: If not yet received → info toast "Pembayaran belum kami terima. Cek kembali nomor VA dan nominalnya."

---

### User Story F2.12: VA Expiry

> **As a** customer with an expired VA,
> **I want to** understand my options,
> **So that** I can retry or cancel.

#### Acceptance Criteria (AC):
- **AC 1**: When `now > inactiveDate` → transition to 'expired' state.
- **AC 2**: Show "Virtual Account kedaluwarsa" message.
- **AC 3**: "Buat VA baru" button → re-register with same duration/bank.
- **AC 4**: "Batalkan pesanan" button → cancel the booking.
- **AC 5**: Backend calls MAJA `cancel` for expired VA (best-effort cleanup).

---

### User Story F2.13: Payment Cancellation

> **As a** customer,
> **I want to** cancel my booking if I change my mind,
> **So that** the slot is released for other customers.

#### Acceptance Criteria (AC):
- **AC 1**: "Batalkan pesanan" link on VA and expired screens.
- **AC 2**: On click → confirmation not required (simple action).
- **AC 3**: Backend calls `POST /api/v1/payments/:id/cancel`.
- **AC 4**: Backend calls MAJA `cancel` (idempotent).
- **AC 5**: Show cancelled confirmation with booking code.
- **AC 6**: "Mulai dari awal" button returns to choice screen.

---

### User Story F2.14: E-Ticket & WiFi Display

> **As a** paid customer,
> **I want to** receive my e-ticket with check-in details and WiFi,
> **So that** I can start working immediately.

#### Acceptance Criteria (AC):
- **AC 1**: Green checkmark icon + "Pembayaran berhasil" headline.
- **AC 2**: Check-in code (booking code converted to 6-digit format with spaces).
- **AC 3**: E-ticket details: Booking code, workspace name, hours, total paid, bank, paid datetime.
- **AC 4**: If `showWifiToCustomer: true` → display WiFi SSID and password in styled box.
- **AC 5**: "Salin struk" button copies formatted receipt to clipboard.
- **AC 6**: "Selesai" button navigates to homepage.

#### Edge Cases & Error States:

| Scenario | Handling |
|---|---|
| MAJA unavailable during registration | Show error: "Layanan pembayaran sedang maintenance. Coba beberapa menit lagi." |
| Webhook lost | Reconcile job heals within 30-60 minutes; customer can use "Saya sudah bayar" button |
| Partial payment | If `remainingAmount > 0` → keep in 'issued', show info toast |
| Amount mismatch | Store discrepancy flag, alert admin |
| Double scan while VA open | Resume existing payment (F2.8) |

---

## Module F3: Admin Dashboard

### User Story F3.1: View Dashboard Overview

> **As an** admin,
> **I want to** see key metrics at a glance,
> **So that** I understand the current venue state.

#### Acceptance Criteria (AC):
- **AC 1**: Four stat cards displayed in responsive grid:
  - Meja/Ruangan: total count + active count
  - Loker: total count + available count
  - Transaksi lunas: total paid transaction count
  - Menunggu bayar: count of issued (unpaid) VAs
- **AC 2**: Recent transactions list (last 8) below stats.
- **AC 3**: Each transaction shows: workspace, booking code, bank, datetime, status badge, amount.
- **AC 4**: Status badges: "Menunggu" (amber), "Lunas" (green), "Dibatalkan" (gray), "Gagal" (red).
- **AC 5**: Clicking transaction row (future: expand to details).

---

## Module F4: Workspace Management

### User Story F4.1: List Workspaces

> **As an** admin,
> **I want to** view all workspaces with their status,
> **So that** I can manage them easily.

#### Acceptance Criteria (AC):
- **AC 1**: List view with cards for each workspace.
- **AC 2**: Display: icon (desk/room), name, code, location, type badge.
- **AC 3**: Pricing summary: hourly rate + tier packages.
- **AC 4**: Active status badge (green "Aktif" / gray "Nonaktif").
- **AC 5**: Quick actions per row:
  - "Salin QR": copy payment URL
  - "Edit": navigate to form
  - Toggle switch: activate/deactivate

---

### User Story F4.2: Create Workspace

> **As an** admin,
> **I want to** add a new workspace,
> **So that** customers can book it.

#### Acceptance Criteria (AC):
- **AC 1**: Navigate to `/admin/workspaces/new`.
- **AC 2**: Form fields:
  - Kode: lowercase letters, numbers, hyphens only (regex: `^[a-z0-9][a-z0-9-]{1,38}$`)
  - Nama: required, display name
  - Tipe: dropdown (desk/room)
  - Lokasi: optional text
  - Kapasitas: number ≥ 1
  - Deskripsi: optional textarea
  - isActive: toggle (default: true)
- **AC 3**: Pricing section:
  - Hourly rate (fallback for non-tier durations)
  - List of duration tiers (add/remove)
- **AC 4**: Validation errors shown inline.
- **AC 5**: On save → `POST /api/v1/admin/workspaces` → redirect to list with success toast.

#### Tier Management:
```
- "Tambah paket durasi" button adds new row
- Each row: duration hours input + price input
- Trash icon removes tier
- Duplicate durations not allowed
```

---

### User Story F4.3: Edit Workspace

> **As an** admin,
> **I want to** modify an existing workspace,
> **So that** I can update its details or pricing.

#### Acceptance Criteria (AC):
- **AC 1**: Navigate to `/admin/workspaces/:code`.
- **AC 2**: Code field is read-only (QR identifier cannot change).
- **AC 3**: All other fields pre-populated.
- **AC 4**: On save → `PUT /api/v1/admin/workspaces/:code` → redirect to list.
- **AC 5**: If workspace not found → show error, redirect to list.

---

### User Story F4.4: Toggle Workspace Active Status

> **As an** admin,
> **I want to** activate or deactivate a workspace,
> **So that** I can temporarily hide it without deleting.

#### Acceptance Criteria (AC):
- **AC 1**: Toggle switch on workspace card.
- **AC 2**: Toggling calls `PUT` with updated `isActive`.
- **AC 3**: Deactivated workspaces:
  - Hidden from customer workspace list
  - QR codes return "Kode tidak dikenali"
  - Existing payments still processed
- **AC 4**: Toast confirmation: "{name} diaktifkan/dinonaktifkan".

---

### User Story F4.5: Copy QR Payment URL

> **As an** admin,
> **I want to** copy the customer payment URL for a workspace,
> **So that** I can print QR stickers or share the link.

#### Acceptance Criteria (AC):
- **AC 1**: "Salin QR" button available on workspace card and form.
- **AC 2**: Copies `{origin}/w/{code}` to clipboard.
- **AC 3**: Toast: "Tautan QR disalin" with URL in description.

---

## Module F5: Locker Management

### User Story F5.1: List Lockers

> **As an** admin,
> **I want to** view all storage lockers,
> **So that** I can track availability.

#### Acceptance Criteria (AC):
- **AC 1**: List with locker cards showing:
  - Code (monospace)
  - Location
  - Status badge: "Tersedia" (green) / "Terpakai" (amber)
  - Notes (if any)
- **AC 2**: Summary in header: "{total} loker · {available} tersedia · {occupied} terpakai".

---

### User Story F5.2: Create Locker

> **As an** admin,
> **I want to** add a new locker,
> **So that** customers can use it.

#### Acceptance Criteria (AC):
- **AC 1**: "Tambah loker" button shows inline form.
- **AC 2**: Fields: Kode (required), Lokasi, Status.
- **AC 3**: On save → `POST /api/v1/admin/lockers`.

---

### User Story F5.3: Update Locker

> **As an** admin,
> **I want to** edit locker details,
> **So that** I keep inventory accurate.

#### Acceptance Criteria (AC):
- **AC 1**: "Edit" button shows inline edit form.
- **AC 2**: Fields: Kode, Lokasi, Catatan, Status.
- **AC 3**: "Tandai Tersedia/Terpakai" quick toggle.
- **AC 4**: On save → `PUT /api/v1/admin/lockers/:id`.

---

### User Story F5.4: Delete Locker

> **As an** admin,
> **I want to** remove a locker,
> **So that** it's no longer tracked.

#### Acceptance Criteria (AC):
- **AC 1**: Trash icon button with red styling.
- **AC 2**: Click → `DELETE /api/v1/admin/lockers/:id`.
- **AC 3**: No confirmation dialog (simple delete).
- **AC 4**: List refreshes automatically.

---

## Module F6: Venue Settings

### User Story F6.1: View & Update Venue Settings

> **As an** admin,
> **I want to** manage venue information and WiFi credentials,
> **So that** customers see correct info on e-tickets.

#### Acceptance Criteria (AC):
- **AC 1**: Venue name field (displayed on customer pages and receipts).
- **AC 2**: WiFi SSID and password fields.
- **AC 3**: Password field has show/hide toggle.
- **AC 4**: "Tampilkan Wi-Fi di e-ticket" toggle.
- **AC 5**: Preview section showing how WiFi appears on e-ticket.
- **AC 6**: On save → `PUT /api/v1/admin/settings`.

---

## Module F7: MAJA Billing Gateway Integration

### Overview
Backend integrates with MAJA H2H API for Virtual Account operations.

### MAJA API Endpoints Used

| MAJA Endpoint | Purpose | Called By |
|---|---|---|
| POST /api/v2/bill/register | Create VA | `POST /payments/initiate` |
| POST /api/v2/bill/inquiry | Check payment status | `POST /payments/:id/inquiry`, Reconcile cron |
| POST /api/v2/bill/cancel | Cancel VA | `POST /payments/:id/cancel`, Expiry cron |

---

### User Story F7.1: Register Virtual Account

> **As the** backend system,
> **I want to** call MAJA `register` API,
> **So that** customers receive a payable VA number.

#### Acceptance Criteria (AC):
- **AC 1**: OAuth token obtained via ROPG (client credentials).
- **AC 2**: POST to `{MAJA_BASE_URL}/api/v2/bill/register` with:
  ```json
  {
    "invoice_number": "{booking_code}",
    "amount": {computed_total},
    "payment_method": "{bank_code}",
    "customer_email": "{MAJA_CUSTOMER_EMAIL}",
    "customer_name": "Walk-in Customer",
    "expiry_date": "{inactive_date}"
  }
  ```
- **AC 3**: Success response: `{ va_number, invoice_id, expiry_date }`.
- **AC 4**: Store in payments table: va, maja_invoice_id, inactive_date.
- **AC 5**: If MAJA unavailable → return 503 "Layanan pembayaran sedang maintenance".

---

### User Story F7.2: Process Payment Webhook

> **As the** backend system,
> **I want to** receive and verify MAJA payment notifications,
> **So that** bookings are confirmed instantly.

#### Acceptance Criteria (AC):
- **AC 1**: POST endpoint at `/api/v1/payments/callback`.
- **AC 2**: Verify signature if MAJA provides one.
- **AC 3**: Extract: invoice_number, payment_amount, payment_method, ref.
- **AC 4**: Match to local payment by invoice_number.
- **AC 5**: Idempotency: if already 'paid', return 200 without reprocessing.
- **AC 6**: Update payment: status='paid', paid_at=now, ref, raw_callback.
- **AC 7**: Update booking: status='confirmed'.
- **AC 8**: Store raw_callback JSONB for audit.
- **AC 9**: Return HTTP 200 immediately (don't wait for DB commit).

#### Webhook Payload Expected:
```json
{
  "type": "payment",
  "code": "00",
  "number": "{invoice_number}",
  "amount": {amount},
  "payment_method": "{bank_code}",
  "ref": "{payment_reference}",
  "paid_at": "{timestamp}"
}
```

---

### User Story F7.3: Inquiry Payment Status

> **As the** backend system,
> **I want to** query MAJA for current payment status,
> **So that** customers can manually check or reconcile.

#### Acceptance Criteria (AC):
- **AC 1**: POST to `{MAJA_BASE_URL}/api/v2/bill/inquiry`.
- **AC 2**: If MAJA returns paid status → update local payment + booking.
- **AC 3**: Return current payment status to frontend.

---

### User Story F7.4: Cancel Virtual Account

> **As the** backend system,
> **I want to** call MAJA `cancel` when needed,
> **So that** expired VAs don't accept payments.

#### Acceptance Criteria (AC):
- **AC 1**: POST to `{MAJA_BASE_URL}/api/v2/bill/cancel`.
- **AC 2**: Handle "already cancelled" responses as success (idempotent).
- **AC 3**: Update payment: status='cancelled'.
- **AC 4**: If booking has no other paid payments → cancel booking.

---

### User Story F7.5: Reconcile Orphaned Payments (Cron)

> **As the** backend system,
> **I want to** periodically check for lost webhooks,
> **So that** customers aren't left in limbo.

#### Acceptance Criteria (AC):
- **AC 1**: Job runs hourly (and on-demand).
- **AC 2**: Query: payments WHERE status='issued' AND created_at < (now - 30 minutes).
- **AC 3**: For each → call MAJA inquiry.
- **AC 4**: If paid → update to 'paid', confirm booking.
- **AC 5**: If not found/invalid → cancel the payment.

---

### User Story F7.6: Expire Stale Payments (Cron)

> **As the** backend system,
> **I want to** release slots when VAs expire,
> **So that** inventory is accurate.

#### Acceptance Criteria (AC):
- **AC 1**: Job runs every 1 minute.
- **AC 2**: Query: payments WHERE status='issued' AND inactive_date < (now - 5 minutes grace).
- **AC 3**: For each → call MAJA cancel, update payment to 'cancelled', cancel booking.
- **AC 4**: 5-minute grace period prevents race with slow webhooks.

---

## Appendix: Demo Mode

### Demo Mode Activation
- `VITE_API_BASE_URL` not set, OR
- `VITE_ENABLE_DEMO=true`

### Demo Mode Behavior

| Feature | Demo Behavior |
|---|---|
| API Transport | Mock API layer instead of real HTTP |
| VA Registration | Returns fake VA number |
| Payment Confirmation | No real money; "Demo: Simulasi notifikasi MAJA" button |
| State Persistence | In-memory, shared across users |
| Authentication | Not required |

### Demo Mode Limitations
- No real payment processing
- No actual bank transfers
- Session data not persisted
- Only for: prototyping, UI testing, developer demos

---

## Appendix: Database Schema (Reference)

### Core Tables

```sql
-- Users synced from Keycloak
users (id, keycloak_sub, username, email, name, created_at)

-- Workspace configuration
workspaces (id, code UNIQUE, name, type, location, capacity, description, is_active, hourly_rate, created_at, updated_at)
rate_tiers (id, workspace_code FK, duration_hours, label, price)

-- Single-row venue settings
venue_settings (id, venue_name, wifi_ssid, wifi_password, show_wifi_to_customer, updated_at)

-- Booking lifecycle
bookings (id, code UNIQUE, workspace_code FK, start_at, end_at, status, hold_until, total, created_at, updated_at)

-- Payment lifecycle
payments (id, booking_id FK, status, maja_invoice_id, invoice_number, va, amount, bank_code, ref, inactive_date, paid_at, raw_callback JSONB, created_at, updated_at)

-- Audit trail
payment_events (id, payment_id FK, booking_code, status, actor, note, raw_payload JSONB, created_at)

-- Storage lockers
lockers (id, code, location, status, note, created_at, updated_at)
```

---

*Document Version: 1.0 | Last Updated: September 2024*
