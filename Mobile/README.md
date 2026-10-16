# SyncBoard Mobile (Android WSS Client)

Aplikasi klien Android resmi untuk **SyncBoard** — transfer dua arah teks, tautan, foto, dan dokumen antara perangkat ponsel Android dan aplikasi Desktop melalui jaringan Wi-Fi lokal yang sama tanpa ketergantungan internet, tanpa akun, dan tanpa server awan.

Semua teks antarmuka pengguna (UI) menggunakan **Bahasa Indonesia**, sedangkan kode, komentar, dan pengidentifikasi menggunakan **Bahasa Inggris**.

---

## 🛠️ Tech Stack & Arsitektur

- **Framework**: Flutter 3 (Dart, null safety), Android targetSdk 34, minSdk 26 (Android 8.0 Oreo+)
- **Antarmuka (UI)**: Material 3, dukungan Tema Terang/Gelap dengan palet tenang teal & blue (`#0D9488` & `#0284C7`)
- **State Management**: Riverpod (`flutter_riverpod`)
- **Navigasi**: `go_router` dengan `ShellRoute` & bottom navigation bar
- **Keamanan & Secrets**:
  - `flutter_secure_storage` (didukung Android Keystore untuk menyimpan `clientSecret`)
  - Pinning sidik jari sertifikat TLS SHA-256 via `dart:io SecurityContext` / `HttpClient`
- **Database Lokal**: `sqflite` (tabel: `devices`, `transfers`, `settings`)
- **Layanan Latar Depan**: `flutter_foreground_task` (menjaga koneksi WSS tetap hidup hanya saat perangkat terhubung)
- **Target Berbagi Android**: `receive_sharing_intent` (SyncBoard muncul di menu Share Android untuk teks, foto, berkas)

---

## 📂 Struktur Direktori

```text
lib/
├── core/
│   ├── protocol/          # Konstanta protokol & model JSON v1
│   ├── crypto/            # Kode verifikasi 6-digit, HMAC-SHA256, sidik jari TLS
│   ├── connection/        # TlsPinnedClient, ConnectionManager, Reconnect Backoff & HMAC Auth
│   ├── pairing/           # PairingManager, QR validation & approval handshake
│   ├── transfers/         # FileTransferManager, TextTransferManager, Chunk framing (24-byte header) & sanitasi berkas
│   ├── service/           # ForegroundServiceManager (flutter_foreground_task)
│   ├── secrets/           # SecureStorageService (Android Keystore)
│   └── db/                # DatabaseService (SQLite) & settings provider
├── features/
│   ├── kirim/             # Layar chat-style dengan bubble history & incoming_file_sheet
│   ├── riwayat/           # Layar riwayat dengan pencarian, filter, pin, swipe
│   ├── perangkat/         # Layar perangkat tepercaya & panduan koneksi
│   ├── pengaturan/        # Layar pengaturan retensi, SAF folder, switch konfirmasi
│   └── pairing/           # Layar pemindai QR (mobile_scanner) & sheet verifikasi
├── shared/
│   ├── theme/             # Tema Material 3 palet tenang teal/slate
│   └── widgets/           # ChatBubble, TransferStatusChip, DeviceCard, SyncProgressBar
├── router/
│   └── app_router.dart    # Konfigurasi go_router dengan 4 tab utama
└── main.dart              # Entrypoint aplikasi dengan ProviderScope
```

---

## 📁 Transfer Berkas & Integritas Data (Milestone 4)

