import 'dart:io';
import 'dart:isolate';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:permission_handler/permission_handler.dart';

@pragma('vm:entry-point')
void startCallback() {
  FlutterForegroundTask.setTaskHandler(SyncBoardTaskHandler());
}

class SyncBoardTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, SendPort? sendPort) async {}

  @override
  void onRepeatEvent(DateTime timestamp, SendPort? sendPort) {}

  @override
  Future<void> onDestroy(DateTime timestamp, SendPort? sendPort) async {}
}

class ForegroundServiceManager {
  static bool _initialized = false;

  /// Initializes foreground task configuration.
  static void init() {
    if (_initialized) return;

    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'syncboard_foreground_channel',
        channelName: 'Layanan Koneksi SyncBoard',
        channelDescription: 'Menjaga koneksi tetap aktif untuk transfer teks dan berkas',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
        playSound: false,
      ),
      foregroundTaskOptions: const ForegroundTaskOptions(
        interval: 5000,
        isOnceEvent: false,
        autoRunOnBoot: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );

    _initialized = true;
  }

  /// Requests notification permission on Android 13+ with an Indonesian explanation dialog.
  static Future<bool> requestNotificationPermissionIfNeeded(BuildContext context) async {
    if (!Platform.isAndroid) return true;

    final status = await Permission.notification.status;
    if (status.isGranted) return true;

    // Show educational rationale dialog before asking system permission
    final proceed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text("Izin Notifikasi Layanan"),
        content: const Text(
          "SyncBoard memerlukan izin notifikasi untuk menampilkan status koneksi latar depan agar transfer tidak terputus saat aplikasi diminimalkan atau layar mati.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Nanti Saja"),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Izinkan"),
          ),
        ],
      ),
    );

    if (proceed == true) {
      final res = await Permission.notification.request();
      return res.isGranted;
    }
    return false;
  }

  /// Starts the foreground service with persistent notification while device is connected.
  static Future<void> startService({required String desktopName}) async {
    init();

    final isRunning = await FlutterForegroundTask.isRunningService;
    if (isRunning) {
      await FlutterForegroundTask.updateService(
        notificationTitle: "SyncBoard Aktif",
        notificationText: "Terhubung ke $desktopName",
      );
      return;
    }

    await FlutterForegroundTask.startService(
      notificationTitle: "SyncBoard Aktif",
      notificationText: "Terhubung ke $desktopName",
      callback: startCallback,
    );
  }

  /// Stops the foreground service immediately when disconnected.
  static Future<void> stopService() async {
    final isRunning = await FlutterForegroundTask.isRunningService;
    if (isRunning) {
      await FlutterForegroundTask.stopService();
    }
  }
}
