# Fitur Pembayaran Tunai (Cash Flagging)

## Gambaran Umum

Fitur ini memanfaatkan "webhook simulator" yang sudah ada sebagai mekanisme untuk menandai pembayaran secara manual (cash payment). Alih-alih menunggu notifikasi dari MAJA billing gateway, operator/admin dapat langsung menandai VA (Virtual Account) sebagai "lunas" ketika customer memilih untuk bayar secara tunai di kasir.

---

## Alur Kerja

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CASH PAYMENT WORKFLOW                        │
└─────────────────────────────────────────────────────────────────────┘

  Customer                    Frontend                   Backend
     │                           │                          │
     │  1. Pilih durasi         │                          │
     │──────────────────────────▶│                          │
     │                           │  2. initiate-payment     │
     │                           │──────────────────────────▶│
     │                           │                          │
     │                           │  3. Payment created      │
     │                           │     status: "issued"      │
     │                           │◀──────────────────────────│
     │                           │                          │
     │  4. Tampilkan VA         │                          │
     │◀──────────────────────────│                          │
     │                           │                          │
     │  [Customer Pergi ke Kasir untuk Bayar Tunai]       │
     │                           │                          │
     │                           │                          │

  Operator/Admin                 Frontend                   Backend
     │                           │                          │
     │  5. Lihat pesanan        │                          │
     │     pending di dashboard  │                          │
     │                           │                          │
     │  6. Klik "Bayar Tunai"  │                          │
     │──────────────────────────▶│                          │
     │                           │  7. POST /mark-cash     │
     │                           │──────────────────────────▶│
     │                           │                          │
     │                           │  8. Update payment       │
     │                           │     status: "paid"       │
     │                           │     payment_channel:      │
     │                           │       "cash"             │
     │                           │◀──────────────────────────│
     │                           │                          │
     │  9. Konfirmasi           │                          │
     │◀──────────────────────────│                          │
```

---

## Struktur Data

### Field Baru di Payment

| Field | Tipe | Deskripsi | Contoh |
|-------|------|-----------|--------|
| `payment_channel` | TEXT | Saluran pembayaran | `cash`, `va`, `qris` |
| `paid_by_admin` | UUID | Admin yang memproses (nullable) | User ID |
| `paid_note` | TEXT | Catatan pembayaran | `Bayar tunai di kasir A` |

### Database Migration

```sql
-- Tambahkan kolom untuk tracking cash payment
ALTER TABLE payments ADD COLUMN payment_channel TEXT DEFAULT '\'va\'';
ALTER TABLE payments ADD COLUMN paid_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN paid_note TEXT;
```

---

## API Endpoints

### 1. Mark as Cash (Admin)

**Endpoint:** `POST /api/v1/admin/payments/{id}/mark-cash`

**Request Body:**
```json
{
  "note": "Bayar tunai di kasir utama"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid-payment",
  "booking_code": "BK-12345",
  "status": "paid",
  "payment_channel": "cash",
  "paid_at": "2026-09-05T12:00:00Z",
  "paid_by_admin": "admin-uuid",
  "paid_note": "Bayar tunai di kasir utama"
}
```

**Error Responses:**
- `404` - Payment tidak ditemukan
- `400` - Payment sudah lunas atau dibatalkan
- `403` - Tidak punya akses (bukan admin/operator)

### 2. List Pending Payments (Admin)

**Endpoint:** `GET /api/v1/admin/payments?status=issued`

**Response:**
```json
{
  "payments": [
    {
      "id": "uuid-1",
      "booking_code": "BK-12345",
      "workspace_name": "Meja A-01",
      "hours": 3,
      "amount": 45500,
      "status": "issued",
      "payment_channel": "va",
      "created_at": "2026-09-05T11:30:00Z",
      "expires_at": "2026-09-05T12:30:00Z"
    }
  ],
  "total": 1
}
```

---

## Frontend Components

### 1. CashPaymentPanel (Rename dari DemoPanel)

**Lokasi:** `frontend/src/components/flow/CashPaymentPanel.tsx`

**Props:**
```typescript
interface CashPaymentPanelProps {
  paymentId: string
  bookingCode: string
  customerName?: string
  amount: number
  hours: number
  workspaceName: string
  onMarkCash: (note?: string) => Promise<void>
  busy: boolean
}
```

**Tampilan:**
```tsx
<div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
  <h3 className="font-semibold text-amber-800 flex items-center gap-2">
    <BanknoteIcon className="h-5 w-5" />
    Pembayaran Tunai
  </h3>
  
  <div className="mt-3 space-y-2 text-sm">
    <div className="flex justify-between">
      <span>Meja</span>
      <span className="font-medium">{workspaceName}</span>
    </div>
    <div className="flex justify-between">
      <span>Durasi</span>
      <span className="font-medium">{hours} jam</span>
    </div>
    <div className="flex justify-between">
      <span>Total</span>
      <span className="font-bold text-lg">{formatIDR(amount)}</span>
    </div>
  </div>
  
  <Textarea 
    placeholder="Catatan (opsional)"
    value={note}
    onChange={(e) => setNote(e.target.value)}
    className="mt-3"
  />
  
  <Button 
    onClick={() => onMarkCash(note)}
    loading={busy}
    className="w-full mt-3 bg-amber-600 hover:bg-amber-700"
  >
    💵 Tandai Lunas (Tunai)
  </Button>
