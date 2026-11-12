# QR Payment — Technical Debt & Shortcut Ledger (Agent 007)

> Dokumen pencatatan utang teknis (*technical debt*) dan simplifikasi/shortcut arsitektural pada proyek QR Payment (Rust backend + React frontend).  
> Dibuat berdasarkan audit Ponytail Debt, dikelompokkan berdasarkan tingkat risiko (*Tinggi*, *Sedang*, *Rendah*).

---

## Ringkasan Eksekutif

| Tingkat Risiko | Jumlah Temuan | Fokus Perhatian Utama |
| :--- | :---: | :--- |
| 🔴 **Tinggi** | 4 | Keamanan Webhook, Race Condition Booking, Data Inconsistency UI & Backend |
| 🟡 **Sedang** | 4 | Concurrency Cron Jobs, Skalabilitas Query Admin, Fallback Mock Frontend |
| 🟢 **Rendah** | 3 | Multi-venue Modeling, Soft-delete Data, Unimplemented UI Button |
| **Total** | **11** | **11 item berstatus `no-trigger` (tanpa trigger otomatis di kode)** |

---

## 1. Risiko Tinggi (High Risk)

Shortcut atau celah arsitektural yang berpotensi menimbulkan kerentanan keamanan, integritas finansial, atau data corrupt di produksi.

### [DEBT-HIGH-01] Webhook Notification Tanpa Verifikasi Signature / HMAC
- **Lokasi:** `src/webhook.rs:20-58`
- **Simplifikasi:** Endpoint callback MAJA (`POST /api/v1/payments/callback`) langsung membaca payload JSON tanpa memverifikasi signature kriptografis (HMAC), bearer secret, ataupun validasi header pengirim.
- **Ceiling:** Hanya aman di lingkungan dev internal atau bila traffic berada di balik reverse proxy dengan IP allowlist MAJA yang sangat ketat.
- **Upgrade Path:** Tambahkan validasi signature/secret atau middleware IP filter di tingkat aplikasi sebelum dibuka ke publik.
- **Status:** `no-trigger`

### [DEBT-HIGH-02] Resume Open Payment Mengabaikan Identitas Pelanggan
- **Lokasi:** `src/api/public.rs:79-90`
- **Simplifikasi:** Fungsi `initiate_payment` langsung menggunakan kembali VA aktif terakhir di workspace yang sama (`WHERE b.workspace_code = $1 AND p.status = 'issued' AND p.inactive_date > now()`). Karena sistem walk-in tidak memiliki sesi customer, customer baru yang memindai QR meja dalam jendela 10 menit dipaksa memakai invoice/durasi customer sebelumnya.
- **Ceiling:** Berlaku aman hanya bila 1 meja tidak pernah dipindai oleh orang berbeda dalam rentang 10 menit.
- **Upgrade Path:** Gunakan ephemeral device token / cookie sesi customer untuk membedakan pembuat transaksi, atau sediakan opsi "Buat Tagihan Baru" di frontend.
- **Status:** `no-trigger`

### [DEBT-HIGH-03] Tidak Ada Concurrency Lock / Constraint Range pada Booking
- **Lokasi:** `src/api/public.rs:101-127`
- **Simplifikasi:** Query `INSERT INTO bookings` dijalankan tanpa PostgreSQL GiST exclusion range constraint (`workspace_code`, `tstzrange(start_at, end_at)`) maupun locking transaksional (`SELECT ... FOR UPDATE`).
- **Ceiling:** Trafik walk-in rendah di mana probabilitas dua pengguna menekan bayar di detik yang persis sama mendekati nol.
- **Upgrade Path:** Tambahkan constraint exclusion range PostgreSQL atau implementasikan lock transaksional untuk mencegah *double-booking*.
- **Status:** `no-trigger`

### [DEBT-HIGH-04] Ketidaksinkronan UI DatePicker dengan Payload Backend
- **Lokasi:** `frontend/src/pages/PaymentFlowPage.tsx:164-168` & `src/models.rs:228-233`
- **Simplifikasi:** UI menyediakan pemilihan "Pesan Hari Lain" dan DatePicker, namun fungsi `api.initiatePayment` dan struct backend `InitiatePaymentRequest` hanya menerima `hours` dan selalu menetapkan `start_at = now()`.
- **Ceiling:** Hanya valid jika customer memesan untuk hari ini ("Pesan Hari Ini").
- **Upgrade Path:** Perluas DTO `InitiatePaymentRequest` dan database booking agar menerima parameter tanggal/waktu mulai reservasi.
- **Status:** `no-trigger`

---

## 2. Risiko Sedang (Medium Risk)

Simplifikasi yang membatasi kemampuan scaling horizontal atau efisiensi operasional saat volume penggunaan bertambah.

