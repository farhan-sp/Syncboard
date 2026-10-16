import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import '../../core/connection/connection_provider.dart';
import '../../core/db/models.dart';
import '../../core/share/share_receiver_service.dart';
import '../../core/transfers/transfers_provider.dart';
import '../../shared/theme/app_theme.dart';

class ShareConfirmationDialog extends ConsumerStatefulWidget {
  final SharedContent content;

  const ShareConfirmationDialog({super.key, required this.content});

  @override
  ConsumerState<ShareConfirmationDialog> createState() => _ShareConfirmationDialogState();
}

class _ShareConfirmationDialogState extends ConsumerState<ShareConfirmationDialog> {
  DeviceItem? _selectedDevice;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _selectedDevice = ref.read(activeDeviceProvider);
  }

  Future<void> _handleConfirmSend() async {
    final device = _selectedDevice ?? ref.read(activeDeviceProvider);
    if (device == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Pilih perangkat desktop tujuan terlebih dahulu.")),
      );
      return;
    }

    setState(() => _isSending = true);

    try {
      if (widget.content.type == SharedContentType.text || widget.content.type == SharedContentType.link) {
        if (widget.content.text != null) {
          await ref.read(transfersProvider.notifier).sendText(
                widget.content.text!,
                targetDeviceId: device.deviceId,
              );
        }
      } else if (widget.content.files.isNotEmpty) {
        for (final file in widget.content.files) {
          await ref.read(transfersProvider.notifier).sendFile(
                file,
                targetDeviceId: device.deviceId,
                isPhoto: widget.content.type == SharedContentType.photo,
              );
        }
      }

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Berhasil mengirim konten ke ${device.name}!")),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSending = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Gagal mengirim konten: $e")),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final trustedDevices = ref.watch(trustedDevicesProvider);
    final activeDevice = ref.watch(activeDeviceProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final targetDevice = _selectedDevice ?? activeDevice;

    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.tealPrimary.withOpacity(0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.share_rounded, color: AppColors.tealPrimary, size: 22),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Text(
              "Kirim Konten Berbagi",
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Konten yang akan dikirim:",
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.slate600),
            ),
            const SizedBox(height: 8),

            // Content Preview Box
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: isDark ? AppColors.slate800 : AppColors.slate100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: _buildContentPreview(),
            ),

            const SizedBox(height: 16),

            // Target Device Selector
            const Text(
              "Pilih Desktop Tujuan:",
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.slate600),
            ),
            const SizedBox(height: 8),

            if (trustedDevices.isEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.statusWaiting.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  "Belum ada desktop terpasang. Silakan buka aplikasi dan pasangkan perangkat terlebih dahulu.",
                  style: TextStyle(fontSize: 12, color: AppColors.statusWaiting),
                ),
              )
            else
              DropdownButtonFormField<DeviceItem>(
                value: targetDevice != null && trustedDevices.any((d) => d.deviceId == targetDevice.deviceId)
                    ? trustedDevices.firstWhere((d) => d.deviceId == targetDevice.deviceId)
                    : (trustedDevices.isNotEmpty ? trustedDevices.first : null),
                decoration: InputDecoration(
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  isDense: true,
                ),
                items: trustedDevices.map((dev) {
                  return DropdownMenuItem<DeviceItem>(
                    value: dev,
                    child: Text("${dev.name} (${dev.lastHost})", style: const TextStyle(fontSize: 13)),
                  );
                }).toList(),
                onChanged: (dev) => setState(() => _selectedDevice = dev),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isSending ? null : () => Navigator.pop(context),
          child: const Text("Batal"),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: AppColors.tealPrimary,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: (_isSending || targetDevice == null) ? null : _handleConfirmSend,
          child: _isSending
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : const Text("Kirim ke Desktop"),
        ),
      ],
    );
  }

  Widget _buildContentPreview() {
    switch (widget.content.type) {
      case SharedContentType.text:
      case SharedContentType.link:
        return Text(
          widget.content.text ?? '',
          maxLines: 4,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            color: widget.content.type == SharedContentType.link ? AppColors.blueSecondary : null,
          ),
        );

      case SharedContentType.photo:
      case SharedContentType.file:
        final firstFile = widget.content.files.first;
        final count = widget.content.files.length;
        return Row(
          children: [
            Icon(
              widget.content.type == SharedContentType.photo
                  ? Icons.image_rounded
                  : Icons.insert_drive_file_rounded,
              color: AppColors.tealPrimary,
              size: 28,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    p.basename(firstFile.path),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold),
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (count > 1)
                    Text(
                      "+ ${count - 1} berkas lainnya",
                      style: const TextStyle(fontSize: 11, color: AppColors.slate600),
                    ),
                ],
              ),
            ),
          ],
        );
    }
  }
}