</div>
```

### 2. Admin Payment List

**Lokasi:** `frontend/src/pages/admin/AdminPaymentsPage.tsx`

**Fitur:**
- Filter: All, Pending, Paid, Cancelled
- Sort: Terbaru, Terlama
- Action button "Bayar Tunai" untuk status `issued`

### 3. Dashboard Widget

**Lokasi:** `frontend/src/pages/admin/AdminDashboardPage.tsx`

**Widget:**
```tsx
<Card className="bg-amber-50 border-amber-200">
  <div className="flex items-center justify-between">
    <div>
      <p className="text-amber-600 text-sm">Menunggu Pembayaran</p>
      <p className="text-3xl font-bold text-amber-900">{pendingCount}</p>
    </div>
    <ClockIcon className="h-12 w-12 text-amber-300" />
  </div>
  <Button 
    variant="outline" 
    className="mt-3 w-full border-amber-300 text-amber-700"
    onClick={() => navigate('/admin/payments?status=issued')}
  >
    Lihat Detail →
  </Button>
</Card>
```

---

## Konfigurasi Mode

### Environment Variables

```bash
# frontend/.env

# Koneksi ke backend (real data)
VITE_API_BASE_URL=http://localhost:3000

# Fitur Cash Payment
VITE_CASH_PAYMENT_ENABLED=true
VITE_WEBHOOK_SIMULATOR_AS_CASH=true
```

### Backend Config

```rust
// src/config.rs
pub struct Config {
    // ... existing fields
    
    /// Enable cash payment feature
    pub cash_payment_enabled: bool,
}

// .env
CASH_PAYMENT_ENABLED=true
```

---

## Keamanan & Otorisasi

### Role-Based Access

| Action | Admin | Operator | Customer |
|--------|-------|----------|----------|
| View pending payments | ✅ | ✅ | ❌ |
| Mark as cash | ✅ | ✅ | ❌ |
| Cancel payment | ✅ | ❌ | ❌ |
| Refund | ✅ | ❌ | ❌ |

### Audit Trail

Semua aksi cash payment dicatat di `payment_events`:

```sql
INSERT INTO payment_events (
  payment_id, 
  booking_code, 
  status, 
  actor, 
  note, 
  raw_payload
) VALUES (
  $1, $2, 'paid', 
  $3,  -- admin user id
  'Cash payment - kasir utama',
  '{"channel": "cash", "method": "manual"}'
);
```

---

## Skenario Penggunaan

### Skenario 1: Customer Scan QR, Bayar Tunai

```
1. Customer scan QR code → /w/MEJA-01
2. Pilih durasi 3 jam
3. VA terdaftar di MAJA, tampil di halaman
4. Customer tidak jadi transfer, datang ke kasir
5. Operator cek dashboard → ada "pending"
6. Operator terima pembayaran Rp 45.500
7. Operator klik "💵 Bayar Tunai"
8. Status payment = "paid", booking = "confirmed"
9. Selesai!
```

### Skenario 2: Multi-Meja dalam Satu Sesi

```
1. Customer scan QR meja A-01
2. Pindah ke meja B-02 (scan lagi)
3. Buat payment baru untuk meja B-02
4. Di kasir, customer bayar untuk SEMUA pesanan
5. Operator bulk-mark sebagai "paid"
```

### Skenario 3: VA Expired, Bayar Tunai

```
1. VA expired setelah 30 menit
2. Payment status = "expired" (via cron job)
3. Customer datang ke kasir dengan bukti
4. Operator bisa:
   a. Cancel expired payment
   b. Create new payment + mark as cash
   c. Langsung mark expired as cash (configurable)
```

---

## Perbandingan dengan VA

| Aspek | Virtual Account (VA) | Cash |
|-------|----------------------|------|
| Proses | Otomatis via MAJA | Manual oleh operator |
| Notifikasi | Webhook dari MAJA | Klik button |
| Biaya Admin | Rp 3.500/transaction | Rp 0 |
| Real-time | Ya | Ya (setelah operator proses) |
| Offline | ❌ | ✅ |
| Audit | MAJA logs | Database logs |

---

## Roadmap Implementasi

### Phase 1: Core (MVP)
- [ ] Rename DemoPanel → CashPaymentPanel
- [ ] Update label dan text
- [ ] Endpoint POST /mark-cash
- [ ] Admin payment list dengan filter
- [ ] Basic dashboard widget

### Phase 2: Enhancement
- [ ] Bulk cash payment
- [ ] Payment history dengan filter channel
- [ ] Receipt printing
- [ ] Note/catatan field

### Phase 3: Advanced
- [ ] Cash drawer management
- [ ] End-of-day cash report
- [ ] Integration dengan POS system
- [ ] Receipt via WhatsApp/Email

---

## Troubleshooting

### Q: Payment tidak bisa di-mark cash?
A: Pastikan:
- Payment status = `issued` (bukan `paid`, `cancelled`, `failed`)
- User punya role `admin` atau `operator`

### Q: Button "Bayar Tunai" tidak muncul?
A: Pastikan:
- `VITE_CASH_PAYMENT_ENABLED=true` di .env
- Frontend sudah di-rebuild setelah perubahan

### Q: Payment sudah paid tapi booking belum confirmed?
A: Trigger `mark-cash` harus juga update booking status. Cek di backend handler.

---

## Referensi

- **Webhook Simulator Original:** `frontend/src/components/flow/DemoPanel.tsx`
- **Payment API:** `src/api/admin.rs`
- **Payment Model:** `src/models.rs`
- **Payment Events:** `src/webhook.rs`