### [DEBT-MED-01] Background Cron Jobs In-Process Tanpa Distributed Lock
- **Lokasi:** `src/jobs.rs:6-10`
- **Simplifikasi:** Tiga background jobs (`expire_pending`, `reconcile_open_vas`, `complete_sessions`) dijalankan via thread in-process `tokio::spawn` dengan interval timer mandiri.
- **Ceiling:** Single-instance backend (hanya berjalan pada 1 replica/container).
- **Upgrade Path:** Gunakan `pg_try_advisory_lock` atau Redis distributed lock ketika backend di-deploy multi-replica agar tidak terjadi duplikasi request ke gateway MAJA.
- **Status:** `no-trigger`

### [DEBT-MED-02] Endpoint Admin Payments Tanpa Paginasi & Filter Komprehensif
- **Lokasi:** `src/api/admin.rs:239-255`
- **Simplifikasi:** Endpoint `GET /api/v1/admin/payments?limit=N` hanya mengambil data dengan batas baris tanpa mendukung offset/cursor pagination, filter tanggal, status transaksi, maupun pencarian booking code.
- **Ceiling:** Di bawah 100 transaksi riil.
- **Upgrade Path:** Implementasikan paginasi dan filter multi-kriteria sesuai item roadmap `BE-009`.
- **Status:** `no-trigger`

### [DEBT-MED-03] Parsing Roles Keycloak Tanpa Verifikasi Signature JWKS
- **Lokasi:** `src/auth.rs:520-534`
- **Simplifikasi:** Fungsi `roles_from_access_token` mem-parse payload Base64 secara langsung tanpa validasi signature kriptografis dengan asumsi token diterima langsung melalui koneksi direct TLS ke Keycloak token endpoint.
- **Ceiling:** Aman selama token endpoint Keycloak terpercaya via direct HTTPS.
- **Upgrade Path:** Tambahkan validasi cryptographic signature menggunakan JWKS endpoint jika arsitektur otentikasi melibatkan forwarder atau token pihak ketiga.
- **Status:** `no-trigger`

### [DEBT-MED-04] Fallback Frontend ke In-Browser Mock Secara Otomatis
- **Lokasi:** `frontend/src/lib/api/client.ts:70-74`, `163-166`
- **Simplifikasi:** Frontend otomatis beralih ke `mockApi` di browser memory/localStorage saat `VITE_API_BASE_URL` kosong tanpa memberi notifikasi tegas ke pengguna/developer.
- **Ceiling:** Mode prototyping dan demonstrasi lokal.
- **Upgrade Path:** Pastikan environment produksi melempar error konfigurasi jika `VITE_API_BASE_URL` tidak diset untuk mencegah kerancuan data uji browser dengan data database riil.
- **Status:** `no-trigger`

---

## 3. Risiko Rendah (Low Risk)

Keterbatasan struktural ringan atau placeholder UI yang tidak berdampak langsung pada keandalan sistem inti.

### [DEBT-LOW-01] Konfigurasi Venue Menggunakan Single-Row Table
- **Lokasi:** `src/api/mod.rs:14-15` & `src/api/admin.rs:208-235`
- **Simplifikasi:** Informasi nama venue dan Wi-Fi disimpan dalam satu baris tabel `settings`, sehingga seluruh workspace terikat pada satu venue global.
- **Ceiling:** Hanya mendukung 1 lokasi cabang coworking space.
- **Upgrade Path:** Normalisasi skema database ke tabel `venues` saat sistem diperluas ke multi-cabang (roadmap `BE-018`).
- **Status:** `no-trigger`

### [DEBT-LOW-02] Hard Delete pada Entitas Locker
- **Lokasi:** `src/api/admin.rs:192-205`
- **Simplifikasi:** Penghapusan locker langsung menjalankan query `DELETE FROM lockers WHERE id = $1` tanpa rekam jejak historis.
- **Ceiling:** Fase scaffold sebelum locker dipasangkan dengan transaksi pembayaran pelanggan.
- **Upgrade Path:** Terapkan kolom soft-delete (`archived_at` / status `inactive`) ketika modul locker mulai terintegrasi dengan pemesanan (roadmap `BE-015`).
- **Status:** `no-trigger`

### [DEBT-LOW-03] Placeholder Tombol "Pesan Makan" di UI Flow
- **Lokasi:** `frontend/src/pages/PaymentFlowPage.tsx:320-330`
- **Simplifikasi:** Tombol "Pesan Makan" hanya menampilkan toast info "Fitur pesan makan segera hadir!" tanpa fungsionalitas backend.
- **Ceiling:** Mockup / presentasi UI ke stakeholder.
- **Upgrade Path:** Sembunyikan tombol hingga modul F&B selesai dibangun atau hubungkan dengan sistem kasir/menu terkait.
- **Status:** `no-trigger`
