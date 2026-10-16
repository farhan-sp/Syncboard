import 'dart:async';
import 'package:flutter/foundation.dart';
import '../db/database_service.dart';

class RetentionCleanupService {
  final DatabaseService databaseService;
  final VoidCallback onRecordsCleaned;
  Timer? _timer;

  RetentionCleanupService({
    required this.databaseService,
    required this.onRecordsCleaned,
  });

  /// Starts periodic timer checking and deleting expired transfers in "Kirim Sekali" mode
  void start() {
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) => runCleanup());
    // Also run an immediate cleanup check on launch
    runCleanup();
  }

  Future<int> runCleanup() async {
    try {
      final now = DateTime.now();
      final deletedCount = await databaseService.cleanupExpired(now);
      if (deletedCount > 0) {
        onRecordsCleaned();
      }
      return deletedCount;
    } catch (_) {
      return 0;
    }
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }
}
