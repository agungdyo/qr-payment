# qr-payment

Design documentation and working prototypes for a **coworking space walk-in
payment system**: each desk/room carries a printed QR code that encodes a
payment link; scanning it opens a mobile payment page that registers a bank
**Virtual Account (VA)** through the **MAJA billing gateway**, and a MAJA
payment notification webhook confirms the booking.

> **Not QRIS.** The QR code encodes a URL (payment link), not a payment string.
> Money movement is bank transfer to a VA generated per transaction via MAJA.

## Folder structure

```
qr-payment/
├── README.md          ← you are here
├── .gitignore         (node_modules/, dist/, .env — applies to both apps)
├── docs/
│   ├── state-machine.md   Booking/payment machines + MAJA endpoint mapping
│   └── qr-page-ux.md      QR payload spec + mobile payment page UX
├── frontend/          ACTIVE prototype (customer + admin console)
│   └── src/
│       ├── pages/           customer: DemoHome, PaymentFlow; admin/* console
│       ├── components/      flow components + admin shell/controls
│       └── lib/             pricing, api (types/mock/store/client), machine
└── demo-v1/           ARCHIVED early prototype (pre-admin), standalone Vite app
```

Two apps are kept deliberately separate — the archive is **not** nested inside
`frontend/` anymore, so it cannot be confused with the live source or picked up
by its build tooling.

## Running the apps

```bash
# Active prototype (customer QR flow + /admin console) — http://localhost:5173
cd frontend
npm install
npm run dev

# Archived v1 prototype (early flow only) — run from its own folder
cd ../demo-v1
npm install      # node_modules already present; re-run only if needed
npm run dev      # Vite picks the next free port (5174+) if 5173 is busy
```

### Routes (frontend)

| Route | Purpose |
| :--- | :--- |
| `/` | Demo home — lists active workspaces (simulates scanning a QR) |
| `/w/:code` | Customer payment flow (duration → VA → webhook → e-ticket) |
| `/admin` | Admin dashboard (ringkasan, transaksi terakhir) |
| `/admin/workspaces` + `/admin/workspaces/new` & `/:code` | Per-workspace settings: name, active toggle, **tarif per durasi** (1/3/8/24 jam) + hourly fallback |
| `/admin/lockers` | Storage locker CRUD + availability |
| `/admin/settings` | Venue name + **Wi-Fi SSID/password** update |

The prototype runs on an in-browser **shared mock store** (localStorage,
`qr-payment.db.v1`): admin edits (prices, deactivate a desk, Wi-Fi) are
immediately visible on the customer payment page. Payment is simulated too —
the "Demo → tandai lunas" pill stands in for the MAJA webhook. Point
`VITE_API_BASE_URL` at a real backend to switch to HTTP (endpoints listed in
`frontend/.env.example`).

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

## Git status

This folder is **not yet under version control** (planned): initialize a repo
here, commit both apps, and tag the archived v1 (`demo/v1.0`) so the early
prototype stays recoverable. `node_modules/`, `dist/`, and `.env` are already
ignored by the root `.gitignore`.

## Open items (confirm with MAJA team)

- `update` endpoint contract (v2.3) — referenced but not in the v2.2 spec
  available here; fallback is `cancel` → `register`.
- Webhook callback URL registration / outbound IP allow-list.
- Reliable presence of `ref` in notifications for all channels.
