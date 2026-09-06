# Materi: Rust, Cargo, dan Auth Keycloak

Dibuat untuk junior programmer yang baru bergabung dengan project **qr-payment**.

---

## 1. Rust itu apa?

**Rust** adalah bahasa pemrograman seperti C/C++, tapi lebih aman dan modern.

Ciri utamanya:
- Aman dari bug memori umum (seperti salah akses memori, null pointer, data race).
- Cepat, seperti bahasa sistem level rendah.
- Static typing: tipe data diketahui saat kompilasi.
- Sintaksnya mirip bahasa modern, punya fitur seperti pattern matching, error handling eksplisit, dan ownership system.

Karena ini backend API, Rust dipakai di sini untuk:
- Menentukan endpoint REST.
- Berinteraksi dengan database (PostgreSQL).
- Komunikasi ke Keycloak (autentikasi) dan MAJA (pembayaran).

---

## 2. Project Rust struktur biasa

Projek Rust biasanya punya folder seperti ini:

```
qr-payment/
├── Cargo.toml          # daftar 의존성, nama project, versi Rust
├── src/
│   ├── main.rs         # titik masuk program
│   ├── auth.rs         # logika autentikasi
│   ├── config.rs       # konfigurasi dari environment
│   └── ...
└── migrations/         # script database
```

Intinya:
- **`Cargo.toml`** = metadata dan daftar library yang dipakai.
- **`src/`** = kode sumber utama.
- File besar biasanya dibagi jadi beberapa module, misalnya `auth.rs`, `config.rs`, `models.rs`, dsb.

---

## 3. Cargo itu apa?

**Cargo** adalah package manager dan build tool untuk Rust.

Tugas utama:
- Mengelola library eksternal (dependency).
- Membangun projek.
- Menjalankan kode, test, dan pemeriksaan kode.

Perintah umum:
- `cargo run`
  Menjalankan program.
- `cargo build`
  Membangun binary.
- `cargo check`
  Cek apakah kode benar secara tipe dan sintaks (lebih cepat daripada build penuh).
- `cargo test`
  Menjalankan test.
- `cargo add <nama-library>`
  Menambahkan library ke `Cargo.toml`.

Contoh: kalau mau menambah library HTTP, bisa pakai `cargo add reqwest` (jika sesuai kebutuhan).

---

## 4. Kenapa pakai Cargo?

Karena dia:
- Otomatis mengelola versi library.
- Mudah menambah/hapus library.
- Memastikan semua developer pakai dependency yang seragam.
- Mendukung build dan check dengan perintah standar.

JadiCargo seperti “npm untuk Rust” atau “pip + build tool” sekaligus.

---

## 5. Hello world kecil di Rust

Contoh sederhana:

```rust
fn main() {
    let nama = "qr-payment";
    println!("Halo dari {}", nama);
}
```

Penjelasan:
- `fn main()` adalah fungsi pertama yang dijalankan.
- `let` membuat variabel.
- `println!` adalah macro untuk mencetak teks ke console.

---

## 6. Error di Rust sering diexpose secara eksplisit

Di Rust, error tidak sering “dilempar” seperti di bahasa lain. Biasanya error dikembalikan sebagai tipe `Result`.

Contoh pola umum:

```rust
fn baca_config() -> Result<Config, Error> {
    // kalau sukses: Ok(config)
    // kalau gagal: Err(error)
}
```

Jadi developer harus menangani dua kasus:
- Sukses (`Ok`)
- Gagal (`Err`)

Ini membuat error lebih terlihat dan tidak bisa diabaikan dengan mudah.

---

## 7. Keycloak singkatnya

**Keycloak** adalah layanan autentikasi/otorisasi berbasis OIDC.

Fungsinya:
- Tempat user login.
- Mengelola user, role, client, dan session.
- Memberikan token setelah login berhasil.

Dalam project ini, Keycloak dipakai sebagai:
- Provider OIDC untuk login pengguna.
- Sumber data user dan identitas (melalui token ID).

---

## 8. Alur login dengan Keycloak (OIDC authorization code flow)

Sederhananya:

1. User klik login di aplikasi.
2. Backend mengarahkan user ke Keycloak.
3. User memasukkan kata sandi di Keycloak.
4. Keycloak mengarahkan kembali ke aplikasi dengan code.
5. Backend menukar code dengan token.
6. Backend membaca informasi user dari token.
7. Backend membuat session aplikasi.

Jadi backend tidak menerima password langsung dari user. Password tetap berada di Keycloak.

---

## 9. Token yang biasa dipakai

Dalam OIDC/Keycloak, ada beberapa token:

- **Authorization code**
  Kode sementara yang diberikan Keycloak setelah login.
- **ID token**
  Berisi informasi identitas user, biasanya dalam bentuk JWT.
- **Access token**
  Dipakai untuk akses API, biasanya juga JWT.

Di project ini, ID token dipakai untuk:
- Membaca klaim user seperti sub, username, email, name.
- Verifikasi identitas saat callback login.

