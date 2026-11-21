# SyncBoard

**SyncBoard** adalah aplikasi transfer dua arah peer-to-peer (P2P) lokal untuk teks, tautan, foto, dan dokumen antara perangkat **Android** dan **Desktop (Linux & Windows)** melalui jaringan Wi-Fi lokal tanpa internet, tanpa pembuatan akun, dan tanpa server cloud.

---

## 📁 Struktur Repositori

```text
├── Desktop/       # Aplikasi Desktop (Electron, Vite, React, TypeScript, TailwindCSS)
├── Mobile/        # Aplikasi Mobile (Flutter, Dart, Material 3, Android Keystore)
└── README.md      # Panduan utama proyek (Build & Run)
```

---

## ⚙️ Pra-syarat (Prerequisites)

### Untuk Desktop:
- **Node.js**: Versi 18 LTS atau lebih baru (disarankan Node.js 20+).
- **npm**: Versi 9+ (terbawa otomatis dengan Node.js).
- **Sistem Operasi**:
  - **Linux**: Kernel modern (didukung glibc, fuse untuk AppImage).
  - **Windows**: Windows 10/11 (64-bit).

### Untuk Mobile:
- **Flutter SDK**: Versi 3.x (disarankan channel stable dengan Dart null-safety).
- **Android SDK**: Android Studio / Command Line Tools dengan `targetSdk 34` dan `minSdk 26` (Android 8.0 Oreo ke atas).
- **Java Development Kit (JDK)**: OpenJDK 17 atau 21.

---

## 🔨 Panduan Membangun Proyek (Build)

### 1. Build Desktop

Masuk terlebih dahulu ke direktori `Desktop`:
```bash
cd Desktop
npm install
```

#### A. Build di Linux (AppImage)
1. Kompilasi kode sumber renderer dan main process:
   ```bash
   npm run build
   ```
2. Buat paket installer/executable mandiri Linux (.AppImage):
   ```bash
   npm run dist:linux
   ```
   *Hasil build:* Berkas `SyncBoard-1.0.0.AppImage` berada di direktori `Desktop/dist-package/`.

#### B. Build di Windows (NSIS Installer & Portable)
1. Kompilasi kode sumber renderer dan main process:
   ```cmd
   npm run build
   ```
2. Buat installer Windows (.exe):
   ```cmd
   npm run dist:win
   ```
   *Hasil build:* Berkas installer setup `.exe` dan versi portable berada di direktori `Desktop/dist-package/`.

---

### 2. Build Mobile (Android)

Masuk ke direktori `Mobile`:
```bash
cd Mobile
flutter pub get
```

Perintah build mobile dapat dijalankan baik di **Linux** maupun **Windows**:

#### A. Build APK Rilis (Standalone Installer)
Untuk membuat berkas APK mandiri yang siap dipasang langsung ke perangkat Android:
```bash
flutter build apk --release
```
*Hasil build:* Berkas APK rilis berada di:
`Mobile/build/app/outputs/flutter-apk/app-release.apk`

#### B. Build Android App Bundle (AAB)
Untuk distribusi Google Play Store dengan ukuran teroptimasi:
```bash
flutter build appbundle --release
```
*Hasil build:* Berkas AAB berada di:
`Mobile/build/app/outputs/bundle/release/app-release.aab`

---

## 🚀 Panduan Menjalankan Proyek (Run)

### 1. Menjalankan Aplikasi Desktop

Masuk ke folder `Desktop`:
```bash
cd Desktop
```

#### A. Menggunakan File Hasil Build (Siap Pakai)
- **Linux**:
  ```bash
  chmod +x dist-package/SyncBoard-1.0.0.AppImage
  ./dist-package/SyncBoard-1.0.0.AppImage
  ```
- **Windows**:
  Cukup klik dua kali (double-click) pada file installer setup `.exe` atau versi portable di folder `dist-package`.

#### B. Mode Pengembangan (Development Mode)
- **Linux**:
  ```bash
  npm run build
  npm run start:dev
  ```
  *(Perintah `start:dev` menjalankan Electron dengan parameter `--no-sandbox` untuk memastikan kompatibilitas di lingkungan Linux).*
- **Windows**:
  ```cmd
  npm run build
  npm start
  ```

---

### 2. Menjalankan Aplikasi Mobile

Masuk ke folder `Mobile`:
```bash
cd Mobile
```

#### A. Menginstal APK Rilis ke Perangkat Android (Cepat & Praktis)
1. **Via ADB (Kabel USB / Wi-Fi Debugging)**:
   Pastikan opsi *USB Debugging* di ponsel aktif, lalu jalankan:
   ```bash
   adb install build/app/outputs/flutter-apk/app-release.apk
   ```
2. **Via Manual / Sideloading**:
   Salin berkas `build/app/outputs/flutter-apk/app-release.apk` ke penyimpanan internal ponsel, kemudian buka berkas tersebut melalui pengelola berkas (File Manager) di HP untuk menginstalnya.

#### B. Menjalankan Langsung via Flutter (Live Debug / Development)
1. Pastikan ponsel terhubung via USB atau Android Emulator aktif:
   ```bash
   flutter devices
   ```
2. Jalankan aplikasi langsung ke perangkat:
   ```bash
   flutter run
   ```
   *Jika terdapat beberapa perangkat terdeteksi, spesifikasikan ID perangkat:*
   ```bash
   flutter run -d <DEVICE_ID>
   ```
   *(Contoh: `flutter run -d 114563745B100643`)*

---

## 🔗 Cara Menghubungkan (Pairing) Desktop & Mobile

1. **Jaringan Wi-Fi yang Sama**:
   Pastikan komputer Desktop dan ponsel Android terhubung ke jaringan Wi-Fi lokal atau Hotspot yang sama (berada dalam subnet IP yang sama, misal `192.168.1.x`).
2. **Buka SyncBoard Desktop**:
   Buka aplikasi di Desktop, lalu pilih menu **Pasangkan Perangkat**. Layar desktop akan menampilkan kode QR dan server WSS lokal akan aktif.
3. **Buka SyncBoard Mobile**:
   Buka aplikasi di HP Android, pilih menu **Pasangkan Perangkat**, berikan izin akses kamera saat diminta, lalu arahkan kamera ke kode QR di layar Desktop.
4. **Konfirmasi Kode Verifikasi**:
   Kedua perangkat akan menampilkan 6-digit kode verifikasi numerik berformat `XXX-XXX` (contoh: `224-236`). Pastikan angka di kedua layar sama persis, lalu tekan tombol **Cocok & Hubungkan**.
5. **Siap Digunakan**:
   Kedua perangkat kini terhubung secara terenkripsi TLS dengan *certificate pinning*. Anda dapat langsung mengirim teks, tautan, serta file dan dokumen antar perangkat tanpa batasan internet.
