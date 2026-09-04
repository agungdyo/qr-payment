# QR Payment Page — UX Design (qr-payment)

The mobile web page a customer lands on after scanning the QR sticker on a desk/room. Its job: get a walk-in customer from *"I just scanned a QR"* to *"I have paid and my booking is confirmed"* in the fewest steps, with zero ambiguity about the VA number, the price, or what happens next.

---

## 1. Design principles

1. **3 taps to a VA number.** Scan → duration → bank → VA shown. No account registration required to pay (optional contact capture only).
2. **The QR is static; the math is server-side.** The sticker never changes and carries no amount. All pricing (rate × duration + tax + VA admin Rp 3.500) is computed by the backend when the page loads — protects against tampering and stale pricing.
3. **Never show two VAs.** If an unpaid VA already exists for this workspace, resume it instead of re-registering.
4. **One primary action per screen.** Secondary actions (change bank, back) are visually subordinate.
5. **Trust but verify.** After the customer pays, "Saya sudah bayar" runs `inquiry`, and while the VA screen is open the page polls payment status so the success screen appears automatically when the MAJA webhook lands.
6. **Every failure state has a recovery action** — never a dead end.

---

## 2. QR payload spec

```
https://pay.<venue-domain>/w/{workspace_code}?src=qr
                    │
                    └─ e.g. meja-12, ruang-a, pod-3
```

- Workspace codes are short, human-readable, printed under the QR (`Meja 12`, `Ruang A`).
- Payload contains **no amount, no booking id, no token** — it is public information.
- `src=qr` lets analytics separate walk-in scans from other traffic.
- Server resolves `workspace_code` → venue + workspace + current rate plan. Unknown code → branded "kode tidak ditemukan" page.

---

## 3. User flow

```
Scan QR
  ▼
A. Workspace & duration     (rate, capacity, total preview)
  ▼
B. Payment channel          (bank list → chosen VA bank)
  ▼
C. VA issued                (register → big VA number + countdown + instructions)
  │
  ├── customer pays bank ──► webhook ──► page polls status
  │                              │
  ▼                              ▼
D. Success / e-ticket      (auto-transition when paid)
```

Branches:
- **Expired VA** (countdown reaches 0, or page reloaded after `inactiveDate`) → "VA kedaluwarsa" with **Buat VA baru** (register fresh) — resuming is impossible once expired.
- **Cancel** (customer backs out while unpaid) → confirm dialog → `cancel` MAJA invoice → return to screen A with slot released (optionally show booking reference for support).
- **Already paid on another device** → inquiry returns paid → go straight to D.
- **Register error / network down** → inline error with retry; never auto-submits twice (draft payment guard from the state machine).

---

## 4. Screen-by-screen spec

### A. Workspace & duration

Purpose: confirm *what* and *how long*; show a trustworthy total before any payment intent exists.

```
┌─────────────────────────────────┐
│  Venue Name            (logo)   │
│                                │
│  🖥  Meja 12 · Hot Desk        │
│     Lantai 2 · Kapasitas 1     │
│  ┌──────────────────────────┐  │
│  │     (workspace photo)    │  │
│  └──────────────────────────┘  │
│                                │
│  Lama sewa                     │
│  [ 1 jam ] [ 2 jam ] [ 3 jam ] │
│  [ 5 jam ]  [ 8 jam ] [ 24 j ]│
│                                │
│  ───────────────────────────── │
│  Sewa Meja 12   5 jam  100.000 │
│  PPN 11%              11.000   │
│  Biaya admin VA        3.500   │
│  ───────────────────────────── │
│  Total               114.500   │
│                                │
│        [ Lanjut Bayar → ]      │
└─────────────────────────────────┘
```

Behavior & content rules:
- Duration quick-picks are derived from the venue's rate plan; a stepper (`− 5 jam +`) covers arbitrary values, but presets should cover 90% of use.
- Price lines and total are **server-rendered from the API response** — no client-side math.
- Total line always includes tax and the Rp 3.500 VA admin fee; the breakdown exists to make that fee *visible*, never a surprise.
- Workspace availability for "now": if the desk is booked for an overlapping window, show the next free time rather than failing silently.
- Primary CTA disabled until a valid duration is selected.

### B. Payment channel (bank VA)

```
┌─────────────────────────────────┐
│  Pilih metode pembayaran        │
│  Transfer bank (Virtual Account)│
│                                │
│  [🏦 BNI]   [🏦 BCA]   [🏦 Mandiri] │
│  [🏦 BRI]   [🏦 BSI]   [🏦 Permata] │
│                                │
│  Tersedia: mobile banking, ATM, │
│  internet banking, SMS banking  │
│                                │
│        [ Bayar Rp 114.500 ]     │
└─────────────────────────────────┘
```

- Channels come from the MAJA payment-method list the merchant actually enables. Unavailable banks are grayed out.
- Sticky bottom bar repeats the total on scroll.
- Tapping a bank highlights it; the CTA then calls `POST /payments/initiate` (which registers the VA). Button shows loading state — "Membuat Virtual Account…" — because `register` is a network round-trip.

### C. VA issued (the critical screen)

```
┌─────────────────────────────────┐
│  ✓ Pembayaran dibuat            │
│                                │
│  Bayar ke Virtual Account BNI   │
│                                │
│   ⏱ Selesaikan sebelum 14:32   │  ← countdown
│  ┌────────────────────────────┐│
│  │ 8808 1234 5678   [⧉ Salin] ││  ← monospace, large
│  └────────────────────────────┘│
│                                │
│  Cara bayar                     │
│  ▾ via BNI Mobile Banking       │
│  ▾ via ATM BNI                  │
│  ▾ via Internet Banking         │
│                                │
│  ┌────────────────────────────┐│
│  │   Saya sudah bayar (ceklis)││  ← runs inquiry
│  └────────────────────────────┘│
│  Status: Menunggu pembayaran…  │
└─────────────────────────────────┘
```

