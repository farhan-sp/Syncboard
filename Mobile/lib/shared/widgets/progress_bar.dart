import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class SyncProgressBar extends StatelessWidget {
  final double progress; // 0.0 to 1.0
  final String? label;

  const SyncProgressBar({
    super.key,
    required this.progress,
    this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (label != null) ...[
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label!,
                style: const TextStyle(fontSize: 11, color: AppColors.slate600),
              ),
              Text(
                "${(progress * 100).toInt()}%",
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: AppColors.tealPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
        ],
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: progress.clamp(0.0, 1.0),
            minHeight: 6,
            backgroundColor: AppColors.slate200,
            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.tealPrimary),
          ),
        ),
      ],
    );
  }
}
