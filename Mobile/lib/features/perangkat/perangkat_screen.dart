import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/connection/connection_provider.dart';
import '../../core/db/models.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/device_card.dart';

class PerangkatScreen extends ConsumerWidget {
  const PerangkatScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trustedDevices = ref.watch(trustedDevicesProvider);
    final activeDevice = ref.watch(activeDeviceProvider);
    final connectionStatus = ref.watch(connectionStatusProvider);
    final connectionManager = ref.watch(connectionManagerProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text("Perangkat"),
        actions: [
          IconButton(
            tooltip: "Pengaturan",
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.go('/pengaturan'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // "Pasangkan Perangkat Baru" Button
          FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.tealPrimary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            icon: const Icon(Icons.qr_code_scanner_rounded, size: 22),
            label: const Text(
              "Pasangkan Perangkat Baru",
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            onPressed: () => context.push('/pasangkan'),
          ),

          const SizedBox(height: 24),

          // Header: Perangkat Tepercaya
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                "Perangkat Tepercaya (${trustedDevices.length})",
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
              ),
              if (activeDevice != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: connectionStatus == ConnectionStatus.connected
                        ? AppColors.statusDone.withOpacity(0.12)
                        : AppColors.statusWaiting.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    connectionStatus == ConnectionStatus.connected ? "1 Terhubung" : connectionStatus.label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: connectionStatus == ConnectionStatus.connected ? AppColors.statusDone : AppColors.statusWaiting,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),

          // Devices list
          if (trustedDevices.isEmpty)
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(Icons.devices_other_rounded, size: 48, color: AppColors.slate400),
                    const SizedBox(height: 12),
                    const Text(
                      "Belum ada perangkat desktop terpasang",
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "Tekan tombol di atas untuk memindai kode QR dari aplikasi desktop SyncBoard.",
                      style: TextStyle(fontSize: 12, color: isDark ? AppColors.slate400 : AppColors.slate600),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          else
            ...trustedDevices.map((device) {
              final isCurrentDevice = activeDevice?.deviceId == device.deviceId;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DeviceCard(
                  device: device.copyWith(
                    isActive: isCurrentDevice && connectionStatus == ConnectionStatus.connected,
                  ),
                  onRename: () => _showRenameDialog(context, ref, device),
                  onDisconnect: () async {
                    await connectionManager.disconnect();
                    ref.read(activeDeviceProvider.notifier).state = null;
                    ref.read(connectionStatusProvider.notifier).state = ConnectionStatus.disconnected;
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text("Koneksi ke ${device.name} diputuskan")),
                      );
                    }
                  },
                  onConnect: () async {
                    ref.read(activeDeviceProvider.notifier).state = device;
                    await connectionManager.connectToDevice(device);
                  },
                  onUnpair: () => _confirmUnpair(context, ref, device),
                ),
              );
            }),

          const SizedBox(height: 16),

          // Connection Troubleshooting Tile
          Card(
            color: isDark ? AppColors.slate800 : Colors.white,
            child: ExpansionTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.blueSecondary.withOpacity(0.12),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.help_outline_rounded, color: AppColors.blueSecondary, size: 20),
              ),
              title: const Text(
                "Panduan Koneksi & Pemecahan Masalah",
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
              ),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                _buildTroubleshootItem(
                  Icons.wifi_rounded,
                  "Jaringan Wi-Fi Sama",
                  "Ponsel dan desktop harus terhubung ke router Wi-Fi lokal yang sama tanpa isolasi klien (AP isolation).",
                ),
                const SizedBox(height: 8),
                _buildTroubleshootItem(
                  Icons.security_rounded,
                  "Port & Firewall Desktop",
                  "Desktop membuka server WSS pada port 48620. Pastikan firewall Windows/Linux mengizinkan akses koneksi masuk.",
                ),
                const SizedBox(height: 8),
                _buildTroubleshootItem(
                  Icons.vpn_lock_rounded,
                  "Verifikasi Sidik Jari TLS",
                  "Aplikasi memvalidasi sidik jari SHA-256 sertifikat desktop secara otomatis demi mencegah serangan perantara (Man-in-the-Middle).",
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTroubleshootItem(IconData icon, String title, String desc) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: AppColors.tealPrimary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              Text(desc, style: const TextStyle(fontSize: 12, color: AppColors.slate600)),
            ],
          ),
        ),
      ],
    );
  }

  void _showRenameDialog(BuildContext context, WidgetRef ref, DeviceItem device) {
    final controller = TextEditingController(text: device.name);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Ganti Nama Perangkat"),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: "Nama Perangkat",
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Batal"),
          ),
          FilledButton(
            onPressed: () {
              final newName = controller.text.trim();
              if (newName.isNotEmpty) {
                ref.read(trustedDevicesProvider.notifier).rename(device.deviceId, newName);
                if (ref.read(activeDeviceProvider)?.deviceId == device.deviceId) {
                  ref.read(activeDeviceProvider.notifier).state = device.copyWith(name: newName);
                }
              }
              Navigator.pop(ctx);
            },
            child: const Text("Simpan"),
          ),
        ],
      ),
    );
  }

  void _confirmUnpair(BuildContext context, WidgetRef ref, DeviceItem device) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Hapus Pasangan Perangkat?"),
        content: Text(
          "Kunci enkripsi aman dan status kepercayaan untuk '${device.name}' akan dihapus secara permanen dari penyimpanan aman perangkat ini.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Batal"),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.statusFailed),
            onPressed: () async {
              await ref.read(connectionManagerProvider).unpairDevice(device.deviceId);
              ref.read(trustedDevicesProvider.notifier).unpair(device.deviceId);
              if (ref.read(activeDeviceProvider)?.deviceId == device.deviceId) {
                ref.read(activeDeviceProvider.notifier).state = null;
                ref.read(connectionStatusProvider.notifier).state = ConnectionStatus.disconnected;
              }
              if (context.mounted) {
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text("Pasangan ${device.name} telah dihapus")),
                );
              }
            },
            child: const Text("Hapus Pasangan"),
          ),
        ],
      ),
    );
  }
}