Behavior & content rules:
- **VA number** is the hero: large monospace font, group digits, one-tap copy that confirms ("Nomor VA disalin"). Also offer "Kirim ke WhatsApp" for self-service later.
- **Countdown** mirrors the VA `inactiveDate` returned by `register`. Under 5 minutes it turns red/urgent.
- **Instructions** are per-bank accordions (mobile banking / ATM / internet banking steps). Store them as content templates per `paymentMethod`.
- **Polling**: every ~5 s the page calls `GET /payments/:id`; when status flips to paid (driven by the MAJA webhook), auto-advance to screen D with a subtle success animation.
- **Manual check**: "Saya sudah bayar" → `inquiry` → success if paid, otherwise "Pembayaran belum kami terima" + friendly hint (bank transfer can take 1–2 min; check the amount/number).
- If a VA already exists for this workspace booking (unpaid, not expired), **this screen is shown again with the same VA** — never a second registration.

### D. Success / e-ticket

```
┌─────────────────────────────────┐
│            🎉                    │
│     Pembayaran berhasil         │
│                                │
│  Booking: BK-2412-8842          │
│  Meja 12 · 5 jam                │
│  Total dibayar  Rp 114.500      │
│  via BNI VA · 14:01 WIB         │
│                                │
│  Tunjukkan kode ini ke staf:    │
│  ┌────────────────────────────┐│
│  │   8 4 2 9 0 1             ││
│  └────────────────────────────┘│
│  [ Tambahkan ke kalender ]     │
│  [ Kirim struk ke email/WA ]   │
└─────────────────────────────────┘
```

- Show booking code, workspace, duration, paid amount, channel, and timestamp — all echoed from the backend, not assembled on the client.
- Optionally capture name/phone **after** payment for receipts/support (optional field; never blocks success).
- "Tunjukkan kode ke staf" doubles as the physical check-in token until phase-2 access control exists.

### Failure & edge screens

| Situation | Screen behavior |
| :--- | :--- |
| VA expired (countdown hits 0) | Overlay → "VA kedaluwarsa" → **Buat VA baru** (register fresh VA) or **Batalkan** (release slot). Booking ref kept for support. |
| `register` error / timeout | Inline error banner + **Coba lagi**. Idempotency guard: server checks for a `draft`/`issued` payment first (resume via inquiry), so retry never doubles the VA. |
| Workspace code not found / venue inactive | Simple branded error page, no payment CTA. |
| Payment received but booking was cancelled (rare race) | Success screen still shown with note "Pembayaran diterima — hubungi staf"; operator queue handles it (state machine §5). |
| Under/over payment | Status stays "menunggu" with amount hint; finance flagged (state machine §5.3). |
| Offline (no connection after VA shown) | VA already rendered → still usable; polling pauses, resumes on reconnect. |

---

## 5. Page states (component inventory)

The page is one stateful component driven by `{booking?, payment?, workspace, ui}`:

| State | Trigger | Shows |
| :--- | :--- | :--- |
| `loading` | Initial open, resolve workspace | Skeleton of screen A |
| `select_duration` | Loaded, no booking yet | Screen A |
| `select_channel` | Duration chosen | Screen B |
| `registering` | `POST /payments/initiate` in flight | Loading on CTA, "Membuat Virtual Account…" |
| `va_shown` | `register` ok | Screen C + polling |
| `checking` | "Saya sudah bayar" → `inquiry` | Spinner on button |
| `paid` | Webhook/poll/inquiry flips status | Screen D |
| `expired` | Past `inactiveDate`, unpaid | Expired overlay + Buat VA baru |
| `cancelled` | Customer/admin cancel | Confirmation + back to A |
| `error` | Network/register failure | Inline error + retry |
| `not_found` | Bad workspace code | Branded dead-end |

Transitions between states follow the booking/payment machines in [`state-machine.md`](state-machine.md); the UI is a projection of those states, not a source of truth.

---

## 6. Layout & technical UX notes

- **Mobile-first** (the QR is scanned by phones); usable down to 320 px, safe-area aware (notch/home indicator), large tap targets (≥ 44 px).
- Sticky bottom CTA bar on screens A–C; the VA screen intentionally has *no* competing primary button — copy + "Saya sudah bayar" are the only actions.
- **Accessibility**: VA number read out digit-by-digit by screen readers is painful — use `aria-label` "Nomor virtual account" and announce grouped digits; ensure the countdown has a text equivalent; color is never the only status signal.
- **Reload-safe**: reopening the page mid-flow re-resolves server state (open booking/payment) and lands on the correct screen (A/C/D). No fragile client-only state.
- Copy is in Indonesian (end-user language); keep strings in a locale file for reuse.

---

## 7. Success criteria

- Median **scan → VA shown** time < 15 s (register round-trip is the only network hop).
- ≥ 90% of sessions reach screen C (VA issued) without drop-off.
- ≤ 5% of issued VAs expire unpaid (a good funnel signal; expiry is a *recovery* flow, not the norm).
- 0 duplicate VA registrations for the same booking (idempotency invariant).
- Success screen reached automatically (webhook + polling) in ≥ 99% of paid cases; manual "Saya sudah bayar" is the fallback, not the norm.