---

## 10. Backend qr-payment pakai auth Keycloak seperti apa?

App ini menggunakan pola yang cukup umum:

- User dikirim ke Keycloak untuk login.
- Backend memverifikasi ID token.
- Backend menyimpan session pengguna di sisi aplikasi.
- Endpoint admin memerlukan session aktif.

Saat ini pola auth-nya bersifat **otentikasi terlebih dahulu**:
- Keycloak menjawab siapa user.
- Backend menentukan apakah user boleh masuk ke area admin berdasarkan session.
- Setelah login berhasil, user diarahkan ke halaman admin.

Catatan:
- Backend tidak menyimpan password.
- Backend tidak membandingkan username/password secara manual.
- Keycloak yang menangani proses autentikasi.

---

## 11. Role dalam Keycloak

**Role** adalah label yang menunjukkan apa yang bisa dilakukan user.

Contoh:
- `admin`
- `operator`
- `customer`

Role bisa:
- Realm role: berlaku di seluruh realm.
- Client role: berlaku hanya untuk client tertentu.

Dalam Keycloak, role bisa dimasukkan ke token jika dikonfigurasi sesuai.

---

## 12. Kenapa role penting?

Role membantu aplikasi memutuskan:
- Apakah user boleh mengakses admin page.
- Apakah user boleh mengubah pengaturan venue.
- Apakah user hanya bisa melihat halaman pembayaran.

Jadi role bukan tentang siapa user, tapi tentang **apa yang diizinkan**.

---

## 13. Pencocokan role di aplikasi

Ada dua pendekatan umum:

1. **Cek role di Keycloak**
   Keycloak memutuskan user mana yang boleh login ke aplikasi.

2. **Cek role di aplikasi**
   Keycloak hanya memberi identitas, aplikasi sendiri yang memutuskan akses berdasarkan role atau aturan lain.

Aplikasi bisa:
- Membaca role dari token.
- Menyimpan role dalam session.
- Mengecek role di setiap endpoint yang dilindungi.

---

## 14. Perbedaan cara pandang: diary-maja-id dan qr-payment

Dua aplikasi ini memiliki pendekatan auth yang bisa berbeda:

- diary-maja-id
  Lebih mengandalkan Keycloak hanya untuk autentikasi.
  Setelah login, user dianggap authenticated dan aplikasi menentukan akses lebih lanjut.

- qr-payment
  Sebelumnya memiliki pengecekan role di callback login.
  Artinya, hanya user tertentu yang boleh login langsung ke aplikasi.

Keduanya valid. Yang dipilih tergantung kebutuhan produk.

---

## 15. Istilah yang sering muncul

- **Issuer URL**
  Alamat dasar Keycloak realm dalam format OIDC.
- **Client ID**
  Nama aplikasi di Keycloak.
- **Client Secret**
  Rahasia yang dipakai aplikasi untuk komunikasi dengan Keycloak.
- **Redirect URI**
  Tempat Keycloak mengembalikan user setelah login.
- **PKCE**
  Mekanisme tambahan untuk keamanan pada alur kode.
- **Session**
  상태 login yang disimpan di sisi aplikasi.
- **Claim**
  Informasi dalam token, misalnya id, email, name.

---

## 16. Cara membaca kode auth di qr-payment

Jika membaca `src/auth.rs`, perhatikan alur ini:

1. `login`
   Membuat URL login dan menyimpan beberapa state sementara di session.
2. `callback`
   Menerima kembali dari Keycloak, menukar code dengan token, memverifikasi token, lalu membuat session.
3. `logout`
   Menghapus session aplikasi.
4. `me`
   Menjelaskan user yang sedang login, jika ada.

Bagian lain:
- `upsert_user`
  Menyimpan atau memperbarui data user berdasarkan informasi dari Keycloak.
- `find_user`
  Mencari user berdasarkan id.

Alurnya tidak harus dipahami sekaligus. Pahami satu fungsi pada satu waktu.

---

## 17. Tips belajar

- Jika bingung, cari fungsi `login` dan `callback` terlebih dahulu.
- Ingat alurnya: redirect → code → token → session.
- Keycloak menangani login, aplikasi menangani session.
- Jika ingin tahu cara konfigurasi, lihat environment variable dan config.
- Jika ingin tahu role, lihat:
  - konfigurasi Keycloak
  - logika pengecekan di backend
  - hal-hal yang dilindungi di API

---

## 18. Ringkasan

- Rust adalah bahasa backend yang aman dan cepat.
- Cargo adalah alat bantu membuat dan mengelola projek Rust.
- Keycloak adalah layanan login berbasis OIDC.
- Backend qr-payment memakai Keycloak untuk autentikasi, lalu membuat session sendiri.
- Role adalah hak akses yang bisa dikelola di Keycloak dan/atau di aplikasi.

Jika masih bingung, tanyakan pada bagian spesifik: Rust, Cargo, atau Keycloak.
