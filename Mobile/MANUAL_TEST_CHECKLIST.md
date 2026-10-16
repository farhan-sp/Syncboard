# Checklist Uji Coba Manual (Manual Test Checklist) — SyncBoard Android

Panduan ini berisi langkah-langkah pengujian manual secara menyeluruh (End-to-End) antara aplikasi **SyncBoard Android** dan **SyncBoard Desktop** (Windows/Linux) pada jaringan Wi-Fi lokal yang sama.

---

## 📋 Pra-Syarat Pengujian

1. **Jaringan**: Ponsel Android dan Desktop terhubung ke jaringan Wi-Fi lokal atau hotspot yang sama (subnet IP lokal yang sama, misal `192.168.1.x`).
2. **SyncBoard Desktop**: Berjalan dan membuka tab **Pasangkan Perangkat** (menampilkan QR code).
3. **SyncBoard Android**: Terinstal pada perangkat Android (Android 8.0 Oreo / SDK 26 ke atas).

---

## 🧪 Skenario Pengujian

### 1. Izin Perangkat & Tampilan Awal (Scaffold & Permissions)
- [ ] **Izin Kamera**: Buka menu *Pasangkan Perangkat* -> Dialog izin kamera muncul -> Berikan izin -> Kamera pemindai QR aktif dengan panduan bingkai pemindaian.
- [ ] **Izin Notifikasi (Android 13+)**: Saat terhubung pertama kali, pastikan sistem meminta izin notifikasi untuk Layanan Latar Depan (*Foreground Service*).
- [ ] **Tema Aplikasi**: Masuk ke menu *Pengaturan* -> Ganti tema antara *Sistem*, *Terang*, dan *Gelap*. Pastikan kontras warna tetap nyaman dan menggunakan palet teal/blue tenang.

---

### 2. Pemasangan Perangkat Pertama Kali (QR Pairing & Verification)
- [ ] **Pindai QR**: Arahkan kamera ponsel ke QR code di SyncBoard Desktop.
- [ ] **Validasi Token & Sidik Jari**: QR code terbaca seketika, aplikasi memvalidasi token dan mengekstrak sidik jari SHA-256 sertifikat TLS self-signed desktop.
- [ ] **Pencocokan Kode Verifikasi 6-Digit**:
  - Layar ponsel dan desktop menampilkan kode verifikasi numerik berformat `XXX-XXX` (contoh: `224-236`).
  - Pastikan angka di ponsel dan desktop **sama persis**.
- [ ] **Persetujuan Handshake**:
  - Tekan **Cocok & Hubungkan** di kedua perangkat.
  - Perangkat desktop otomatis tersimpan di tab *Perangkat Tepercaya*.
  - Rahasia klien (`clientSecret`) tersimpan aman di Android Keystore via `flutter_secure_storage` (tidak tersimpan di SQLite atau file teks biasa).
- [ ] **Penolakan Handshake**:
  - Uji tombol **Tolak / Tidak Cocok**: Pemasangan dibatalkan, rahasia tidak disimpan, dan koneksi ditutup.

---

### 3. Koneksi TLS Pinned & Autentikasi Reconnect
- [ ] **Validasi Sidik Jari TLS**: Klien Android terhubung via `wss://<host>:<port>` dengan validasi sertifikat mandiri yang mencocokkan SHA-256 fingerprint (CA validation dilewati secara aman).
- [ ] **Handshake Challenge-Response**: Koneksi ulang mengirim `auth.challenge`, Android merespons dengan `auth.response` berisi HMAC-SHA256 yang dihitung dari `clientSecret`.
- [ ] **Reconnect Otomatis & Backoff**:
  - Matikan sementara aplikasi Desktop -> Ponsel mendeteksi status *Terputus*.
  - Perhatikan interval reconnect: mencoba ulang secara bertahap (2 dtk, 4 dtk, 8 dtk, 16 dtk, hingga maksimal 30 dtk).
  - Nyalakan kembali Desktop -> Ponsel otomatis terhubung kembali tanpa perlu scan QR ulang.
- [ ] **Heartbeat Ping/Pong**: Pastikan koneksi tetap aktif tanpa terputus secara idle dengan ping periodik setiap 15 detik.

