# Product Requirements Document (PRD)
# QR-Payment v1.0 — Coworking Space Walk-in Payment System

| | |
|---|---|
| **Product** | QR-Payment |
| **Document Version** | 1.0 |
| **Status** | Active Development |
| **Development Entity** | MAJA Digital |
| **Target Platform** | Web App (Responsive), Progressive Web App (PWA) |
| **Contact / Owner** | product@maja.id |
| **Tagline** | "Scan QR, Bayar VA, Langsung Kerja — Self-service Coworking Booking" |

---

## 1. Executive Summary

**QR-Payment** adalah platform booking dan pembayaran self-service untuk coworking space yang memungkinkan tamu walk-in memesan meja/ruangan melalui pemindaian kode QR tanpa perlu interaksi dengan staf reception.

Setiap workspace memiliki QR code permanen yang di-print dan ditempelkan. Memindainya membuka halaman pembayaran mobile-optimized yang menghubungkan ke gateway pembayaran **MAJA** untuk membuat Virtual Account bank. Setelah tamu melakukan transfer, webhook dari MAJA mengkonfirmasi pembayaran dan booking terintegrasi secara real-time.

**Value Proposition**: Menghilangkan bottleneck reception dengan flow self-service 24/7, mengurangi waktu check-in dari 5-10 menit menjadi kurang dari 2 menit, dan memberikan visibilitas real-time bagi admin terhadap occupancy dan transaksi.

Tagline: *"Scan QR → Pilih Durasi → Bayar VA → E-Ticket → Kerja"*

---

## 2. Background & Problem Statement

### 2.1 Problem (Pain Points)

| # | Pain Point | Impact |
|---|---|---|
| 1 | **Booking manual di reception** | Antrian panjang saat jam sibuk, waktu tunggu 5-10 menit per tamu |
| 2 | **Pembayaran terbatas di counter** | Tamu harus punya cash atau metode spesifik; tidak bisa 24/7 |
| 3 | **Tidak ada real-time visibility** | Admin tidak tahu berapa meja booked/available tanpa cek fisik |
| 4 | **Dynamic pricing tidak mungkin** | QR static tidak support variabel harga berdasarkan durasi |
| 5 | **Kompleksitas VA registration** | Setiap bank punya format VA berbeda; manual prone error |
| 6 | **Lost webhook = phantom bookings** | Pembayaran berhasil tapi sistem tidak tahu, menyebabkan double-booking |

### 2.2 Proposed Solution

| # | Solution Pillar | Addresses Pain Point |
|---|---|---|
| S1 | **QR Universal dengan Server-Side Pricing** | QR permanent per workspace; harga dihitung server berdasarkan durasi |
| S2 | **Multi-Bank Virtual Account via MAJA** | Satu API untuk 10+ bank; VA registration otomatis |
| S3 | **Admin Dashboard Real-Time** | Stats, transaksi, manajemen workspace dalam satu view |
| S4 | **Webhook + Reconcile Dual Protection** | Konfirmasi instant via webhook + healing via cron job |
| S5 | **E-Ticket dengan WiFi Auto-Display** | Check-in confirmation + kredensial venue tanpa interaksi staf |

---

## 3. Goals & Success Metrics

### 3.1 Business Goals

| Goal | Target Metric | Baseline | Period | Priority |
|---|---|---|---|---|
| **G1** Reduce Reception Load | ≥ 80% walk-in self-service | 0% (manual) | Q1 2025 | P0 - Critical |
| **G2** Faster Check-in Time | Avg check-in < 2 menit | 7 menit | Q1 2025 | P0 - Critical |
| **G3** Payment Success Rate | ≥ 95% VA → paid | N/A (new system) | Monthly | P1 - High |
| **G4** Workspace Utilization | ≥ 60% occupancy peak hours | Unknown | Q2 2025 | P2 - Medium |
| **G5** Customer Satisfaction | NPS ≥ 40 for payment flow | N/A | Q2 2025 | P2 - Medium |

### 3.2 Product Metrics (North Star Metric)

**Primary**: Number of successful payment completions (status: 'paid') per day per venue.

**Supporting Metrics**:
- VA creation → payment conversion rate
- Average time from QR scan to payment confirmation
- Admin dashboard daily active users
- Workspace activation rate (active / total configured)

---

## 4. Target Users & Personas

