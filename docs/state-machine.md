# State Machine — Booking & Payment (qr-payment)

Two state machines, synchronized through the **payment reference (invoice number)**:

- **Booking** state — the lifecycle of a workspace reservation (slot).
- **Payment** state — the lifecycle of one MAJA invoice/VA.

A booking may have several payment attempts over its lifetime (re-register after expiry, top-up/extension after confirmation). Only the **latest successful payment** matters for the slot; the rest are history for reconciliation.

Status vocabulary intentionally matches the existing `web-booking` codebase (`pending`, `confirmed`, `cancelled`, `completed`) so the design can be ported 1:1.

---

## 1. Booking state machine

```
                         ┌──────────────────────────────────────────────┐
                         │                                              │
              customer   ▼                                              │ cancel/expiry (unpaid)
 [created] ──▶ [pending] ──────────────────────────────────────────────▶ [cancelled]
                 │  │                                                    ▲
                 │  │ register VA (pay click)                            │
                 │  └──────────────▶ (payment flow, sec. 2)              │
                 │                │                                      │
                 │    payment notification code=00 & invoice matched     │
                 ▼                ▼                                      │
            [confirmed] ───────────────────────────────────────────┐    │
                 │                                                  │    │
     check-in/out (phase 2) / end time reached                      │    │
                 ▼                                                  │    │
            [completed]                                     [refunded/manual] (admin, paid)
```

### Canonical states

| State | Meaning | Who sets it |
| :--- | :--- | :--- |
| `created` | Booking row created, not yet payable (optional pre-submit step). | System (API) |
| `pending` | Slot **held** for the customer; waiting for payment. | System on submit |
| `confirmed` | Payment received and matched; slot is guaranteed. | Webhook/inquiry |
| `completed` | Rental session finished (end time passed or operator check-out). | Cron / operator |
| `cancelled` | No longer valid. Unpaid → slot released. Paid → only via admin refund. | Customer/admin/cron |

Optional phase-2 states (not in v1): `in_use` (checked in), `extended`.

---

## 2. Payment state machine

```
                 register success           MAJA notification / inquiry paid
 [draft] ──────▶ [issued] ──────────────────────────────────────▶ [paid]
                 │    │                                               │
                 │    │ cancel() / VA expiry (no payment)             │
                 │    ▼                                               │
                 │  [cancelled]  ◀────────────── register error path  │
                 ▼
  (register failed → booking stays pending, no payment row persisted)
```

| State | Meaning |
| :--- | :--- |
| `draft` | Payment intent created locally before calling MAJA (idempotency guard). |
| `issued` | MAJA `register` succeeded. Store: MAJA `id`, `number`, `va`, `amount`, `paymentMethod`, `inactiveDate`. VA is payable. |
| `paid` | MAJA notification (`type=payment`, `code=00`) or `inquiry` confirms full payment. Booking → `confirmed`. |
| `cancelled` | MAJA `cancel` succeeded (unpaid) or VA expired unpaid. |
| `failed` | `register` returned an error (nothing persisted, or row marked failed for audit). |

**Partial payment**: notification with `remainingAmount > 0` keeps the payment in `issued` and the booking in `pending`; log the event. Full payment is `remainingAmount == 0`.

---

## 3. Transition table (with side effects)

### Booking transitions

| From | To | Trigger | Guard | Side effects |
| :--- | :--- | :--- | :--- | :--- |
| `created` | `pending` | Customer submits (or created directly in `pending`) | Workspace available for window | Lock slot (Redis + DB), set `hold_until` |
| `pending` | `pending` | Price/hours change (resume flow) | No paid payment on booking | `update` MAJA invoice with new amount/items; recompute total server-side |
| `pending` | `confirmed` | Webhook `code=00` / inquiry `paid=true` | Invoice number matches, no prior paid payment (idempotent) | Payment → `paid`; release hold; send e-ticket/receipt; notify venue staff |
| `pending` | `cancelled` | Customer cancels / admin cancels / expiry cron | No paid payment | If open VA exists → MAJA `cancel` (best-effort); release slot |
| `confirmed` | `completed` | End time reached or operator check-out | — | Archive; mark workspace free |
| `confirmed` | `cancelled` | Admin refund | Manual refund completed | Only via admin tooling; log reason; never automatic |
| `pending` | `cancelled` | **Race**: expiry cron fires while webhook is in flight | — | Do **not** auto-cancel until a short grace period after `inactiveDate`; see §5 |