---

### 4. Transfer Teks & Tautan Dua Arah (Text & Link Transfer)
- [ ] **Kirim Teks dari Ponsel ke Desktop**:
  - Ketik teks pada kolom input di tab *Kirim* -> Tekan tombol kirim.
  - Teks muncul di layar Desktop secara instan.
  - Teks terkirim ditandai status centang (*Terkirim*).
- [ ] **Kirim Teks dari Desktop ke Ponsel**:
  - Ketik teks di Desktop -> Kirim ke ponsel.
  - Gelembung pesan teks masuk berwarna hijau/teal muncul di tab *Kirim* ponsel.
  - Ponsel mengirim `text.ack` ke Desktop.
- [ ] **Integritas Byte UTF-8 (No Trimming)**:
  - Kirim teks berisi spasi di awal/akhir, karakter baris baru (`\n`), tab, dan berbagai emoji (`🌐🚀🔥`).
  - Pastikan teks di penerima tidak terpotong (*no trim*) dan karakter identik 100%.
- [ ] **Kebijakan Papan Klip (Clipboard Safety)**:
  - Pesan teks yang masuk **TIDAK BOLEH** langsung disalin otomatis ke clipboard Android demi keamanan privasi.
  - Tekan tombol **Salin** pada gelembung pesan -> Teks tersalin ke clipboard dan muncul snackbar konfirmasi.
- [ ] **Deteksi Tautan (URL)**:
  - Kirim pesan berupa URL (misal: `https://flutter.dev`).
  - Gelembung pesan menandai jenis transfer sebagai *Tautan* dan menyediakan tombol aksi langsung untuk membuka peramban web.

---

### 5. Transfer Berkas & Aliran Streaming (File Transfer & Chunking)
- [ ] **Kirim Berkas dari Ponsel ke Desktop**:
  - Tekan ikon klip kertas di tab *Kirim* -> Pilih dokumen PDF atau berkas ZIP besar.
  - Bilah progres transfer (*SyncProgressBar*) bergerak mulus menampilkan persentase dan kecepatan transfer.
- [ ] **Kirim Foto dari Ponsel ke Desktop**:
  - Tekan tombol foto -> Pilih gambar dari galeri -> Kirim.
  - Gambar diterima Desktop dan dapat dibuka langsung.
- [ ] **Terima Berkas dari Desktop & Lembar Persetujuan (Incoming File Sheet)**:
  - Kirim berkas dari Desktop ke ponsel.
  - Layar ponsel memunculkan lembar konfirmasi bawah: *"[Nama Desktop] ingin mengirim berkas..."* beserta nama berkas, ukuran, dan tujuan simpan.
  - Tekan **Tolak**: Transfer dibatalkan, desktop menerima status penolakan.
  - Ulangi dan tekan **Terima**: Berkas mulai diunduh.
- [ ] **Pemberian Nama Unik & Resolusi Konflik (Auto-Renaming)**:
  - Kirim berkas dengan nama yang sudah ada di folder tujuan (contoh: `laporan.pdf`).
  - Berkas baru otomatis disimpan menjadi `laporan (1).pdf` tanpa menimpa berkas yang lama.
- [ ] **Sanitasi Nama Berkas**:
  - Kirim berkas dengan path traversal (contoh: `../../etc/passwd`) atau karakter khusus Windows (`CON.txt`, `prn.pdf`, `foto:liburan*2026?.jpg`).
  - Nama berkas otomatis disanitasi menjadi aman di sistem Android (`_CON.txt`, `foto_liburan_2026_.jpg`).
- [ ] **Validasi Integritas SHA-256 Checksum**:
  - Berkas ditulis ke ekstensi `.tmp` terlebih dahulu selama transmisi.
  - Setelah seluruh chunk 256 KB selesai, digest SHA-256 diverifikasi penuh sebelum dipindahkan ke folder akhir.
- [ ] **Pembatalan Transfer & Pembersihan Berkas Sementara**:
  - Mulai transfer berkas berukuran besar (misal 500 MB) -> Tekan tombol **Batal**.
  - Transfer berhenti seketika, berkas `.tmp` otomatis dihapus dari penyimpanan perangkat (tidak meninggalkan sampah berkas).
