# Deployment ke Production — qr-payment

Rujukan tunggal untuk men-deploy `qr-payment` ke server. Image dibangun **di server**
(build in-place): `PULL-REPO.sh` menyinkronkan git di `/opt/qr-payment/src`, lalu
`UPDATE-PROD-BACKEND.sh` / `UPDATE-PROD-FRONTEND.sh` menjalankan `docker build` dan
`docker compose up -d --force-recreate`. Tidak ada push/pull Docker Hub.

Aplikasi hanya perlu listen di satu port HTTP; TLS dan load balancer ditangani
infrastruktur luar.

---

## 1. Arsitektur

```
Load balancer / TLS (infra)
        │
        ▼  http://SERVER:8091
┌───────────────┐   /api/*  ┌──────────────────┐
│ web           │   /auth/* │ api              │
│ nginx + dist  │──────────▶│ Axum :3000       │──▶ PostgreSQL eksternal
│ (frontend)    │           │ (backend)        │     (DATABASE_URL)
└───────────────┘           └──────────────────┘
                                   │
                                   └──▶ Keycloak (account.maja.id)
                                   └──▶ MAJA billing (H2H)
```

Yang penting dipahami:

- Hanya `web` yang mempublish port (**8091**). `api` memakai `expose`, jadi backend
  tidak bisa dihubungi langsung dari internet.
- Frontend dan API **satu origin** (nginx mem-proxy `/api/` dan `/auth/`), sehingga
  cookie session tidak bermasalah CORS maupun SameSite.
- `/auth/` ikut di-proxy karena Keycloak callback mendarat di `BASE_URL/auth/callback`,
  bukan di jalur `/api/`.
- Database **tidak** ada di compose production; alamatnya dari `DATABASE_URL` di
  `/opt/qr-payment/.env`.

---

## 2. Yang wajib dibereskan sebelum deploy

### 2.1 Berkas env di server

Urutan lengkapnya: clone repo dulu (§3), baru buat berkas ini. Berkas `.env`
sengaja tinggal di `/opt/qr-payment/`, bukan di dalam repo, supaya `PULL-REPO.sh`
(`git reset --hard`) tidak pernah menyentuhnya.

```bash
sudo mkdir -p /opt/qr-payment
sudo cp /opt/qr-payment/src/deploy/.env.example /opt/qr-payment/.env
sudo vi /opt/qr-payment/.env
sudo chmod 600 /opt/qr-payment/.env
```

Isi yang wajib benar:

| Variabel | Catatan |
| --- | --- |
| `DATABASE_URL` | Host database **eksternal**, bukan `localhost` — `api` berjalan di jaringan Docker sendiri. |
| `BASE_URL` | Origin publik backend. Dipakai menyusun redirect URI OIDC. |
| `APP_URL` | Origin publik frontend (redirect setelah login). |
| `PUBLIC_ORIGIN` | Origin publik yang ditanam ke bundle frontend saat build. Isi sama dengan `BASE_URL`. |
| `SESSION_SECURE=true` | Wajib di production; TLS diterminasi di load balancer. |
| `OIDC_CLIENT_SECRET` | Dari Admin Console Keycloak. |
| `MAJA_*` | Tanpa ini endpoint payment membalas 503, bukan gagal diam-diam. |

`PUBLIC_ORIGIN` dibaca compose saat **build**, jadi berkas ini harus di-source lebih
dulu — ketiga skrip deploy sudah melakukannya. Kalau menjalankan compose manual:

```bash
set -a; . /opt/qr-payment/.env; set +a
```

### 2.2 Redirect URI di Keycloak

Client `qr-payment` di realm `maja` harus mendaftarkan:

```
BASE_URL/auth/callback
APP_URL/*
```

Kalau origin publik berubah, dua tempat harus ikut berubah: `BASE_URL`/`APP_URL` di
`.env` **dan** daftar redirect URI di Keycloak. Kalau tidak, login akan gagal dengan
`invalid_redirect_uri` — bukan error aplikasi.

### 2.3 Hak database

Aplikasi menjalankan migrasi sendiri saat start (`sqlx::migrate!()` di `src/main.rs`).
User database di `DATABASE_URL` karena itu butuh hak **DDL** (CREATE/ALTER TABLE).
Selain itu `tower-sessions` membuat tabel session-nya sendiri saat boot.

### 2.4 Rahasia yang sudah ter-commit

`.env.example` dan `frontend/.env.example` di repo memuat kredensial yang terlihat
seperti production (`MAJA_CLIENT_SECRET`, `MAJA_PASSWORD`, `OIDC_CLIENT_SECRET`,
`MAJA_USERNAME`) dan keduanya terlacak git. Rotasi kredensial itu, lalu kosongkan
nilainya di `.env.example` — berkas contoh tidak seharusnya menjadi tempat rahasia.

---

## 3. Build dan jalankan

```bash
sudo mkdir -p /opt/qr-payment
sudo git clone <repo-url> /opt/qr-payment/src     # sekali saja
cd /opt/qr-payment/src

chmod +x deploy/*.sh
./deploy/UPDATE-PROD-BACKEND.sh
./deploy/UPDATE-PROD-FRONTEND.sh
```

Manual, kalau lebih suka melihat langkahnya:

```bash
cd /opt/qr-payment/src
set -a; . /opt/qr-payment/.env; set +a

docker build -f deploy/Dockerfile.api -t qrpay-v-backend:latest .
docker build --build-arg VITE_API_BASE_URL="$PUBLIC_ORIGIN" -t qrpay-v-frontend:latest frontend

docker compose -f deploy/docker-compose.yml up -d --force-recreate api web
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f api
```