### Payment transitions (driven by MAJA endpoints)

| MAJA call | When | Success → | Failure handling |
| :--- | :--- | :--- | :--- |
| `register` | Customer clicks "Bayar"; page loads with no open payment | `issued` (VA stored) | Keep booking `pending`; allow retry (never auto-retry — show error, let user tap again) |
| payment **notification** | MAJA pushes to callback URL | `paid` + booking `confirmed` | Store raw body; retry queue with backoff; reconcile job is the safety net |
| `inquiry` | "Saya sudah bayar" button; reconcile cron; resume flow | Sync to `paid` if `paid=true` | `paid=false` → stay `issued`/`pending` |
| `update` | Change hours/price while unpaid | Invoice/VA amount updated; booking total recomputed | If update unsupported → `cancel` + `register` with new amount |
| `cancel` | Customer cancels, admin cancels, expiry cron | Payment `cancelled`; booking `cancelled` if no payment | Treat "already cancelled/invalid invoice" responses as success (idempotent) |

---

## 4. Timeouts & scheduled jobs

| Job | Schedule | Rule | Action |
| :--- | :--- | :--- | :--- |
| `expire-pending-payments` | Every 1 min | Payment `issued`, now > `inactiveDate` + grace (5 min) | MAJA `cancel` (best-effort) → payment `cancelled` → booking `cancelled` → release slot |
| `reconcile-open-vas` | Hourly (and on demand) | Payment `issued` older than 30 min, no notification seen | `inquiry` each; if `paid=true` → heal: payment `paid`, booking `confirmed` (webhook was lost); if not found/invalid → cancel |
| `complete-sessions` | Every 5 min | Booking `confirmed` and `end_time` passed | Booking → `completed` |

**Why a grace period:** MAJA marks the invoice paid at its side the moment the bank transfer lands, and the notification can arrive a little later. Cancelling instantly at `inactiveDate` risks cancelling a booking that was actually paid. The grace window plus the `reconcile-open-vas` job covers that race.

---

## 5. Idempotency & edge cases

1. **Duplicate notifications** — MAJA may retry the same callback. Guard: unique index on paid payments per invoice number / MAJA `id`; second delivery is a no-op that still returns HTTP 200.
2. **Payment arrives for a cancelled booking** (expiry/cancel raced a real transfer). Rule: invoice is `paid` at MAJA → do **not** silently ignore. Route to a manual queue `payment-without-active-booking`: operator refunds via MAJA admin or reactivates the booking. Alert on creation.
3. **Amount mismatch** — notification `amount` != expected invoice total (customer over/under-paid). Mark payment `paid` with an `amount_discrepancy` flag; surface in finance dashboard. If `remainingAmount > 0`, stay `issued`.
4. **Double VA for the same booking** — customer re-scans while a payment is `issued` and unexpired: **resume** the existing VA (optionally confirm via `inquiry`) instead of registering a new one. Register again only after the previous one is expired/cancelled.
5. **Register succeeded, response lost** (timeout). The payment row is in `draft` locally and MAJA may already hold the invoice → call `inquiry` by the generated invoice number before deciding to re-register; never create two VAs blindly.
6. **Webhook lost entirely** — healed by `reconcile-open-vas` (§4) and by the customer tapping "Saya sudah bayar" (`inquiry`).
7. **All webhook processing is idempotent and retried** with exponential backoff into a dead-letter queue + alerting for operators.

---

## 6. Data model (delta for booking/payment)

```
bookings
  id, code (unique, = MAJA invoice number), workspace_id, customer_id,
  start_at, end_at, status, hold_until, total, created_at, updated_at

payments
  id, booking_id (FK), status,                -- draft|issued|paid|cancelled|failed
  maja_invoice_id, invoice_number,            -- from register response
  va, payment_method, amount,                 -- expected amount (incl. admin fee)
  tax_amount, admin_fee,                      -- amount = subtotal + tax + 3500
  paid_amount, remaining_amount,              -- from notification
  bank_code, channel, ref,                    -- from notification (recon anchor)
  inactive_date, paid_at, raw_callback JSONB, -- audit
  created_at, updated_at
```

**Invariants**