- [ ] **Keamanan Eksekusi**:
  - Berkas yang diterima tidak pernah dieksekusi secara otomatis.
  - Tombol **Buka Berkas** menggunakan `open_filex` saat ditekan oleh pengguna.

---

### 6. Target Berbagi Sistem Android (Android Share Target)
- [ ] **Berbagi Teks dari Aplikasi Lain**:
  - Buka Chrome / Browser di ponsel -> Sorot teks -> Pilih menu sistem **Share / Bagikan** -> Pilih **SyncBoard**.
  - Dialog konfirmasi *Kirim Konten Berbagi* muncul di SyncBoard dengan pratinjau teks dan pemilih desktop tujuan.
  - Tekan **Kirim ke Desktop** -> Teks langsung terkirim ke Desktop.
- [ ] **Berbagi Foto dari Galeri**:
  - Buka aplikasi Galeri Android -> Pilih 1 foto atau beberapa foto -> Bagikan ke **SyncBoard**.
  - Dialog konfirmasi menampilkan pratinjau foto dan tombol kirim -> Berhasil ditransfer ke desktop.
- [ ] **Berbagi Berkas dari File Manager**:
  - Buka Google Files / Pengelola File -> Pilih dokumen APK/PDF -> Bagikan ke SyncBoard -> Berhasil ditransfer.

---

### 7. Manajemen Riwayat & Mode Retensi (History & Retention)
- [ ] **Penyematan Riwayat (Pin / Unpin)**:
  - Geser item riwayat ke kanan (*swipe right*) -> Item disematkan ke bagian atas (*DISEMATKAN*).
  - Geser ke kanan sekali lagi -> Sematan dilepas dan kembali ke urutan tanggal.
- [ ] **Mode Multiseleksi (Batch Selection)**:
  - Tekan dan tahan (*long press*) salah satu item riwayat.
  - Mode seleksi aktif dengan checkbox pada setiap baris dan jumlah item terpilih di AppBar.
  - Pilih beberapa item -> Tekan ikon Pin untuk menyematkan semuanya sekaligus, atau tekan ikon Hapus untuk menghapus semuanya sekaligus.
- [ ] **Filter & Pencarian Riwayat**:
  - Gunakan filter chips (*Teks, Tautan, Foto, File, Disematkan*) -> Daftar item langsung tersaring sesuai jenis.
  - Ketik kata kunci di kotak pencarian -> Daftar menyaring item yang cocok secara real-time.
- [ ] **Mode Retensi "Kirim Sekali" (Send Once)**:
  - Buka *Pengaturan* -> Pilih mode retensi **Kirim Sekali** dengan durasi 15 menit.
  - Kirim sebuah pesan teks atau berkas.
  - Tunggu hingga masa retensi lewat (atau periksa timer 1 menit `RetentionCleanupService`).
  - Catatan transfer otomatis terhapus dari database riwayat.
- [ ] **Aturan Integritas Disk saat Hapus Riwayat**:
  - Unduh berkas dokumen.
  - Hapus riwayat transfer (melalui swipe, batch delete, atau tombol *Hapus Semua Riwayat*).
  - Buka pengelola file perangkat Android di folder unduhan (`/storage/emulated/0/Download/SyncBoard`).
  - **Pastikan berkas fisik dokumen tetap ada dan tidak terhapus**.

---

### 8. Layanan Latar Depan (Foreground Service)
- [ ] **Notifikasi Latar Depan Aktif Saat Terhubung**:
  - Saat ponsel terhubung ke desktop, bilah status Android menampilkan notifikasi persisten: *"SyncBoard: Terhubung ke [Nama Desktop]"*.
  - Notifikasi menjaga koneksi WebSocket tidak dimatikan oleh mekanisme penghemat baterai Android (*Doze mode*).
- [ ] **Penghentian Otomatis Saat Terputus**:
  - Putuskan koneksi atau tutup aplikasi desktop.
  - Layanan latar depan otomatis dihentikan dan notifikasi ditarik dari bilah status Android.
