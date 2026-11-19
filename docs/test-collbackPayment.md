# Tes Callback Pembayaran MAJA

Dokumen ini menjelaskan cara menguji `POST /api/payments/maja/callback` di local
dev dan produksi, termasuk pengujian whitelist IP.

## Aturan IP

| Lingkungan | IP yang diterima |
| --- | --- |
| Produksi | `108.136.89.40` |
| Local dev (`NODE_ENV` bukan `production`) | `108.136.89.40`, `127.0.0.1`, `::1` |

Di produksi, nginx adalah satu-satunya jalur masuk ke API. nginx mengisi
`X-Forwarded-For`, dan backend memakai `trust proxy = 1` sehingga `req.ip`
menjadi IP client asli. Jangan mengirim `X-Forwarded-For` palsu lewat nginx:
nilai tersebut tidak bisa menggantikan IP client yang dicatat nginx.

## Payload

| Field | Wajib | Keterangan |
| --- | --- | --- |
| `number` | salah satu | Nomor invoice pendaftaran (`registrations.invoice_number`) |
| `id` | salah satu | ID invoice MAJA (`registrations.maja_invoice_id`) |
| `code` | tidak | `00` menandakan pembayaran berhasil |
| `remainingAmount` | tidak | Sisa tagihan; harus `<= 0` agar dianggap lunas |
| `amount` | tidak | Nominal yang dibayar |
| `ref` | tidak | Referensi pembayaran dari MAJA |

Callback dengan `code=00` dan `remainingAmount<=0` akan menandai pendaftaran
sebagai `payment_status=paid`, mengisi `paid_at` dan `paid_amount`, serta
menyimpan payload ke `raw_payment_callback`. Callback yang sama dan berulang
bersifat idempoten.

Gunakan invoice/registrasi khusus tes. Data pembayaran akan berubah setelah
callback lunas diproses.

## Tes 1 — Localhost (curl lama)

Jalankan backend dengan `NODE_ENV` bukan `production`:

```text

curl -i -X POST http://localhost:3000/api/payments/maja/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "number": "REGB783B87591A4",
    "id": "1653865047824270567",
    "code": "00",
    "remainingAmount": 0,
    "amount": 86750,
    "ref": "801131790751056539"
  }'

```

Ekspektasi: HTTP `200` dan body `{"matched":true}` bila invoice ditemukan, atau
`{"matched":false}` bila tidak ditemukan.

Jika `NODE_ENV=production`, curl localhost ini akan ditolak dengan `403`.

## Tes 2 — Simulasi IP MAJA di local dev

Kirim `X-Forwarded-For` sesuai IP whitelist:

```bash
curl -i -X POST http://localhost:3000/api/payments/maja/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 108.136.89.40' \
  -d '{
    "number": "REGB783B87591A4",
    "id": "1653865047824270567",
    "code": "00",
    "remainingAmount": 0,
    "amount": 86750,
    "ref": "801131790751056539"
  }'
```

Ekspektasi: HTTP `200`.

## Tes 3 — IP di luar whitelist

```bash
curl -i -X POST http://localhost:3000/api/payments/maja/callback \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 108.135.1.2' \
  -d '{}'
```

Ekspektasi: HTTP `403` dengan pesan `IP tidak diizinkan`. Log backend mencatat
IP yang ditolak.

## Tes 4 — Payload tanpa `number` dan `id`

```bash
curl -i -X POST http://localhost:3000/api/payments/maja/callback \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Jalankan dari localhost (local dev) atau dengan header `X-Forwarded-For` yang
diizinkan. Ekspektasi: HTTP `200` dan body `{"matched":false}`.

## Tes 5 — Idempotensi

1. Kirim callback lunas dari Tes 1 atau Tes 2.
2. Catat `paid_at`, `paid_amount`, dan `raw_payment_callback`.
3. Kirim payload yang sama sekali lagi.

Ekspektasi: HTTP `200` dengan `{"matched":true,"idempotent":true}` dan data
pembayaran tidak berubah.

## Tes 6 — Produksi lewat nginx

Tes ini hanya bisa dilakukan dari sumber yang benar-benar memakai IP
`108.136.89.40`, karena nginx mencatat IP client sebenarnya.

```bash
curl -i -X POST https://<domain-api>/api/payments/maja/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "number": "REGB783B87591A4",
    "id": "1653865047824270567",
    "code": "00",
    "remainingAmount": 0,
    "amount": 86750,
    "ref": "801131790751056539"
  }'
```

Ekspektasi: HTTP `200` dari IP whitelist, atau `403` dari IP lain.

## Verifikasi database

```sql
SELECT
  registration_number,
  invoice_number,
  maja_invoice_id,
  status,
  payment_status,
  paid_at,
  paid_amount,
  raw_payment_callback
FROM registrations
WHERE invoice_number = 'REGB783B87591A4';
```

Yang perlu diperiksa setelah callback lunas:

- `payment_status` menjadi `paid`.
- `paid_at` dan `paid_amount` terisi.
- `raw_payment_callback` menyimpan payload terakhir.
- Callback berulang tidak mengubah nilai tersebut.

## Troubleshooting

| Gejala | Penyebab umum |
| --- | --- |
| `403` di local dev tanpa header | `NODE_ENV=production` aktif, atau IP bukan loopback |
| `403` dengan `X-Forwarded-For` | IP tidak sama dengan `108.136.89.40` |
| `403` di produksi | Sumber callback bukan `108.136.89.40` |
| `200` tetapi `matched:false` | `number`/`id` tidak cocok dengan data pendaftaran |
| Callback tidak menandai lunas | `code` bukan `00` atau `remainingAmount` masih `> 0` |