### Persona 1 — "The Hasty Freelancer" 
**Age**: 24-38 yrs | **Tech Savviness**: High | **Payment Method**: Mobile banking (98%)

```
┌─────────────────────────────────────────────────────────────────┐
│  DEMOGRAPHICS                                                     │
│  • Remote worker, freelancer, or traveling professional          │
│  • Works from cafes/co-working spaces 2-4x per week              │
│  • Comfortable with self-service tech                            │
│  • Uses Gojek/Grab/OVO regularly                                 │
├─────────────────────────────────────────────────────────────────┤
│  PAIN POINTS                                                      │
│  • "Saya nggak mau antri panjang di reception"                   │
│  • "Harus bawa cash itu ribet, lebih suka transfer"              │
│  • "Kalau bisa 1 jam doang, ngapain harus booking jauh-jauh"     │
│  • "Langsung dapat WiFi password itu penting"                    │
├─────────────────────────────────────────────────────────────────┤
│  NEEDS                                                            │
│  • Fast check-in (< 3 menit total)                               │
│  • Flexible duration (bayar per jam kalau perlu)                  │
│  • Mobile-first UX (already on phone)                            │
│  • Instant confirmation & WiFi access                            │
└─────────────────────────────────────────────────────────────────┘
```

### Persona 2 — "The Venue Operator"
**Age**: 26-45 yrs | **Role**: Receptionist/Admin | **Tech Savviness**: Medium

```
┌─────────────────────────────────────────────────────────────────┐
│  DEMOGRAPHICS                                                     │
│  • Venue staff or manager at coworking space                    │
│  • Handles 20-50 walk-ins per day                               │
│  • Responsible for workspace inventory management                 │
├─────────────────────────────────────────────────────────────────┤
│  PAIN POINTS                                                      │
│  • "Ribet banget ngurus booking manual, sering salah tulis"       │
│  • "Orang mau bayar tapiVA-nya beda bank, capek jelasin"          │
│  • "Sulit tau meja mana yang udah booked tanpa keliling"          │
│  • " Kalau ada yang transfer, aku harus cek satu-satu"           │
├─────────────────────────────────────────────────────────────────┤
│  NEEDS                                                            │
│  • Dashboard with real-time stats                               │
│  • One-click workspace management                                │
│  • Transaction history with payment status                       │
│  • WiFi credentials management without touching router            │
└─────────────────────────────────────────────────────────────────┘
```

### Persona 3 — "The Space Manager"
**Age**: 30-50 yrs | **Role**: Business Owner/Manager | **Focus**: ROI

```
┌─────────────────────────────────────────────────────────────────┐
│  DEMOGRAPHICS                                                     │
│  • Coworking space owner or operations manager                    │
│  • Reviews daily/weekly performance                              │
│  • Makes decisions on pricing and capacity                       │
├─────────────────────────────────────────────────────────────────┤
│  PAIN POINTS                                                      │
│  • "Tidak punya data real-time occupancy"                        │
│  • "Report bulanan manual, memakan waktu 2-3 jam"                 │
│  • "Sulit evaluasi apakah pricing sudah optimal"                  │
├─────────────────────────────────────────────────────────────────┤
│  NEEDS                                                            │
│  • Daily/weekly transaction summary                               │
│  • Revenue tracking per workspace                                │
│  • Easy pricing adjustment                                       │
│  • Audit trail for reconciliation                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Scope Boundary

### 5.1 In-Scope (MVP — Phase 1)

| Module | Features | Priority |
|---|---|---|
| **M1: Customer Flow** | QR → Workspace Info → Durasi → Bank → VA → Bayar → E-Ticket | P0 |
| **M2: MAJA Integration** | VA Register, Webhook Callback, Inquiry, Cancel | P0 |
| **M3: Admin Auth** | Keycloak OIDC dengan role validation | P0 |
| **M4: Admin Dashboard** | Stats overview, recent transactions | P1 |
| **M5: Workspace CRUD** | Create, read, update, toggle active | P1 |
| **M6: Pricing Tiers** | Custom packages per workspace (1j, 3j, 8j, 24j) | P1 |
| **M7: Locker Management** | CRUD + status toggle | P2 |
| **M8: Venue Settings** | Nama venue, WiFi SSID/password, toggle display | P2 |
| **M9: Demo Mode** | Mock API untuk prototyping tanpa backend | P1 |

### 5.2 Out-of-Scope (Phase 2+)

| Feature | Reason | Target |
|---|---|---|
| Food & Beverage ordering | Complex inventory, delivery logistics | Phase 2 |
| Native mobile apps | PWA sudah cukup untuk MVP | Phase 3 |
| Multi-venue support | Focus ke single venue dulu | Phase 2 |
| Advance booking calendar | Walk-in focus untuk MVP | Phase 2 |
| Membership/subscription | Billing complexity | Phase 3 |
| Check-in/out dengan staf | Self-service focus | Phase 2 |
| Payment gateway lain (Midtrans, Xendit) | MAJA sudah cukup | Phase 4+ |
| QR code generation & printing | Focus ke digital flow | Out |
| Refund processing | Manual untuk MVP | Phase 2 |

### 5.3 Dependencies

```
┌────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DEPENDENCIES                     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Keycloak (account.maja.id)                                    │
│  └── Required: Admin role in realm "maja", client "qr-payment" │
│  └── Risk: SSO integration, role propagation                   │
│                                                                │
│  MAJA Billing Gateway (billing.maja.id)                         │
│  └── Required: VA registration, webhook callback                │
│  └── Risk: API stability, webhook reliability                   │
│                                                                │
│  PostgreSQL 16                                                  │
│  └── Required: Persistent storage                              │
│  └── Risk: Migration scripts, backup strategy                   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Core Feature Modules & Access Control Matrix (IAM Matrix)

