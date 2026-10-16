# SyncBoard Protocol Specification (v1)

Protokol sinkronisasi lokal peer-to-peer antara SyncBoard Desktop (Server) dan SyncBoard Android (Client) melalui Wi-Fi lokal tanpa internet, akun, atau cloud.

---

## 1. Arsitektur & Peran
- **Desktop (Host / Server)**: Menjalankan server TLS WSS (WebSocket Secure).
- **Android (Client)**: Bertindak sebagai klien yang menjaga satu koneksi WSS persisten terbuka selama aplikasi aktif (menggunakan Android Foreground Service).
- Semua lalu lintas transfer dua arah (Desktop ke Android, maupun Android ke Desktop) mengalir melalui satu koneksi WebSocket persisten ini. Ponsel tidak perlu membuka server TCP/port terbuka.

---

## 2. Lapisan Transport (WSS)
- **Protokol**: WSS (WebSocket over TLS 1.3/1.2).
- **Port Bawaan**: `48620` (dapat dikonfigurasi pada pengaturan desktop).
- **Sertifikat TLS**:
  - Dihasilkan satu kali oleh desktop (*self-signed certificate*, RSA 2048-bit atau ECDSA P-256).
  - Masa berlaku: 10 tahun.
  - Disimpan persisten di penyimpanan aplikasi desktop.
  - **Trust Model**: Verifikasi berbasis *certificate fingerprint pinning* (SHA-256 dari sertifikat DER), **bukan** melalui otoritas sertifikat publik (CA) dan **dilarang keras** mematikan verifikasi sertifikat.
  - Representasi fingerprint: String heksadesimal huruf kecil 64 karakter (tanpa tanda titik dua).
- **Format Frame**:
  - Pesan kontrol & metadata: Text frame JSON ber-encoding UTF-8.
  - Data transfer berkas: Binary frame (ArrayBuffer / Buffer).

---

## 3. Alur Pemasangan (Pairing via QR)

### 3.1 Konten QR Code (Desktop)
Desktop menampilkan kode QR yang berisi payload JSON:
```json
{
  "v": 1,
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "deviceName": "DESKTOP-ARTHUR",
  "hosts": ["192.168.1.50", "10.0.0.12"],
  "port": 48620,
  "certFingerprint": "8f434346648f6b96df89dda901c5176b10e6d0b93b7a421b8f598b7346123456",
  "pairToken": "base64url_random_32_bytes",
  "expiresAt": 1729000120000
}
```
- `pairToken`: Nilai acak 32-byte terenkripsi aman, disandikan dalam Base64URL. Hanya dapat digunakan satu kali (*single-use*).
- `expiresAt`: Timestamp milidetik UNIX (kedaluwarsa dalam 2 menit / 120 detik sejak dibuat).

### 3.2 Pemindaian & Permintaan Pasangan (Phone -> Desktop)
1. Ponsel memindai QR, menguji koneksi ke daftar alamat `hosts` yang ada di payload secara berurutan hingga berhasil terhubung.
2. Saat TLS handshake, ponsel memeriksa sertifikat server: `SHA-256(server_cert_der) == certFingerprint`. Jika tidak cocok, koneksi langsung diputus!
3. Ponsel menghasilkan `clientSecret` (kunci acak 32-byte).
4. Ponsel mengirimkan teks frame JSON:
```json
{
  "type": "pair.request",
  "deviceId": "c8b417e2-4720-410a-b31b-4148e6587441",
  "deviceName": "Galaxy S23",
  "pairToken": "base64url_random_32_bytes",
  "clientSecret": "hex_or_base64_32_bytes"
}
```

### 3.3 Kode Verifikasi 6 Digit
Kedua perangkat menurunkan kode verifikasi 6-digit yang identik dari hash:
$$\text{hash} = \text{SHA-256}(\text{pairToken} + \text{desktopDeviceId} + \text{phoneDeviceId})$$
- Ambil 4 byte pertama dari hash sebagai integer unsigned 32-bit (Big-Endian).
- Hitung: `numericCode = (uint32Value % 1000000)`.
- Format sebagai 6 digit dengan padding nol di depan, dipisah tanda hubung: `"482-915"`.
- Kedua layar (Desktop dan HP) menampilkan kode yang sama kepada pengguna.

