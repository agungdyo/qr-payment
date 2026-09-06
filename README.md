# qr-payment

Design documentation and working prototypes for a **coworking space walk-in
payment system**: each desk/room carries a printed QR code that encodes a
payment link; scanning it opens a mobile payment page that registers a bank
**Virtual Account (VA)** through the **MAJA billing gateway**, and a MAJA
payment notification webhook confirms the booking.

> **Not QRIS.** The QR code encodes a URL (payment link), not a payment string.
> Money movement is bank transfer to a VA generated per transaction via MAJA.

## Setup

### 1. Copy environment files

```bash
# Backend
cp .env.example .env

# Frontend (if using real backend)
cd frontend
cp .env.example .env
```

### 2. Start infrastructure (Docker)

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** (port 5434) — database
- **Keycloak** (port 8083) — authentication
- **pgAdmin** (port 5052) — optional database admin UI

### 3. Start backend

```bash
cargo run
```

Backend runs on **http://localhost:3000**

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on **http://localhost:5173**

### Default credentials

**Keycloak admin:** `admin` / `admin` (http://localhost:8083/admin)

**pgAdmin:** `admin@gmail.com` / `admin`

## Folder structure

```
qr-payment/
├── README.md          ← you are here
├── .gitignore         (node_modules/, dist/, .env — applies to both apps)
├── .env.example       Template for environment variables
├── docker-compose.yml  Infrastructure (PostgreSQL, Keycloak, pgAdmin)
├── docs/
│   ├── state-machine.md   Booking/payment machines + MAJA endpoint mapping
│   └── qr-page-ux.md      QR payload spec + mobile payment page UX
├── postgres-init/     SQL scripts run on first PostgreSQL start
├── keycloak/          Realm import files
├── frontend/          Customer + admin console (Vite + React)
│   └── src/
│       ├── pages/           customer: Home, PaymentFlow; admin/* console
│       ├── components/      flow components + admin shell/controls
│       └── lib/             pricing, api (types/mock/store/client), machine
└── src/              Backend (Rust + Axum)
```

## Routes (frontend)

| Route | Purpose |
| :--- | :--- |
| `/` | Home — lists active workspaces (simulates scanning a QR) |
| `/w/:code` | Customer payment flow (duration → VA → webhook → e-ticket) |
| `/admin` | Admin dashboard (ringkasan, transaksi terakhir) |
| `/admin/workspaces` + `/admin/workspaces/new` & `/:code` | Per-workspace settings: name, active toggle, **tarif per durasi** (1/3/8/24 jam) + hourly fallback |
| `/admin/lockers` | Storage locker CRUD + availability |
| `/admin/settings` | Venue name + **Wi-Fi SSID/password** update |

## Authentication

Admin routes require login via **Keycloak OIDC**.

Flow:
1. Click "Buka dashboard admin" → checks auth status
2. If not logged in → redirects to Keycloak login
3. After login → session created, redirect to `/admin`
4. Click "Logout" → clears session, returns to customer page

## Design overview (see docs/)

1. QR payload is a **static, permanent URL** per workspace (`/w/meja-12`), no
   amount, no secret — pricing is server-computed.
2. A VA is **registered per transaction** (`register`) because a VA is bound to
   one invoice number and amount; `update` covers hour/price changes before
   payment, `cancel` + expiry cron release the slot, `inquiry` heals lost
   webhooks.
3. **Invoice number = booking code** — MAJA's `number`/`id` is the single
   anchor used to match webhooks and reconcile, per the workspace's H2H
   convention.
4. `amount` = subtotal (tier or hourly) + PPN 11% + **VA admin Rp 3.500**,
   computed server-side.

## Reference material in this workspace

- MAJA API spec v2.2 (register, notification, inquiry, cancel): `../web-booking/docs/Maja.md`
- Existing backend with booking + MAJA register/callback: `../web-booking`
- Frontend with a VA display page: `../web-booking-view`

## Open items (confirm with MAJA team)

- `update` endpoint contract (v2.3) — referenced but not in the v2.2 spec
  available here; fallback is `cancel` → `register`.
- Webhook callback URL registration / outbound IP allow-list.
- Reliable presence of `ref` in notifications for all channels.