| Module ID | Module Name | Short Description | Public | Member | Admin | Superadmin |
|---|---|---|:---:|:---:|:---:|:---:|
| F1 | QR Payment Flow | Customer-facing booking & payment | ✓ | — | — | — |
| F2 | Public Workspace List | View active workspaces | ✓ | — | — | — |
| F3 | E-Ticket Display | Post-payment confirmation + WiFi | ✓ (own only) | — | — | — |
| F4 | Admin Auth | Keycloak OIDC login/logout | — | — | ✓ | ✓ |
| F5 | Dashboard Overview | Stats + recent transactions | — | — | ✓ | ✓ |
| F6 | Workspace Management | Full CRUD for workspaces | — | — | ✓ | ✓ |
| F7 | Locker Management | Full CRUD for lockers | — | — | ✓ | ✓ |
| F8 | Venue Settings | Update venue/WiFi config | — | — | ✓ | ✓ |
| F9 | Payment History | View all transactions | — | — | ✓ | ✓ |

### 6.1 Role Definitions

| Role | Description | Key Capabilities |
|---|---|---|
| **Public** | Unauthenticated customer scanning QR | View workspace, make payments |
| **Admin** | Keycloak role "admin" in qr-payment client | Full admin console access |
| **Superadmin** | Future: multi-tenant admin | TBD in Phase 2 |

---

## 7. Non-Functional Requirements (NFR)

### 7.1 Security Requirements

| ID | Requirement | Implementation |
|---|---|---|
| SEC-1 | **TLS Encryption** | All traffic over HTTPS (TLS 1.2+) |
| SEC-2 | **OIDC PKCE Flow** | Authorization code + PKCE for login |
| SEC-3 | **CSRF Protection** | State parameter validation in OIDC callback |
| SEC-4 | **Session Security** | Server-side sessions (tower-sessions), HttpOnly cookies |
| SEC-5 | **Role-Based Access** | Admin role validated from Keycloak JWT claims |
| SEC-6 | **IDOR Prevention** | All resource access validated against session user |
| SEC-7 | **Constant-Time Compare** | For OIDC state parameter comparison |
| SEC-8 | **Token Isolation** | Refresh tokens hashed (SHA-256) before storage |

### 7.2 Performance Requirements

| ID | Requirement | Target | Measurement |
|---|---|---|---|
| PERF-1 | **API Response (p95)** | ≤ 500ms | Transactional endpoints |
| PERF-2 | **Frontend FCP** | ≤ 1.5s | First Contentful Paint |
| PERF-3 | **Payment Polling** | 3s interval | While VA screen active |
| PERF-4 | **Concurrent Users** | 50 simultaneous | Per venue |
| PERF-5 | **Webhook Processing** | < 2s | From receipt to DB update |

### 7.3 Reliability Requirements