### 3.4 Konfirmasi & Penyimpanan Aman
- Desktop menampilkan dialog persetujuan: nama perangkat ponsel dan kode 6 digit.
- Pengguna desktop harus menekan **"Izinkan"** untuk menyetujui, atau **"Tolak"**.
- Token yang sudah kedaluwarsa atau sudah pernah dipakai langsung ditolak.
- Jika pengguna menekan "Izinkan":
  - Desktop menyimpan perangkat ke database `devices` (tanpa rahasia mentah).
  - `clientSecret` disimpan **hanya** di OS Secure Storage (`safeStorage` di Desktop, `Android Keystore / EncryptedSharedPreferences` di Android).
  - Desktop membalas:
    ```json
    { "type": "pair.response", "ok": true }
    ```
- Jika ditolak:
  ```json
  { "type": "pair.response", "ok": false, "reason": "Ditolak pengguna" }
  ```

---

## 4. Reconnect & Autentikasi (Challenge-Response)
Ketika ponsel tersambung kembali setelah terputus:
1. Ponsel mengirim:
   ```json
   {
     "type": "auth.hello",
     "deviceId": "c8b417e2-4720-410a-b31b-4148e6587441",
     "nonce": "hex_random_16_bytes"
   }
   ```
2. Desktop memeriksa apakah `deviceId` terdaftar dan tidak dicabut (*revoked*). Jika tidak dikenal, desktop menutup koneksi.
3. Desktop menghasilkan `challenge` (nilai acak 32-byte hex) dan mengirim:
   ```json
   {
     "type": "auth.challenge",
     "challenge": "hex_random_32_bytes"
   }
   ```
4. Ponsel menghitung tanda tangan:
   $$\text{signature} = \text{HMAC-SHA256}(\text{clientSecret}, \text{challenge} + \text{nonce})$$
   Dan mengirim:
   ```json
   {
     "type": "auth.response",
     "signature": "hex_hmac_sha256"
   }
   ```
5. Desktop memverifikasi `signature` menggunakan `clientSecret` yang didekripsi dari OS Secure Storage.
6. Jika valid:
   ```json
   {
     "type": "auth.ok",
     "deviceId": "550e8400-e29b-41d4-a716-446655440000",
     "deviceName": "DESKTOP-ARTHUR"
   }
   ```
7. Pengguna dapat memilih aksi **"Putuskan"** (memutus koneksi sementara) atau **"Hapus Pasangan"** (mencabut kepercayaan & menghapus secret dari OS secure storage).

---

## 5. Spesifikasi Pesan (Message Types)

### 5.1 Heartbeat
Dikirim setiap 15 detik:
```json
{ "type": "ping" }
```
Balasan:
```json
{ "type": "pong" }
```

### 5.2 Teks & Tautan
Pengiriman teks/tautan:
```json
{
  "type": "text.send",
  "id": "uuid-v4",
  "kind": "text" | "link",
  "body": "Isi pesan teks atau URL",
  "ts": 1729000200000
}
```
Konfirmasi penerimaan:
```json
{
  "type": "text.ack",
  "id": "uuid-v4"
}
```
*Aturan*: Teks yang diterima harus byte-identik dengan teks yang dikirim (UTF-8, tidak ada trimming spasi). Papan klip (*clipboard*) HANYA disalin saat pengguna menekan tombol "Salin".

### 5.3 Berkas (File Transfer)
1. **Penawaran Berkas (Offer)**:
   ```json
   {
     "type": "file.offer",
     "id": "uuid-v4",
     "name": "foto_liburan.jpg",
     "size": 14205800,
     "mime": "image/jpeg",
     "sha256": "4a123f89...",
     "chunkSize": 262144
   }
   ```
2. **Persetujuan / Penolakan**:
   Penerima menampilkan tawaran dengan pilihan "Terima" / "Tolak" (kecuali jika opsi konfirmasi dinonaktifkan di pengaturan).
   ```json
   { "type": "file.accept", "id": "uuid-v4" }
   ```
   Atau:
   ```json
   { "type": "file.reject", "id": "uuid-v4", "reason": "Ditolak pengguna" }
   ```
3. **Chunk Berkas (Binary Frame)**:
   Frame biner dengan struktur:
   - `Byte 0 - 15` (16 bytes): Transfer ID (UUID raw binary 16 bytes).
   - `Byte 16 - 23` (8 bytes): File Offset (64-bit unsigned integer, Big-Endian).
   - `Byte 24 - N`: Payload chunk data (standar 256 KB = 262.144 bytes, chunk terakhir dapat lebih kecil).