Build backend pertama kali mengompilasi seluruh dependency Rust (beberapa menit).
Build berikutnya hanya mengompilasi ulang crate aplikasi karena dependency sudah
ada di lapisan cache.

### Kenapa build-arg wajib

`frontend/src/lib/api/client.ts` memilih transport dari `VITE_API_BASE_URL`:

| Nilai | Perilaku |
| --- | --- |
| tidak diisi | **mode demo** — data palsu di browser, tanpa menyentuh backend |
| diisi | memanggil backend sungguhan |

Karena itu `deploy/docker-compose.yml` menolak jalan bila `PUBLIC_ORIGIN` kosong, dan
`frontend/Dockerfile` gagal bila `VITE_API_BASE_URL` kosong. Lebih baik build gagal
daripada menghasilkan image yang menampilkan data demo di production.

---

## 4. Migrasi database

Tidak ada langkah manual: `api` menjalankan `sqlx::migrate!()` saat start dan
mencatat `database migrations applied` di log. Migrasi disematkan ke dalam biner saat
build, jadi image dan skema selalu sepasang.

Yang perlu diingat:

- Migrasi berjalan **sebelum** server siap menerima request. Kalau migrasi gagal
  (mis. hak DDL kurang), container keluar dan `restart: unless-stopped` akan mencoba
  lagi terus-menerus — cek `docker compose logs api` saat itu terjadi.
- Rollback image **tidak** membatalkan migrasi. Jaga migrasi tetap aditif
  (kolom nullable, `CREATE TABLE IF NOT EXISTS`) supaya versi lama tetap jalan.

---

## 5. Verifikasi

```bash
curl -s  http://SERVER:8091/api/health
curl -s  http://SERVER:8091/api/v1/public/settings | head -c 200
curl -s  http://SERVER:8091/api/v1/workspaces | head -c 300
curl -sI http://SERVER:8091/ | head -3
curl -sI http://SERVER:8091/w/meja-12 | head -3          # harus 200 (SPA fallback)
curl -s  http://SERVER:8091/api/tidak-ada                 # harus 404 JSON, bukan HTML
```

Lalu cek manual di browser:

- [ ] Halaman depan memuat dan **datanya dari database**, bukan data demo
- [ ] Scan/klik QR sebuah meja → halaman pembayaran tampil dengan tarif sebenarnya
- [ ] Login Keycloak berhasil dan tetap login setelah refresh (uji cookie lewat proxy)
- [ ] Halaman `/admin` membuka dashboard, kelola workspace, locker, dan settings
- [ ] Webhook MAJA mendarat di `/api/v1/payments/callback` (uji dengan payload uji)
- [ ] `docker compose logs api` menunjukkan `MAJA H2H dikonfigurasi`, bukan peringatan 503

---

## 6. Alur update versi berikutnya

Repo ini punya dua remote: `origin` (agungdyo) dan `makaramas`. Urutan yang dipakai:

```bash
# di mesin lokal
git push origin master
git push makaramas master

# di server
cd /opt/qr-payment/src
./deploy/PULL-REPO.sh
./deploy/UPDATE-PROD-BACKEND.sh     # kalau ada perubahan Rust
./deploy/UPDATE-PROD-FRONTEND.sh    # kalau ada perubahan frontend atau konfigurasi nginx
```

`PULL-REPO.sh` melakukan `git reset --hard origin/master`, jadi perubahan yang
dilakukan langsung di server akan hilang.

Catatan: perubahan backend **wajib** memakai `up -d --force-recreate api`, bukan
`docker compose restart api`. `restart` hanya mengulang container lama, sehingga image
baru tidak terpakai sama sekali.

---

## 7. Rollback

```bash
cd /opt/qr-payment/src/deploy
docker compose down

# tandai image terakhir yang masih sehat, lalu:
docker tag qrpay-v-backend:latest qrpay-v-backend:rollback
git checkout <commit-lama>
./UPDATE-PROD-BACKEND.sh
./UPDATE-PROD-FRONTEND.sh
```

Migrasi database tidak ikut di-rollback otomatis. Karena itu simpan tag image sebelum
setiap deploy:

```bash
docker tag qrpay-v-backend:latest qrpay-v-backend:$(date +%Y%m%d-%H%M)
docker tag qrpay-v-frontend:latest qrpay-v-frontend:$(date +%Y%m%d-%H%M)
```

---

## 8. Yang belum bisa dianggap aman

Daftar ini sengaja ditulis supaya tidak dianggap sudah beres:

- **Origin publik tertanam di bundle frontend saat build.** Image `web` tidak bisa
  dipindah antar environment tanpa build ulang dengan `PUBLIC_ORIGIN` yang berbeda.
  Alternatifnya perlu mengubah `frontend/src/lib/api/client.ts` supaya nilai kosong
  berarti "origin yang sama" alih-alih "mode demo" — mis. membedakan
  `VITE_API_BASE_URL === undefined` (demo) dari `''` (relatif). Belum dikerjakan.
- **`CorsLayer::permissive()`** masih aktif di `src/main.rs`. Di belakang nginx
  satu origin, CORS tidak diperlukan; sebaiknya diganti daftar origin yang eksplisit.
- **Belum ada health check untuk `api`** dan belum ada monitoring. Andalkan
  `restart: unless-stopped` dan `docker compose logs`.
- **Kredensial di `.env.example`** (lihat 2.4) belum dirotasi.
- **`SESSION_SECURE`** harus `true`; kalau salah, browser tetap menerima cookie di
  HTTP dan sesi admin bisa terekspos.
- **`/api/health` tidak memeriksa database** — ia hanya membuktikan proses hidup.
- Port publik 8091; pastikan tidak bertabrakan dengan aplikasi lain di server yang sama.
