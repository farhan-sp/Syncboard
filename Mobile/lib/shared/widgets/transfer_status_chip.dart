import 'package:flutter/material.dart';
import '../../core/db/models.dart';
import '../theme/app_theme.dart';

class TransferStatusChip extends StatelessWidget {
  final TransferStatus status;

  const TransferStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color text;

    switch (status) {
      case TransferStatus.done:
        bg = AppColors.statusDone.withOpacity(0.15);
        text = AppColors.statusDone;
        break;
      case TransferStatus.sending:
        bg = AppColors.statusSending.withOpacity(0.15);
        text = AppColors.statusSending;
        break;
      case TransferStatus.waiting:
        bg = AppColors.statusWaiting.withOpacity(0.15);
        text = AppColors.statusWaiting;
        break;
      case TransferStatus.failed:
        bg = AppColors.statusFailed.withOpacity(0.15);
        text = AppColors.statusFailed;
        break;
      case TransferStatus.cancelled:
        bg = AppColors.statusCancelled.withOpacity(0.15);
        text = AppColors.statusCancelled;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: text,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
