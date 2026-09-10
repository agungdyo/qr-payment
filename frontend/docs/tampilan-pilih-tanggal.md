# Tampilan Pilih Tanggal Booking

## Latar belakang

Saat ini alur pemesanan masuk langsung ke layar pilihan durasi dan bank melalui `PaymentFlowPage`, setelah workspace berhasil dimuat. Fitur baru yang akan ditambahkan memungkinkan pengguna memilih apakah ingin memesan untuk **hari ini** atau **hari lain**. Pemilihan ini dilakukan sebelum layar durasi/bank muncul.

## Tujuan

1. Memberikan pengalaman booking yang lebih fleksibel, terutama untuk pengguna yang ingin memesan workspace di tanggal yang belum tiba.
2. Menyesuaikan alur pemesinan agar VA (Virtual Account) yang dibuat atau diselesaikan sesuai tanggal pemesanan yang dipilih.

## Alur yang diusulkan

### 1. Masuk ke halaman pemesanan

Pengguna membuka halaman pemesanan dari QR code atau tautan berbagi. Sebelum workspace dimuat lebih jauh, tampilkan **early choice layer** yang menawarkan dua opsi:

- **Hari ini** — untuk pemesanan yang akan dimulai hari ini.
- **Hari lain** — untuk pemesanan yang akan dimulai di tanggal mendatang.

Pilihan ini bersifat pre-condition, artinya ada sebelum reducer state machine berjalan dan sebelum `findOpenPayment` dipanggil.

### 2. Pemilihan tanggal

- Jika **hari ini** dipilih:
  - Lanjutkan ke boot workspace.
  - Coba cari VA terbuka sesuai logika yang ada saat ini.
  - Jika ada VA terbuka yang cocok dengan hari ini, lanjut ke layar VA.
  - Jika tidak ada, masuk ke layar durasi dan bank.
- Jika **hari lain** dipilih:
  - Munculkan **datepicker**.
  - Pengguna memilih tanggal mulai.
  - Setelah tanggal dikonfirmasi, boot workspace dan cari VA terbuka untuk tanggal pemesanan tersebut.
  - Jika ada VA terbuka untuk tanggal itu, lanjut ke layar VA.
  - Jika tidak ada, masuk ke layar durasi dan bank.

### 3. Setelah layar VA

- Tampilkan nomor VA, countdown, dan instruksi pembayaran.
- Deadline VA harus konsisten dengan tanggal dan jadwal yang sedang dipesan.
- Poling dan mekanisme otomatis tetap berjalan, dengan memastikan `inactiveDate` sesuai.

### 4. Setelah pembayaran berhasil

- Muncul e-ticket, termasuk informasi tanggal mulai jika diperlukan.

## Dampak pada state machine

### Opsi A: pilih tanggal sebelum reducer

- Tambahkan komponen pemilihan tanggal di luar state machine.
- Setelah pilihan dibuat, mulai flow normal ke dalam reducer.
- Kelebihan:
  - Flow utama state machine tidak bertambah terlalu banyak fase.
  - Pilihan tanggal terpisah dari logika inti VA dan pembayaran.
- Kekurangan:
  - Perlu penanganan transisi tersendiri antar komponen.

### Opsi B: tambah fase di dalam state machine

- Tambahkan fase khusus, contoh: `dateChoice`, yang muncul sebelum `select`.
- Dari `dateChoice`, lanjut ke durasi dan bank atau resume VA sesuai tanggal.
- Kelebihan:
  - Semua state tetap dalam reducer, lebih mudah dipantau.
- Kekurangan:
  - State machine jadi lebih panjang dan perlu diperhatikan transisinya.

## Dampak pada backend dan konsep data

### Booking berdasarkan tanggal

Fitur ini mengasumsikan bahwa pemesanan dapat dikaitkan dengan **tanggal mulai**. Jika sistem sebelumnya hanya menggunakan durasi mulai dari waktu sekarang, maka perlu klarifikasi:

- Apakah booking perlu menyimpan `startDate` atau `bookingDate`?
- Apakah jam mulai dihitung dari waktu sekarang atau dari jam operasional venue?
- Bagaimana slot digunakan untuk tanggal lain, apakah workspace bisa dipesan untuk tanggal tertentu saja?

### Endpoint yang mungkin perlu disesuaikan

- `findOpenPayment` kemungkinan perlu menerima parameter tanggal, atau webhook/lookup perlu versi lain.
- `initiatePayment` mungkin perlu menerima tanggal mulai jika masih belum ada.
- Response VA perlu mencerminkan countdown dan batas waktu yang tepat berdasarkan tanggal pemesanan.

## Pertanyaan pendesainan yang belum dijawab

1. Apakah tanggal mulai adalah bagian tetap dari setiap booking?
2. Apakah setelah memilih hari lain, pengguna juga bisa memilih jam mulai, atau tanggal saja sudah cukup?
3. Berapa jauh ke depan tanggal boleh dipilih? Apakah ada batas atau aturan ketersediaan?
4. Bagaimana jika tanggal yang dipilih sudah tidak tersedia atau workspace tidak aktif?
5. Apakah VA untuk tanggal lain akan punya batas waktu berbeda dibanding VA hari ini?
6. Apakah ada perbedaan harga atau kebijakan untuk booking hari lain dibanding hari ini?

## Ruang lingkup tampilan yang berubah

### Komponen yang perlu ditambahkan atau dimodifikasi

- Early choice UI untuk hari ini / hari lain.
- Datepicker untuk pemilihan tanggal lain.
- Logika boot yang sudah disesuaikan dengan tanggal yang dipilih.
- Kemungkinan penyesuaian layar VA untuk menampilkan tanggal mulai jika relevan.

### Komponen yang kemungkinan tetap sama

- Layar durasi dan bank (tetap muncul, hanya timing masuknya yang berubah).
- Layar VA dan e-ticket (tetap berfungsi, kecuali penyesuaian tanggal/ 카운트다운).
- Mekanisme poling dan inquiry (tetap berlaku, selama status VA didasarkan pada tanggal yang tepat).

## Langkah verifikasi yang disarankan

1. Cek apakah alur hari ini masih berjalan seperti sebelumnya.
2. Cek apakah tanggal lain dapat dipilih dan diteruskan ke boot workspace.
3. Cek apakah VA terbuka dapat ditemukan (jika ada) untuk kedua jenis tanggal.
4. Cek apakah countdown di layar VA sesuai dengan tanggal pemesanan.
5. Cek apakah pembatalan dan expiry masih berjalan normal.

## Status dokumen

Dokumen ini mencatat hasil analisis perubahan tampilan pemilihan tanggal. Implementasi belum dilakukan. Setelah keputusan desain backend dan batasan tanggal diperjelas, rancangan lanjutan dapat ditulis di sini juga atau dilanjutkan sebagai bagian dari dokumen desain UI.
