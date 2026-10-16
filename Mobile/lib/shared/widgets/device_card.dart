import 'package:flutter/material.dart';
import '../../core/db/models.dart';
import '../theme/app_theme.dart';

class DeviceCard extends StatelessWidget {
  final DeviceItem device;
  final VoidCallback? onRename;
  final VoidCallback? onDisconnect;
  final VoidCallback? onConnect;
  final VoidCallback? onUnpair;

  const DeviceCard({
    super.key,
    required this.device,
    this.onRename,
    this.onDisconnect,
    this.onConnect,
    this.onUnpair,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: device.isActive
                              ? AppColors.tealPrimary.withOpacity(0.15)
                              : (isDark ? AppColors.slate700 : AppColors.slate100),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.laptop_mac_rounded,
                          color: device.isActive ? AppColors.tealPrimary : AppColors.slate600,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              device.name,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              "${device.lastHost}:${device.port}",
                              style: TextStyle(
                                fontSize: 13,
                                color: isDark ? AppColors.slate400 : AppColors.slate600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: device.isActive
                        ? AppColors.statusDone.withOpacity(0.15)
                        : AppColors.slate400.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: device.isActive ? AppColors.statusDone : AppColors.slate400,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        device.isActive ? "Terhubung" : "Tidak terhubung",
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: device.isActive ? AppColors.statusDone : AppColors.slate600,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              "Sidik Jari Sertifikat TLS (SHA-256):",
              style: TextStyle(fontSize: 11, color: AppColors.slate600),
            ),
            const SizedBox(height: 2),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: isDark ? AppColors.slate900 : AppColors.slate100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                device.certFingerprint,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (onRename != null)
                  TextButton.icon(
                    onPressed: onRename,
                    icon: const Icon(Icons.edit_outlined, size: 16),
                    label: const Text("Ganti Nama", style: TextStyle(fontSize: 12)),
                  ),
                const SizedBox(width: 4),
                if (device.isActive && onDisconnect != null)
                  OutlinedButton.icon(
                    onPressed: onDisconnect,
                    icon: const Icon(Icons.link_off_rounded, size: 16),
                    label: const Text("Putuskan", style: TextStyle(fontSize: 12)),
                  )
                else if (!device.isActive && onConnect != null)
                  FilledButton.tonal(
                    onPressed: onConnect,
                    child: const Text("Hubungkan", style: TextStyle(fontSize: 12)),
                  ),
                const SizedBox(width: 4),
                if (onUnpair != null)
                  IconButton(
                    onPressed: onUnpair,
                    tooltip: "Hapus Pasangan",
                    icon: const Icon(Icons.delete_outline_rounded, color: AppColors.statusFailed, size: 20),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
