import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/connection/connection_provider.dart';
import '../../core/crypto/crypto_utils.dart';
import '../../core/db/database_service.dart';
import '../../core/db/models.dart';
import '../../core/db/settings_provider.dart';
import '../../core/pairing/pairing_manager.dart';
import '../../core/protocol/protocol_models.dart';
import '../../core/secrets/secure_storage_service.dart';
import '../../shared/theme/app_theme.dart';

class PairingScreen extends ConsumerStatefulWidget {
  const PairingScreen({super.key});

  @override
  ConsumerState<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends ConsumerState<PairingScreen> {
  final MobileScannerController _scannerController = MobileScannerController();
  bool _hasCameraPermission = false;
  bool _isCheckingPermission = true;
  bool _isProcessing = false;
  String? _errorMessage;
  PairingSession? _activeSession;

  late final PairingManager _pairingManager;

  @override
  void initState() {
    super.initState();
    _pairingManager = PairingManager(
      secureStorage: SecureStorageService(),
      databaseService: DatabaseService(),
    );
    _checkAndRequestCameraPermission();
  }

  @override
  void dispose() {
    _scannerController.dispose();
    super.dispose();
  }

  Future<void> _checkAndRequestCameraPermission() async {
    final status = await Permission.camera.status;
    if (status.isGranted) {
      setState(() {
        _hasCameraPermission = true;
        _isCheckingPermission = false;
      });
      return;
    }

    setState(() => _isCheckingPermission = false);

    // Show explanation dialog in Indonesian before requesting
    if (!mounted) return;
    final proceed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text("Izin Kamera Diperlukan"),
        content: const Text(
          "SyncBoard memerlukan izin akses kamera untuk memindai kode QR dari aplikasi desktop SyncBoard secara langsung.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Batal"),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.tealPrimary),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Izinkan"),
          ),
        ],
      ),
    );

    if (proceed == true) {
      final requested = await Permission.camera.request();
      setState(() {
        _hasCameraPermission = requested.isGranted;
      });
    }
  }

  void _handleScannedQrString(String rawData) async {
    if (_isProcessing) return;

    setState(() {
      _isProcessing = true;
      _errorMessage = null;
    });

    try {
      final json = jsonDecode(rawData);
      if (json is! Map<String, dynamic>) {
        throw const FormatException("Kode QR tidak valid (bukan JSON SyncBoard).");
      }

      final qr = QrPayload.fromJson(json);

      // Validate QR expiration
      if (qr.isExpired) {
        throw QrExpiredException("Kode QR telah kedaluwarsa. Silakan segarkan di desktop.");
      }

      final settings = ref.read(settingsProvider);

      // Pause scanner while showing bottom sheet
      _scannerController.stop();

      // Initiate handshake: connect, verify cert fingerprint, derive 6-digit code
      final session = await _pairingManager.initiatePairing(
        qr: qr,
        phoneDeviceName: settings.deviceName,
      );

      _activeSession = session;

      if (!mounted) return;
      _showPairingBottomSheet(session);
    } catch (e) {
      setState(() {
        _isProcessing = false;
        _errorMessage = e.toString().replaceFirst('Exception: ', '');
      });
      _scannerController.start();
    }
  }

  void _showPairingBottomSheet(PairingSession session) {
    showModalBottomSheet(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.tealPrimary.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.phonelink_ring_rounded, color: AppColors.tealPrimary, size: 28),
              ),
              const SizedBox(height: 12),
              const Text(
                "Konfirmasi Pemasangan",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                "Desktop: ${session.qrPayload.deviceName} (${session.connectedHost}:${session.qrPayload.port})",
                style: const TextStyle(fontSize: 13, color: AppColors.slate600),
              ),
              const SizedBox(height: 20),

              // Verification Code Card (e.g. "482-915")
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 20),
                decoration: BoxDecoration(
                  color: AppColors.tealContainerLight,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  children: [
                    const Text(
                      "KODE VERIFIKASI",
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                        color: AppColors.tealPrimaryDark,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      session.verificationCode,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 34,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 4,
                        color: AppColors.tealPrimaryDark,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      "Pastikan kode di atas cocok dengan yang tampil di layar desktop Anda.",
                      style: TextStyle(fontSize: 11, color: AppColors.tealPrimaryDark),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Action Buttons: Pasangkan vs Batal
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () {
                        _pairingManager.cancelPairing(session);
                        Navigator.pop(ctx);
                        setState(() {
                          _isProcessing = false;
                          _activeSession = null;
                        });
                        _scannerController.start();
                      },
                      child: const Text("Batal"),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.tealPrimary,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: () async {
                        try {
                          // Await desktop approval (user presses "Izinkan" on desktop)
                          final pairedDevice = await _pairingManager.awaitDesktopApproval(session);

                          ref.read(trustedDevicesProvider.notifier).state = [
                            ...ref.read(trustedDevicesProvider).where((d) => d.deviceId != pairedDevice.deviceId),
                            pairedDevice,
                          ];
                          ref.read(activeDeviceProvider.notifier).state = pairedDevice;
                          ref.read(connectionManagerProvider).connectToDevice(pairedDevice);

                          if (!mounted) return;
                          Navigator.pop(ctx);
                          context.pop();

                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text("Berhasil memasangkan dengan ${pairedDevice.name}!")),
                          );
                        } catch (err) {
                          if (!mounted) return;
                          Navigator.pop(ctx);
                          setState(() {
                            _isProcessing = false;
                            _errorMessage = err.toString().replaceFirst('Exception: ', '');
                          });
                          _scannerController.start();
                        }
                      },
                      child: const Text("Pasangkan"),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _simulateScanValidQr() {
    final mockQr = QrPayload(
      v: 1,
      deviceId: 'desktop-macbook-pro',
      deviceName: 'MacBook Pro Desktop',
      hosts: ['192.168.1.105'],
      port: 48620,
      certFingerprint: 'SHA256:4A:8B:1C:2D:3E:4F:5A:6B:7C:8D:9E:0F:1A:2B:3C:4D:5E:6F:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D:7E:8F:90:12',
      pairToken: 'bW9jay1wYWlyLXRva2VuLTMyeHl6MTIzNDU2',
      expiresAt: (DateTime.now().millisecondsSinceEpoch ~/ 1000) + 120,
    );
    _handleScannedQrString(jsonEncode(mockQr.toJson()));
  }

  void _simulateScanExpiredQr() {
    final expiredQr = QrPayload(
      v: 1,
      deviceId: 'desktop-macbook-pro',
      deviceName: 'MacBook Pro Desktop',
      hosts: ['192.168.1.105'],
      port: 48620,
      certFingerprint: 'SHA256:4A:8B:1C:2D:3E:4F:5A:6B:7C:8D:9E:0F:1A:2B:3C:4D:5E:6F:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D:7E:8F:90:12',
      pairToken: 'bW9jay1wYWlyLXRva2VuLTMyeHl6MTIzNDU2',
      expiresAt: (DateTime.now().millisecondsSinceEpoch ~/ 1000) - 60, // Expired
    );
    _handleScannedQrString(jsonEncode(expiredQr.toJson()));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Pasangkan Perangkat"),
        actions: [
          IconButton(
            tooltip: "Nyalakan Flash",
            icon: const Icon(Icons.flash_on_rounded),
            onPressed: () => _scannerController.toggleTorch(),
          ),
          IconButton(
            tooltip: "Putar Kamera",
            icon: const Icon(Icons.cameraswitch_rounded),
            onPressed: () => _scannerController.switchCamera(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Viewfinder Camera Area
          Expanded(
            flex: 3,
            child: Stack(
              alignment: Alignment.center,
              children: [
                if (_hasCameraPermission)
                  MobileScanner(
                    controller: _scannerController,
                    onDetect: (capture) {
                      final barcodes = capture.barcodes;
                      for (final barcode in barcodes) {
                        if (barcode.rawValue != null) {
                          _handleScannedQrString(barcode.rawValue!);
                          break;
                        }
                      }
                    },
                  )
                else
                  Container(
                    color: isDark ? AppColors.slate900 : Colors.black87,
                    alignment: Alignment.center,
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.camera_alt_outlined, color: Colors.white54, size: 54),
                        const SizedBox(height: 12),
                        const Text(
                          "Kamera Tidak Aktif",
                          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          "Tekan tombol di bawah untuk memberikan izin kamera atau gunakan tombol simulasi.",
                          style: TextStyle(color: Colors.white70, fontSize: 12),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: _checkAndRequestCameraPermission,
                          child: const Text("Minta Izin Kamera", style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),

                // Scan Frame Reticle
                Container(
                  width: 260,
                  height: 260,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.tealPrimary, width: 3),
                  ),
                  child: Center(
                    child: _isProcessing
                        ? const CircularProgressIndicator(color: AppColors.tealPrimary)
                        : null,
                  ),
                ),

                // Text Instruction
                Positioned(
                  bottom: 24,
                  left: 20,
                  right: 20,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text(
                      "Arahkan kamera ke kode QR yang tampil di desktop SyncBoard",
                      style: TextStyle(color: Colors.white, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Lower Panel (Error Messages and Testing Simulators)
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.all(20),
              color: isDark ? AppColors.slate800 : Colors.white,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.statusFailed.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline_rounded, color: AppColors.statusFailed, size: 20),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.statusFailed,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  const Text(
                    "Opsi Uji Coba Cepat (Simulator QR Desktop):",
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),

                  FilledButton.tonalIcon(
                    onPressed: _isProcessing ? null : _simulateScanValidQr,
                    icon: const Icon(Icons.qr_code_2_rounded),
                    label: const Text("Uji Pindai QR Valid (Desktop)"),
                  ),
                  const SizedBox(height: 8),

                  OutlinedButton.icon(
                    onPressed: _isProcessing ? null : _simulateScanExpiredQr,
                    icon: const Icon(Icons.timer_off_outlined),
                    label: const Text("Uji QR Kedaluwarsa (Error Handling)"),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