4. **Progres Transfer**:
   ```json
   {
     "type": "file.progress",
     "id": "uuid-v4",
     "bytesReceived": 524288
   }
   ```
5. **Penyelesaian Berkas (Done)**:
   ```json
   {
     "type": "file.done",
     "id": "uuid-v4",
     "ok": true
   }
   ```
   Atau jika verifikasi hash gagal:
   ```json
   {
     "type": "file.done",
     "id": "uuid-v4",
     "ok": false,
     "reason": "Hash SHA-256 tidak cocok"
   }
   ```
6. **Pembatalan**:
   ```json
   {
     "type": "transfer.cancel",
     "id": "uuid-v4"
   }
   ```

---

## 6. Aturan Penanganan Berkas & Keamanan
1. **Streaming Berkas**: Berkas dialirkan secara bertahap dalam chunk 256 KB. DILARANG memuat seluruh berkas ke RAM.
2. **Penyimpanan Sementara (.tmp)**:
   - Penerima menulis langsung ke berkas sementara di folder `SyncBoard/temp/<id>.tmp`.
   - Mengkalkulasi SHA-256 secara inkremental selama chunk diterima.
   - Hanya setelah seluruh ukuran terpenuhi dan SHA-256 cocok, berkas dipindahkan ke folder unduhan tujuan.
   - Jika gagal, terputus, atau dibatalkan: berkas `.tmp` langsung dihapus dari disk, status diubah menjadi "Gagal" atau "Dibatalkan", dan tersedia tombol "Coba Lagi".
3. **Sanitasi Nama Berkas**:
   - Hilangkan pemisah path (`/`, `\`), karakter kontrol, dan nama terlarang Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`).
   - Mencegah penimpaan file: tambahkan penomoran otomatis seperti `dokumen (1).pdf` jika file dengan nama sama sudah ada di folder tujuan.
4. **Tidak Ada Eksekusi Otomatis**: Berkas yang diterima TIDAK BOLEH pernah dieksekusi atau dibuka secara otomatis demi keamanan.

---

## 7. Status Transfer
1. **Menunggu**: Menunggu persetujuan penawaran berkas atau antrean.
2. **Mengirim**: Sedang dalam proses streaming data.
3. **Selesai**: Berhasil diterima/dikirim dan telah lulus verifikasi integritas.
4. **Dibatalkan**: Dibatalkan oleh pengirim atau penerima.
5. **Gagal**: Gagal karena masalah jaringan, timeout, atau hash tidak cocok.

---

## 8. Skema Basis Data Lokal (SQLite)

### Tabel `devices`
```sql
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  certFingerprint TEXT NOT NULL,
  pairedAt INTEGER NOT NULL,
  lastSeenAt INTEGER,
  status TEXT DEFAULT 'paired'
);
```
*(Catatan: `clientSecret` TIDAK PERNAH disimpan di tabel ini atau file teks polos, melainkan hanya di OS Secure Storage).*

### Tabel `transfers`
```sql
CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  deviceId TEXT NOT NULL,
  direction TEXT NOT NULL,      -- 'incoming' | 'outgoing'
  kind TEXT NOT NULL,           -- 'text' | 'link' | 'file'
  textBody TEXT,
  fileName TEXT,
  fileSize INTEGER,
  savedPath TEXT,
  status TEXT NOT NULL,         -- 'Menunggu' | 'Mengirim' | 'Selesai' | 'Dibatalkan' | 'Gagal'
  pinned INTEGER DEFAULT 0,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER,
  FOREIGN KEY (deviceId) REFERENCES devices(id) ON DELETE CASCADE
);
```

### Tabel `settings`
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Pengaturan bawaan:
- `serverPort`: `48620`
- `deviceName`: Nama host komputer
- `downloadDir`: Folder Unduhan pengguna (`~/Downloads/SyncBoard`)
- `autoAcceptFiles`: `false` (default meminta konfirmasi)
- `historyMode`: `'simpan'` (`'simpan'` = disimpan hingga dihapus, `'kirim_sekali'` = dihapus otomatis setelah masa retensi)
- `retentionHours`: `24`