- `bookings.code` unique; reused as MAJA `number` (invoice number) so callbacks map 1:1.
- A booking has **at most one** `issued`/`draft` payment at any time.
- Only unpaid (`draft`/`issued`) payments may be `update`d or `cancel`led; `paid` is terminal except manual refund bookkeeping.
- Every state change writes an audit log row (who/what/why + raw payload when applicable).

---

## 7. Happy-path sequence (walk-in)

```
Customer scans QR → payment page opens (workspace pre-filled)
  → picks duration → total computed server-side (rate × hours + tax + VA admin 3.500)
  → picks bank (bni/bca/mandiri/bri/...) → POST /payments/initiate
BookingService: booking pending + slot held (or reuse existing open booking)
MAJA client:   register {number: booking.code, amount, items, paymentMethod, inactiveDate}
  ← 200 {id, number, va}          → payment issued, VA displayed on page
Customer pays VA at ATM/m-banking
MAJA:          payment notification POST /payments/callback  {type:payment, code:00, number, ...}
Webhook:       verify → match by number → idempotency check → payment paid → booking confirmed
Customer page: polls GET /payments/:id → success screen + e-ticket
```

## Penjelasan Masing-Masing Function di `src/auth.rs`

---

### 1. `pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart>`
**Fungsi:** Membuat URL authorization untuk memulai login OIDC

```rust
pub async fn start_login(oidc: &OidcClient) -> Result<AuthStart>
```

**Apa yang dilakukan:**
- Mengambil OIDC client dari Keycloak
- Membuat **PKCE challenge & verifier** (untuk keamanan)
- Membuat **CSRF token** (untuk mencegah CSRF attack)
- Membuat **nonce** (untuk mencegah replay attack)
- Mengembalikan URL authorization + semua secrets

**Return:** `AuthStart { url, csrf, nonce, verifier }`

---

### 2. `pub async fn callback(...) -> Result<Redirect, AppError>`
**Fungsi:** Handler setelah user login di Keycloak (OIDC callback)

```rust
pub async fn callback(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
    Query(params): Query<CallbackParams>,
) -> Result<Redirect, AppError>
```

**Apa yang dilakukan:**
1. **Cek CSRF state** - pastikan request valid
2. **Tukar authorization code** dengan access token + ID token
3. **Verify ID token** - pastikan token dari Keycloak yang valid
4. **Decode JWT payload** - extract claims termasuk roles
5. **Validasi role** - cek apakah user punya role "admin"
6. **Jika role valid** → insert user ke DB, save session, redirect `/admin`
7. **Jika role tidak valid** → clear session, redirect `/login?error=unauthorized`

---

### 3. `pub async fn logout(...) -> Redirect`
**Fungsi:** Logout user (hapus session aplikasi)

```rust
pub async fn logout(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Redirect
```

**Apa yang dilakukan:**
- Flush/delete semua data session dari database
- Redirect ke halaman home (`/`)

**Catatan:** Hanya logout dari aplikasi, TIDAK logout dari Keycloak

---

### 4. `pub async fn me(...) -> Result<Json<Value>, AppError>`
**Fungsi:** Cek status user yang sedang login

```rust
pub async fn me(
    axum::extract::State(state): axum::extract::State<AppState>,
    session: Session,
) -> Result<Json<Value>, AppError>
```

**Apa yang dilakukan:**
- Cek apakah ada `user_id` di session
- Jika ada → return `{ authenticated: true, user: {...} }`
- Jika tidak ada → return `{ authenticated: false }`

**Dipakai oleh:** Frontend AuthGuard untuk cek status login

---

## Helper Functions (Private)

| Function | Fungsi |
|----------|--------|
| `find_user(...)` | Cari user di DB berdasarkan UUID |
| `upsert_user(...)` | Insert atau update user di DB |
| `clear_oidc_flow(...)` | Hapus CSRF, nonce, PKCE verifier dari session |
| `login_failed_redirect(...)` | Helper untuk redirect saat login gagal |
| `ct_eq(...)` | Constant-time string comparison (untuk keamanan) |

---

## Alur Login Lengkap:

```
1. User klik login        → start_login() → redirect Keycloak
2. User login di Keycloak → callback() → validasi role + insert user
3. Jika role valid       → redirect /admin
4. Jika role tidak valid → redirect /login?error
5. Frontend cek status   → me() → AuthGuard proteksi
```
