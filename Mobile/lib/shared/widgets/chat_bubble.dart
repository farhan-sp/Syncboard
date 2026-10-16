import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/db/models.dart';
import '../theme/app_theme.dart';
import 'progress_bar.dart';
import 'transfer_status_chip.dart';

class ChatBubble extends StatelessWidget {
  final TransferItem transfer;
  final VoidCallback? onCopy;
  final VoidCallback? onSaveFile;
  final VoidCallback? onOpenFile;
  final VoidCallback? onRetry;
  final VoidCallback? onCancel;

  const ChatBubble({
    super.key,
    required this.transfer,
    this.onCopy,
    this.onSaveFile,
    this.onOpenFile,
    this.onRetry,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    final isOutgoing = transfer.direction == TransferDirection.outgoing;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final bubbleBg = isOutgoing
        ? (isDark ? AppColors.tealContainerDark : AppColors.tealContainerLight)
        : (isDark ? AppColors.slate800 : Colors.white);

    final bubbleBorder = isOutgoing
        ? (isDark ? AppColors.tealPrimaryDark : AppColors.tealPrimary.withOpacity(0.3))
        : (isDark ? AppColors.slate700 : AppColors.slate200);

    return Align(
      alignment: isOutgoing ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 12),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.82,
        ),
        decoration: BoxDecoration(
          color: bubbleBg,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isOutgoing ? 16 : 4),
            bottomRight: Radius.circular(isOutgoing ? 4 : 16),
          ),
          border: Border.all(color: bubbleBorder, width: 1),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment:
              isOutgoing ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Top metadata row
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  isOutgoing ? "Ke Desktop" : "Dari Desktop",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isDark ? AppColors.slate400 : AppColors.slate600,
                  ),
                ),
                const SizedBox(width: 8),
                TransferStatusChip(status: transfer.status),
              ],
            ),
            const SizedBox(height: 8),

            // Content body
            _buildContent(context, isDark),

            // Streaming Progress Bar
            if (transfer.status == TransferStatus.sending) ...[
              const SizedBox(height: 10),
              SyncProgressBar(
                progress: transfer.progress,
                label: "Mengalirkan data...",
              ),
            ],

            const SizedBox(height: 8),

            // Bottom Actions & Timestamp
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  _formatTime(transfer.createdAt),
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark ? AppColors.slate400 : AppColors.slate600,
                  ),
                ),
                const SizedBox(width: 8),
                _buildActionButtons(context),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, bool isDark) {
    switch (transfer.kind) {
      case TransferKind.text:
      case TransferKind.link:
        return SelectableText(
          transfer.textBody ?? '',
          style: TextStyle(
            fontSize: 15,
            color: transfer.kind == TransferKind.link
                ? AppColors.blueSecondary
                : (isDark ? AppColors.slate50 : AppColors.slate900),
            decoration: transfer.kind == TransferKind.link
                ? TextDecoration.underline
                : TextDecoration.none,
          ),
        );

      case TransferKind.photo:
      case TransferKind.file:
        return Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: isDark ? AppColors.slate900 : AppColors.slate100,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppColors.tealPrimary.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  transfer.kind == TransferKind.photo
                      ? Icons.image_rounded
                      : Icons.insert_drive_file_rounded,
                  color: AppColors.tealPrimary,
                  size: 24,
                ),
              ),
              const SizedBox(width: 10),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      transfer.fileName ?? 'Berkas',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (transfer.fileSize != null)
                      Text(
                        _formatFileSize(transfer.fileSize!),
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.slate600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
    }
  }

  Widget _buildActionButtons(BuildContext context) {
    return Wrap(
      spacing: 4,
      children: [
        // Salin (Copies to clipboard)
        if (transfer.textBody != null)
          _SmallButton(
            icon: Icons.copy_rounded,
            label: "Salin",
            onTap: onCopy ??
                () {
                  Clipboard.setData(ClipboardData(text: transfer.textBody!));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text("Teks berhasil disalin ke papan klip"),
                      duration: Duration(seconds: 2),
                    ),
                  );
                },
          ),

        // Simpan File
        if (transfer.kind == TransferKind.file || transfer.kind == TransferKind.photo) ...[
          if (transfer.status == TransferStatus.done && onOpenFile != null)
            _SmallButton(
              icon: Icons.open_in_new_rounded,
              label: "Buka File",
              onTap: onOpenFile!,
            ),
          if (transfer.status == TransferStatus.done && onSaveFile != null)
            _SmallButton(
              icon: Icons.download_rounded,
              label: "Simpan File",
              onTap: onSaveFile!,
            ),
        ],

        // Coba Lagi (if failed/cancelled)
        if (transfer.status == TransferStatus.failed ||
            transfer.status == TransferStatus.cancelled)
          if (onRetry != null)
            _SmallButton(
              icon: Icons.refresh_rounded,
              label: "Coba Lagi",
              onTap: onRetry!,
            ),

        // Batal (if waiting/sending)
        if (transfer.status == TransferStatus.waiting ||
            transfer.status == TransferStatus.sending)
          if (onCancel != null)
            _SmallButton(
              icon: Icons.close_rounded,
              label: "Batal",
              isDestructive: true,
              onTap: onCancel!,
            ),
      ],
    );
  }

  String _formatTime(DateTime dt) {
    final hour = dt.hour.toString().padLeft(2, '0');
    final minute = dt.minute.toString().padLeft(2, '0');
    return "$hour:$minute";
  }

  String _formatFileSize(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    if (bytes < 1024 * 1024 * 1024) {
      return "${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB";
    }
    return "${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB";
  }
}

class _SmallButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool isDestructive;

  const _SmallButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isDestructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = isDestructive ? AppColors.statusFailed : AppColors.tealPrimary;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