| Fitur | Spesifikasi & Aturan Protokol |
|---|---|
| **Streaming Chunk** | Frame biner dengan header 24-byte: 16-byte UUID + 8-byte offset + payload chunk 256 KB (`ChunkFraming.pack`) |
| **Efisiensi Memori** | Mengalirkan data via `File.openRead()` dan `File.openWrite()` secara bertahap; **TIDAK PERNAH** memuat seluruh berkas ke RAM (aman untuk berkas >1 GB) |
| **Tawaran & Lembar Persetujuan** | Lembar persetujuan (*IncomingFileSheet*): `"[Nama Perangkat] ingin mengirim berkas"`, nama berkas, ukuran, lokasi simpan, serta tombol **Terima** dan **Tolak** |
| **Penyimpanan Sementara** | Penerima menulis ke berkas sementara (`.tmp`). Ukuran dan digest SHA-256 diverifikasi penuh sebelum berkas dipindahkan ke folder tujuan |
| **Pembersihan Temp File** | Jika transfer dibatalkan atau koneksi terputus: berkas `.tmp` **SEGERA DIHAPUS**, status ditandai *Gagal* / *Dibatalkan*, dan disediakan opsi *Coba Lagi* |
| **Sanitasi Nama Berkas** | Menghapus path traversal (`..`, `/`, `\`), karakter ilegal, Windows reserved names (`CON`, `PRN`, dll.), serta penamaan otomatis jika ada file bernama sama (`"nama (1).ext"`) |
| **Keamanan Eksekusi** | Berkas yang diterima **TIDAK PERNAH** dieksekusi atau dibuka otomatis. Berkas hanya dibuka saat pengguna secara sadar menekan tombol **Buka File** (`open_filex`) |

---

## 📤 Target Berbagi & Manajemen Riwayat (Milestone 5)

| Fitur | Spesifikasi & Aturan Implementasi |
|---|---|
| **Android Share Target** | SyncBoard terdaftar sebagai target berbagi sistem Android (`receive_sharing_intent`) untuk teks, tautan, foto, dan berkas |
| **Dialog Konfirmasi Berbagi** | Menampilkan pratinjau konten, pemilih desktop tujuan (`activeDevice` / dropdown perangkat tepercaya), serta tombol aksi **Batal** dan **Kirim ke Desktop** |
| **Mode Retensi Riwayat** | **Simpan** (permanen hingga dihapus manual) vs **Kirim Sekali** (teks dan entri riwayat otomatis dihapus setelah 15 min / 1 jam / 24 jam) |
| **Aturan Penting Penghapusan** | Menghapus riwayat hanya menghapus entri database SQLite dan teks dalam memori; **berkas fisik yang tersimpan di disk TETAP AMAN DAN TIDAK DIHAPUS** |
| **Pembersihan Otomatis** | `RetentionCleanupService` menjalankan timer periodik (1 menit) memanggil `cleanupExpired(DateTime.now())` |
| **Pengelolaan Riwayat** | Mode multiseleksi (tekan lama), sematkan/lepas sematan massal, hapus massal, swipe-to-pin, swipe-to-delete, filter jenis, pencarian teks, dan pengelompokan tanggal |
| **Pengaturan Persisten** | `SharedPreferences` menyimpan tema aplikasi, mode retensi, durasi retensi, opsi persetujuan berkas, dan folder unduhan |

---

## 🧪 Menjalankan Pengujian Mandiri

Jalankan test runner mandiri untuk memvalidasi algoritma protokol M1, M2, M3, M4, dan M5:

```bash
cd "/home/deiro/Program Files/VS Code/Apps/Mobile"
node run_protocol_tests.mjs
```

**Hasil Uji Coba (Semua 22 Pengujian Lolos 100%):**
```text
=================================================
  SyncBoard Mobile - Protocol & M1-M5 Test Suite 
=================================================
   Derived 6-digit verification code: 224-236
✓ [PASS] testVerificationCodeDerivation
✓ [PASS] testAuthHmac
✓ [PASS] testBinaryChunkFraming
✓ [PASS] testFilenameSanitizer
✓ [PASS] testAutoRenaming
✓ [PASS] testRetention
✓ [PASS] [M2] testQrValidation
✓ [PASS] [M2] testTlsFingerprintPinning
✓ [PASS] [M2] testExponentialBackoff
✓ [PASS] [M2] testSecureStorageLifecycle
✓ [PASS] [M3] testTextSendAndAckFidelity
✓ [PASS] [M3] testClipboardPolicy
✓ [PASS] [M3] testForegroundServiceRule
✓ [PASS] [M4] testFileOfferAndChunkingProtocol
✓ [PASS] [M4] testStreamingWithoutMemoryGrowth
✓ [PASS] [M4] testChecksumVerificationAndTamperDetection
✓ [PASS] [M4] testTempFileLifecycleAndCleanupOnCancel
✓ [PASS] [M5] testShareIntentClassification
✓ [PASS] [M5] testPinUnpinPersistenceAndSorting
✓ [PASS] [M5] testRetentionCleanupPolicyWithDiskPreservation
✓ [PASS] [M5] testBatchSelectionAndActions
✓ [PASS] [M5] testSettingsPersistenceState
=================================================
Results: 22 Passed, 0 Failed
=================================================
```

Unit test Dart di folder `test/`:
- [`test/core/share_and_history_test.dart`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/test/core/share_and_history_test.dart): Uji klasifikasi intent Share Target, toggle pin, batch selection, retensi file di penyimpanan disk saat riwayat dihapus, dan filter kirim sekali.
- [`test/core/file_transfer_test.dart`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/test/core/file_transfer_test.dart): Uji struktur pesan `file.offer`, packing binary chunk 256 KB, streaming SHA-256 checksum & deteksi tampering, serta siklus hidup pembersihan file `.tmp`.
- [`test/core/text_transfer_test.dart`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/test/core/text_transfer_test.dart): Uji fidelity byte UTF-8 `text.send`, `text.ack`, dan kebijakan papan klip.
- [`test/core/pairing_test.dart`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/test/core/pairing_test.dart): Uji alur QR, kode verifikasi 6-digit, dan secure storage.

---

## 🚀 Kompilasi Rilis Android (Release Build - Milestone 6)

SyncBoard Mobile telah dikonfigurasi untuk kompilasi rilis optimal dengan aturan ProGuard/R8 di [`android/app/proguard-rules.pro`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/android/app/proguard-rules.pro) untuk menjaga integritas plugin native (Keystore, SQLite, Foreground Service, Camera, File Picker).

### Perintah Build APK Rilis
Untuk menghasilkan file installer APK mandiri:
```bash
flutter build apk --release
```
Hasil file APK rilis: `build/app/outputs/flutter-apk/app-release.apk`

### Perintah Build Android App Bundle (AAB)
Untuk distribusi Google Play Store dengan ukuran dinamis teroptimasi:
```bash
flutter build appbundle --release
```
Hasil file AAB rilis: `build/app/outputs/bundle/release/app-release.aab`

---

## 📋 Checklist Uji Coba Manual Lengkap
Untuk panduan uji coba manual end-to-end secara terperinci antara perangkat Android dan aplikasi Desktop, silakan merujuk pada:
👉 **[`MANUAL_TEST_CHECKLIST.md`](file:///home/deiro/Program%20Files/VS%20Code/Apps/Mobile/MANUAL_TEST_CHECKLIST.md)**

Cakupan pengujian mencakup 8 area inti:
1. Izin Perangkat & Tampilan Awal (Kamera, Notifikasi, Tema Material 3)
2. Pemasangan Perangkat Pertama Kali (Pemindaian QR, Kode Verifikasi 6-digit simetris `XXX-XXX`, Keystore)
3. Koneksi TLS Pinned & Autentikasi Reconnect (SHA-256 fingerprint, Exponential Backoff 2s..30s, Ping/Pong 15s)
4. Transfer Teks & Tautan Dua Arah (Fidelitas byte UTF-8 tanpa trim, Kebijakan Papan Klip)
5. Transfer Berkas & Aliran Streaming (Chunk 256 KB, Header biner 24-byte, Lembar Persetujuan Terima/Tolak, Verifikasi SHA-256, Pembersihan file `.tmp`)
6. Target Berbagi Sistem Android (`receive_sharing_intent` dari Galeri, Browser, File Manager)
7. Manajemen Riwayat & Mode Retensi (Sematkan/Lepas Pin, Batch multiseleksi, Pembersihan otomatis 1 menit, Berkas fisik tetap aman di disk)
8. Layanan Latar Depan (*Foreground Service* aktif hanya saat terhubung)

---

## 🗺️ Status Rencana Milestone

- [x] **M1**: Flutter scaffold, tema Material 3 calm teal/blue, navigasi 4 tab, antarmuka skeleton dengan mock data, dan pengujian unit protokol dasar.
- [x] **M2**: QR scanner (`mobile_scanner`), pinned TLS connection (`dart:io SecurityContext`/`HttpClient`), pairing with verification code, secure storage (`flutter_secure_storage`), reconnect auth HMAC-SHA256.
- [x] **M3**: Two-way text/link send and receive with `text.ack` and `Salin` action, foreground service (`flutter_foreground_task`).
- [x] **M4**: File send and receive with chunking (256 KB binary frames), progress calculation, cancel, retry, checksum (SHA-256), SAF save folder, and approval sheet ("Terima" / "Tolak").
- [x] **M5**: Target Android Share (`receive_sharing_intent`), pengelolaan riwayat lengkap, pin, mode retensi (*Kirim Sekali* vs *Simpan*), dan preferensi.
- [x] **M6**: Build release (APK/AAB), ProGuard/R8 rules, dokumentasi lengkap dan checklist uji coba manual.
