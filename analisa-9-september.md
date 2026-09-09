# Analisa 9 September — Race Condition Login/Logout & Migrasi Session Store ke Redis

Project: `qr-payment` (Rust + Axum + `tower-sessions 0.14` + Keycloak OIDC)

---

## 1. Akar Masalah Race Condition (sudah diperbaiki)

| # | Masalah | Fix yang sudah diterapkan |
|---|---|---|
| 1 | Session expiry `OnInactivity(30s)` — login gagal jika user >30 detik di halaman Keycloak (store menolak session lewat `expiry_date`), admin ke-logout sendiri saat baca dashboard | Expiry diubah ke **8 jam** di `src/main.rs` |
| 2 | Logout pakai `session.delete()` lalu `session.save()` — `save()` di PostgresStore adalah **UPSERT** (`ON CONFLICT DO UPDATE`) sehingga row session yang sudah login **dihidupkan lagi** → logout batal | Ganti ke **`session.flush()`** (hapus row + cookie), hapus `Set-Cookie` manual |
| 3 | Callback `error=already_logged_in` (login ganda di tab lain) membersihkan flow tab yang masih berjalan → login tab pertama gagal | **Restart flow** ke `/auth/login` (Keycloak re-issue code karena SSO aktif) |
| 4 | `println!` debug membocorkan ID token & claims ke log | Dihapus |

Status: `cargo check` + `cargo test` (3 test) **lolos**.

---

## 2. Analisa: Postgres Store vs Redis

### Performa
- Session saat ini **minimal** (`user_id` + `id_token`), hanya dipakai oleh 4 endpoint auth + extractor `AdminAuth` (~15 route admin).
- **Public payment API tidak menyentuh session** → performa pembayaran pelanggan tidak terpengaruh apa pun pilihan store.
- Redis lookup ~0.1–0.5ms vs Postgres ~0.5–2ms → **selisihnya noise** di skala app ini.

### Struktur kode (perubahan kecil)
Karena `tower-sessions` mengabstraksi store di balik trait `SessionStore`, `auth.rs`, `admin.rs`, `error.rs` **tidak berubah sama sekali** (hanya pakai `tower_sessions::Session`).

### Jika Postgres store dihapus (aman ✅)
- Store Postgres **hanya** dipakai di `src/main.rs` (baris 27, 50–51).
- `rmp-serde` ikut hilang dari dependency tree.
- Tabel `tower_sessions.session` yang sudah ada jadi **orphan** — tidak berbahaya, bisa di-drop manual sekali.
- Migrasi data app (`sqlx::migrate!()` di `migrations/`) **terpisah** — tidak tersentuh.

### Trade-off operasional Redis ⚠️
| Aspek | Konsekuensi |
|---|---|
| Redis down | Semua auth gagal — *single point of failure* baru |
| Restart Redis tanpa persistence | Semua admin ke-logout massal → **aktifkan RDB/AOF** |
| TTL | Auto-expire via `OnInactivity` → masalah row expired menumpuk di Postgres **hilang**, tidak perlu job GC |

### Keputusan
**Ganti penuh ke Redis, hapus total store Postgres.** Satu sumber kebenaran session, tidak ada kode mati, TTL otomatis, tanpa `migrate()`.

---

## 3. Prompt Siap Pakai (copy-paste ke model murah)

> Project `qr-payment` (Rust + Axum + tower-sessions 0.14). Ganti session store dari PostgreSQL ke Redis dan pastikan alur login/logout OIDC Keycloak bebas race condition. Kerjakan langkah-langkah berikut secara berurutan:
>
> 1. **`Cargo.toml`**: ganti dependency `tower-sessions-sqlx-store` dengan `tower-sessions-redis-store = "0.14"` (klien Redis memakai crate `fred`). Tambahkan `fred = { version = "8", features = ["enable-rustls"] }` bila diperlukan, atau ikuti dokumentasi resmi `tower-sessions-redis-store` versi 0.14.
> 2. **`src/config.rs`**: tambah field `redis_url: String` dan baca dari env `REDIS_URL` (default `redis://localhost:6379`).
> 3. **`src/main.rs`**:
>    - Hapus `use tower_sessions_sqlx_store::PostgresStore;` dan pemanggilan `session_store.migrate().await?`.
>    - Ganti inisialisasi store menjadi:
>      ```rust
>      use fred::prelude::*;
>      use tower_sessions_redis_store::RedisStore;
>
>      let redis_pool = RedisPool::new(RedisConfig::from_url(&config.redis_url)).unwrap();
>      redis_pool.init().await.unwrap();
>      redis_pool.wait_for_connect().await.unwrap();
>      let session_store = RedisStore::new(redis_pool);
>      ```
>    - Pertahankan pengaturan layer yang sudah ada: cookie name dari config, `SameSite::Lax`, `Expiry::OnInactivity(8 jam)`.
> 4. **`.env.example` & `.env`**: tambah baris `REDIS_URL=redis://localhost:6379`.
> 5. **`docker-compose.yml`**: tambah service `redis` (image `redis:7-alpine`, port `6379:6379`, volume untuk persistence RDB/AOF, healthcheck `redis-cli ping`). Backend/service lain menunggu `redis` sehat via `depends_on`.
> 6. **JANGAN ubah** `src/auth.rs`, `src/api/admin.rs`, `src/error.rs` — kode mereka store-agnostic dan sudah benar. Pastikan saja tetap: handler logout memakai `session.flush()` (bukan `delete()` + `save()`), callback menangani `error=already_logged_in` dengan redirect ke `/auth/login`, dan tidak ada `println!` yang membocorkan token.
> 7. **Verifikasi**: jalankan `cargo check` lalu `cargo test`, keduanya harus lolos tanpa error.
>
> Jangan mengubah logika OIDC, jangan menambah dependency lain di luar yang disebutkan, dan jangan mengubah nama/struktur endpoint API.

---

## 4. Checklist Verifikasi Setelah Implementasi

- [ ] `cargo check` & `cargo test` lolos
- [ ] `docker-compose up -d redis` jalan + healthcheck `redis-cli ping` → `PONG`
- [ ] Login via `/auth/login` → Keycloak → callback → redirect `/admin` (session tersimpan di Redis, cek `KEYS *`)
- [ ] Logout → session terhapus dari Redis, cookie hilang, mendarat di `/auth/login`
- [ ] Keycloak: `http://localhost:3000/auth/login` terdaftar di **Valid post logout redirect URIs** client `qr-payment`
- [ ] Production: `SESSION_SECURE=true`, `APP_URL` di-set ke origin frontend asli