| ID | Requirement | Implementation |
|---|---|---|
| REL-1 | **Demo Mode Fallback** | Mock API when backend unavailable |
| REL-2 | **Webhook Idempotency** | Unique index prevents double-processing |
| REL-3 | **Reconcile Job** | Hourly cron heals lost webhooks |
| REL-4 | **Expiry Grace Period** | 5-min buffer before cancelling VA |
| REL-5 | **Error Logging** | Structured logging for all failures |

### 7.4 Compliance Requirements

| ID | Requirement | Implementation |
|---|---|---|
| COMP-1 | **GDPR-Ready** | No personal data in localStorage; session-based |
| COMP-2 | **Audit Trail** | All payment state changes logged |
| COMP-3 | **Data Retention** | Payment history retained per business policy |

---

## 8. Technical Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  Framework:    React 19 + TypeScript                                    │
│  Build Tool:   Vite 7                                                    │
│  Styling:      TailwindCSS 4                                            │
│  Icons:        Lucide React                                             │
│  Routing:      React Router v7                                          │
│  State:        React hooks (useState, useReducer)                       │
│  HTTP Client:  Fetch API                                                │
│  Notifications: Sonner (toast)                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Language:     Rust                                                     │
│  Framework:    Axum                                                     │
│  Database:     PostgreSQL 16 via SQLx                                   │
│  Auth:         Keycloak OIDC (openidconnect crate)                      │
│  Sessions:     tower-sessions                                           │
│  HTTP Client:  reqwest                                                   │
│  Async:        Tokio                                                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Containers:   Docker + Docker Compose                                  │
│  Database:     PostgreSQL 16 Alpine                                      │
│  Auth Server: Keycloak (hosted at account.maja.id)                      │
│  Payment GW:  MAJA H2H (billing.maja.id)                               │
│  Admin DB:    pgAdmin (optional)                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. User Flows

### 9.1 Happy Path — Customer Payment Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  SCAN QR    │ ───▶ │  WORKSPACE  │ ───▶ │   CHOICE    │
│  (meja-12)  │      │    INFO     │      │ Meja/Makan? │
└─────────────┘      └─────────────┘      └──────┬──────┘
                                                 │ "Pesan Meja"
                                                 ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  POLLING    │ ◀─── │  VA SCREEN  │ ───▶ │   BANK      │
│  (3s loop)  │      │  + Countdown │      │  SELECT     │
└──────┬──────┘      └──────┬──────┘      └─────────────┘
       │                    │
       │ PAID               │ "Bayar Rp XXX.XXX"
       │                    ▼
       │             ┌─────────────┐      ┌─────────────┐
       │             │  REGISTER   │ ───▶ │    VA       │
       │             │    VA       │      │  DISPLAY    │
       │             └─────────────┘      └──────┬──────┘
       │                                          │
       │                                          │ Transfer via
       │                                          │ ATM/Mobile
       │                                          ▼
       │             ┌─────────────┐      ┌─────────────┐
       │             │  WEBHOOK    │ ◀─── │   MAJA      │
       │             │  CONFIRMED  │      │   BANK      │
       │             └──────┬──────┘      └─────────────┘
       │                    │
       │            ┌───────┴───────┐
       │            │               │
       ▼            ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  E-TICKET   │ │   EXPIRED   │ │  CANCELLED  │
│  + WiFi     │ │  (VA Exp)   │ │  (User)     │
└─────────────┘ └─────────────┘ └─────────────┘
```

### 9.2 Admin Authentication Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  ADMIN     │ ───▶ │  /auth/me   │ ───▶ │ NOT AUTH?  │
│  CLICK     │      │   CHECK     │      │ /auth/login │
└─────────────┘      └──────┬──────┘      └─────────────┘
                            │
                            │ AUTH
                            ▼
                     ┌─────────────┐
                     │  KEYCLOAK   │
                     │  LOGIN      │
                     └──────┬──────┘
                            │
                     ┌───────┴───────┐
                     │               │
                     ▼               ▼
              ┌─────────────┐ ┌─────────────┐
              │   ADMIN     │ │   DENIED    │
              │   REDIRECT  │ │   LOGOUT    │
              │   /admin    │ │  + MSG      │
              └─────────────┘ └─────────────┘
```

---

## 10. Pricing Architecture

### 10.1 Price Calculation Formula

