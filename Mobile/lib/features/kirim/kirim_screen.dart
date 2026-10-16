import 'dart:async';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/connection/connection_provider.dart';
import '../../core/db/models.dart';
import '../../core/db/settings_provider.dart';
import '../../core/transfers/file_transfer_manager.dart';
import '../../core/transfers/transfers_provider.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/chat_bubble.dart';
import 'incoming_file_sheet.dart';

class KirimScreen extends ConsumerStatefulWidget {
  const KirimScreen({super.key});

  @override
  ConsumerState<KirimScreen> createState() => _KirimScreenState();
}

class _KirimScreenState extends ConsumerState<KirimScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  StreamSubscription? _offerSubscription;

  @override
  void initState() {
    super.initState();
    // Listen for incoming file transfer offers
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final fileManager = ref.read(fileTransferManagerProvider);
      _offerSubscription = fileManager.incomingOfferStream.listen(_handleIncomingFileOffer);
    });
  }

  @override
  void dispose() {
    _offerSubscription?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _handleIncomingFileOffer(IncomingFileOfferEvent event) {
    final settings = ref.read(settingsProvider);

    // If user disabled confirmation setting: auto-accept
    if (!settings.requireFileConfirmation) {
      if (!event.decisionCompleter.isCompleted) {
        event.decisionCompleter.complete(true);
      }
      return;
    }

    // Show approval bottom sheet
    showModalBottomSheet(
      context: context,
      isDismissible: false,
      enableDrag: false,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => IncomingFileSheet(
        offer: event.offer,
        senderDeviceName: event.senderDeviceName,
        saveLocation: settings.saveFolder,
        onDecision: (accepted) {
          Navigator.pop(ctx);
          if (!event.decisionCompleter.isCompleted) {
            event.decisionCompleter.complete(accepted);
          }
        },
        onPickLocation: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Dapat diubah di tab Pengaturan")),
          );
        },
      ),
    );
  }

  void _handleSend() {
    final text = _textController.text;
    if (text.isEmpty) return;

    final activeDevice = ref.read(activeDeviceProvider);
    ref.read(transfersProvider.notifier).sendText(
          text,
          targetDeviceId: activeDevice?.deviceId,
        );

    _textController.clear();

    Future.delayed(const Duration(milliseconds: 100), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _pickAndSendPhotos() async {
    final activeDevice = ref.read(activeDeviceProvider);
    if (activeDevice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Tidak ada desktop terhubung.")),
      );
      return;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.image,
        allowMultiple: false,
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        await ref.read(transfersProvider.notifier).sendFile(
              file,
              targetDeviceId: activeDevice.deviceId,
              isPhoto: true,
            );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Gagal memilih foto: $e")),
        );
      }
    }
  }

  Future<void> _pickAndSendDocuments() async {
    final activeDevice = ref.read(activeDeviceProvider);
    if (activeDevice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Tidak ada desktop terhubung.")),
      );
      return;
    }

    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.any,
        allowMultiple: false,
      );

      if (result != null && result.files.single.path != null) {
        final file = File(result.files.single.path!);
        await ref.read(transfersProvider.notifier).sendFile(
              file,
              targetDeviceId: activeDevice.deviceId,
              isPhoto: false,
            );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Gagal memilih berkas: $e")),
        );
      }
    }
  }

  void _showAttachmentSheet() {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Kirim Berkas ke Desktop",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.tealPrimary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.photo_library_rounded, color: AppColors.tealPrimary),
                ),
                title: const Text("Pilih Foto & Gambar"),
                subtitle: const Text("Kirim gambar resolusi asli tanpa kompresi"),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndSendPhotos();
                },
              ),
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AppColors.blueSecondary.withOpacity(0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.description_rounded, color: AppColors.blueSecondary),
                ),
                title: const Text("Pilih Dokumen & Berkas"),
                subtitle: const Text("PDF, ZIP, berkas kerja tanpa batasan ukuran"),
                onTap: () {
                  Navigator.pop(ctx);
                  _pickAndSendDocuments();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeDevice = ref.watch(activeDeviceProvider);
    final connectionStatus = ref.watch(connectionStatusProvider);
    final transfers = ref.watch(transfersProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final isConnected = connectionStatus == ConnectionStatus.connected && activeDevice != null;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              activeDevice?.name ?? "SyncBoard",
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isConnected
                        ? AppColors.statusDone
                        : (connectionStatus == ConnectionStatus.connecting
                            ? AppColors.statusWaiting
                            : AppColors.statusFailed),
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  isConnected
                      ? "${connectionStatus.label} (${activeDevice.lastHost}:${activeDevice.port})"
                      : connectionStatus.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.normal,
                    color: isDark ? AppColors.slate400 : AppColors.slate600,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: "Perangkat",
            icon: const Icon(Icons.devices_rounded),
            onPressed: () => context.go('/perangkat'),
          ),
        ],
      ),
      body: Column(
        children: [
          if (!isConnected)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: AppColors.statusWaiting.withOpacity(0.15),
              child: Row(
                children: [
                  const Icon(Icons.info_outline_rounded, color: AppColors.statusWaiting, size: 20),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      "Desktop belum terhubung. Pastikan berada di Wi-Fi yang sama.",
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                    ),
                  ),
                  TextButton(
                    onPressed: () => context.go('/pasangkan'),
                    child: const Text("Pasangkan", style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),

          // Chat bubbles list
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: transfers.length,
              itemBuilder: (context, index) {
                final item = transfers[index];
                return ChatBubble(
                  transfer: item,
                  onRetry: () => ref.read(transfersProvider.notifier).retry(item.id),
                  onCancel: () => ref.read(transfersProvider.notifier).cancel(item.id),
                  onOpenFile: item.savedPath != null
                      ? () async {
                          try {
                            await FileTransferManager.openFileSafely(item.savedPath!);
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text("Gagal membuka berkas: $e")),
                              );
                            }
                          }
                        }
                      : null,
                  onSaveFile: item.savedPath != null
                      ? () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text("Berkas tersimpan di: ${item.savedPath}")),
                          );
                        }
                      : null,
                );
              },
            ),
          ),

          // Bottom Input Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: isDark ? AppColors.slate800 : Colors.white,
              border: Border(
                top: BorderSide(
                  color: isDark ? AppColors.slate700 : AppColors.slate200,
                  width: 1,
                ),
              ),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.attach_file_rounded),
                    color: AppColors.tealPrimary,
                    tooltip: "Lampirkan Berkas atau Foto",
                    onPressed: isConnected ? _showAttachmentSheet : null,
                  ),
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _handleSend(),
                      decoration: InputDecoration(
                        hintText: "Ketik teks atau tautan...",
                        hintStyle: TextStyle(
                          color: isDark ? AppColors.slate400 : AppColors.slate600,
                          fontSize: 14,
                        ),
                        filled: true,
                        fillColor: isDark ? AppColors.slate900 : AppColors.slate100,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(20),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: isConnected ? _handleSend : null,
                    style: IconButton.styleFrom(
                      backgroundColor: AppColors.tealPrimary,
                      foregroundColor: Colors.white,
                    ),
                    icon: const Icon(Icons.send_rounded, size: 20),
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