```
┌─────────────────────────────────────────────────────────────────┐
│                    CUSTOMER-FACING PRICE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SUBTOTAL = CASE WHEN exact_tier_exists                          │
│                  THEN tier_price                                 │
│                  ELSE hourly_rate × hours                        │
│                                                                  │
│  PPN 11%    = SUBTOTAL × 0.11                                   │
│  VA ADMIN   = Rp 3.500 (flat, MAJA fee)                         │
│                                                                  │
│  TOTAL      = SUBTOTAL + PPN + VA_ADMIN                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Example Workspace Pricing

**Workspace: "Meja 12 — Hot Desk"**

| Duration | Type | Price | Notes |
|---|---|---|---|
| 1 jam | Tier | Rp 25.000 | Minimum rental |
| 3 jam | Tier | Rp 60.000 | Most popular |
| 8 jam | Tier | Rp 150.000 | Full day pass |
| 24 jam | Tier | Rp 400.000 | Weekly pass |
| Custom | Hourly | Rp 20.000/jam | If not matching tier |

**Example: 5 jam rental**
```
Subtotal = 5 × Rp 20.000 = Rp 100.000 (no 5-hour tier)
PPN 11%  = Rp 11.000
Admin VA = Rp 3.500
TOTAL    = Rp 114.500
```

---

## 11. Supported Payment Channels

### 11.1 Virtual Account Banks

| Bank | Code | Status |
|---|---|---|
| BCA | `bca` | ✓ Supported |
| Bank Mandiri | `mandiri` | ✓ Supported |
| BNI 46 | `bni` | ✓ Supported |
| BRI | `bri` | ✓ Supported |
| CIMB Niaga | `cimb` | ✓ Supported |
| Bank Danamon | `danamon` | ✓ Supported |
| Bank Permata | `permata` | ✓ Supported |
| Bank Permata Syariah | `permatasyariah` | ✓ Supported |
| BII / Maybank | `bii` | ✓ Supported |
| Keb Hana Bank | `hana` | ✓ Supported |
| Bank Sinarmas (BSI) | `bsi` | ✓ Supported |

### 11.2 Future Payment Methods (Phase 2+)

- QRIS (different from VA)
- E-wallet (GoPay, OVO, DANA)
- Credit card

---

## 12. API Reference Summary

### 12.1 Public APIs (No Authentication)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/workspaces` | List active workspaces |
| GET | `/api/v1/workspaces/:code` | Get workspace details |
| GET | `/api/v1/workspaces/:code/open-payment` | Find unpaid VA for workspace |
| POST | `/api/v1/payments/initiate` | Create VA via MAJA |
| GET | `/api/v1/payments/:id` | Get payment status |
| POST | `/api/v1/payments/:id/inquiry` | Check payment with MAJA |
| POST | `/api/v1/payments/:id/cancel` | Cancel VA |
| POST | `/api/v1/payments/callback` | MAJA webhook |
| GET | `/api/v1/public/settings` | Public venue settings |

### 12.2 Admin APIs (Requires Admin Session)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/admin/stats` | Dashboard statistics |
| GET | `/api/v1/admin/workspaces` | List all workspaces |
| POST | `/api/v1/admin/workspaces` | Create workspace |
| PUT | `/api/v1/admin/workspaces/:code` | Update workspace |
| GET | `/api/v1/admin/lockers` | List lockers |
| POST | `/api/v1/admin/lockers` | Create locker |
| PUT | `/api/v1/admin/lockers/:id` | Update locker |
| DELETE | `/api/v1/admin/lockers/:id` | Delete locker |
| GET | `/api/v1/admin/settings` | Get settings |
| PUT | `/api/v1/admin/settings` | Update settings |
| GET | `/api/v1/admin/payments` | List payments |

### 12.3 Auth APIs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/login` | Start OIDC flow |
| GET | `/auth/callback` | OIDC callback |
| GET | `/auth/logout` | Logout + clear session |
| GET | `/auth/me` | Session probe |

---

## 13. Open Items & Blockers

| ID | Item | Owner | Status | Priority |
|---|---|---|---|---|
| O-1 | Konfirmasi MAJA `update` endpoint availability | MAJA Team | Pending | P1 |
| O-2 | Webhook callback URL registration with MAJA | MAJA Team | Pending | P0 |
| O-3 | Outbound IP allowlist for MAJA callback | DevOps | Pending | P1 |
| O-4 | Konfirmasi `ref` field presence in all channel notifications | MAJA Team | Pending | P1 |
| O-5 | Print QR code stickers for all workspaces | Operations | Not Started | P2 |

---

*Document Status: Draft v1.0 — For internal review and development reference*
