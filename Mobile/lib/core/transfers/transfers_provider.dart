import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../connection/connection_provider.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../db/settings_provider.dart';
import 'file_transfer_manager.dart';
import 'retention_cleanup_service.dart';
import 'text_transfer_manager.dart';

final fileTransferManagerProvider = Provider<FileTransferManager>((ref) {
  final connectionManager = ref.watch(connectionManagerProvider);
  final dbService = ref.watch(databaseServiceProvider);

  final manager = FileTransferManager(
    connectionManager: connectionManager,
    databaseService: dbService,
  );

  ref.onDispose(() {
    manager.dispose();
  });

  return manager;
});

final textTransferManagerProvider = Provider<TextTransferManager>((ref) {
  final connectionManager = ref.watch(connectionManagerProvider);
  final dbService = ref.watch(databaseServiceProvider);

  final manager = TextTransferManager(
    connectionManager: connectionManager,
    databaseService: dbService,
  );

  ref.onDispose(() {
    manager.dispose();
  });

  return manager;
});

final Provider<RetentionCleanupService> retentionCleanupServiceProvider =
    Provider<RetentionCleanupService>((ref) {
  final dbService = ref.watch(databaseServiceProvider);
  final service = RetentionCleanupService(
    databaseService: dbService,
    onRecordsCleaned: () {
      ref.read(transfersProvider.notifier).loadInitialTransfers();
    },
  );
  service.start();
  ref.onDispose(() {
    service.stop();
  });
  return service;
});

final StateNotifierProvider<TransfersNotifier, List<TransferItem>> transfersProvider =
    StateNotifierProvider<TransfersNotifier, List<TransferItem>>((ref) {
  final dbService = ref.watch(databaseServiceProvider);
  final textManager = ref.watch(textTransferManagerProvider);
  final fileManager = ref.watch(fileTransferManagerProvider);
  final settings = ref.watch(settingsProvider);

  // Keep retention cleanup service active
  ref.watch(retentionCleanupServiceProvider);

  final notifier = TransfersNotifier(
    dbService: dbService,
    textManager: textManager,
    fileManager: fileManager,
    settings: settings,
  );

  notifier.loadInitialTransfers();
  return notifier;
});

class TransfersNotifier extends StateNotifier<List<TransferItem>> {
  final DatabaseService dbService;
  final TextTransferManager textManager;
  final FileTransferManager fileManager;
  final SettingsData settings;

  TransfersNotifier({
    required this.dbService,
    required this.textManager,
    required this.fileManager,
    required this.settings,
  }) : super([]) {
    // 1. Listen to incoming text stream
    textManager.incomingTextStream.listen((incomingItem) {
      _upsertItem(incomingItem);
    });

    // 2. Listen to file transfer progress & state updates
    fileManager.transferUpdateStream.listen((updatedItem) {
      _upsertItem(updatedItem);
    });
  }

  void _upsertItem(TransferItem newItem) {
    state = [
      ...state.where((item) => item.id != newItem.id),
      newItem,
    ];
  }

  Future<void> loadInitialTransfers() async {
    try {
      final items = await dbService.getAllTransfers();
      if (items.isNotEmpty) {
        state = items;
      } else {
        state = [
          TransferItem(
            id: 'tr-001',
            deviceId: 'desktop-macbook-pro',
            direction: TransferDirection.incoming,
            kind: TransferKind.text,
            textBody: 'Catatan penting: Mohon cek dokumen anggaran proyek sebelum rapat jam 14:00.',
            status: TransferStatus.done,
            pinned: true,
            createdAt: DateTime.now().subtract(const Duration(minutes: 45)),
          ),
          TransferItem(
            id: 'tr-002',
            deviceId: 'desktop-macbook-pro',
            direction: TransferDirection.incoming,
            kind: TransferKind.link,
            textBody: 'https://flutter.dev/docs/get-started/install',
            status: TransferStatus.done,
            pinned: false,
            createdAt: DateTime.now().subtract(const Duration(minutes: 32)),
          ),
        ];
      }
    } catch (_) {}
  }

  Future<void> sendText(String text, {String? targetDeviceId}) async {
    final devId = targetDeviceId ?? 'desktop-macbook-pro';
    final isUrl = Uri.tryParse(text)?.hasAbsolutePath ?? false;

    final tempId = 'temp-${DateTime.now().millisecondsSinceEpoch}';
    final tempItem = TransferItem(
      id: tempId,
      deviceId: devId,
      direction: TransferDirection.outgoing,
      kind: isUrl ? TransferKind.link : TransferKind.text,
      textBody: text, // Preserved without trimming
      status: TransferStatus.sending,
      createdAt: DateTime.now(),
    );

    state = [...state, tempItem];

    try {
      final resultItem = await textManager.sendText(
        body: text,
        targetDeviceId: devId,
        retentionMode: settings.retentionMode,
        retentionDurationMinutes: settings.retentionDurationMinutes,
      );

      state = [
        for (final item in state)
          if (item.id == tempId) resultItem else item
      ];
    } catch (_) {
      state = [
        for (final item in state)
          if (item.id == tempId) tempItem.copyWith(status: TransferStatus.failed) else item
      ];
    }
  }

  Future<void> sendFile(File file, {required String targetDeviceId, bool isPhoto = false}) async {
    await fileManager.sendFile(
      file: file,
      targetDeviceId: targetDeviceId,
      isPhoto: isPhoto,
    );
  }

  Future<void> togglePin(String id) async {
    final current = state.firstWhere((t) => t.id == id);
    final newPinned = !current.pinned;
    await dbService.setTransferPinned(id, newPinned);

    state = [
      for (final item in state)
        if (item.id == id) item.copyWith(pinned: newPinned) else item
    ];
  }

  Future<void> delete(String id) async {
    await dbService.deleteTransfer(id);
    state = state.where((item) => item.id != id).toList();
  }

  Future<void> clearAll() async {
    await dbService.clearAllTransfers();
    state = [];
  }

  Future<void> retry(String id) async {
    final item = state.firstWhere((t) => t.id == id);
    if (item.kind == TransferKind.text || item.kind == TransferKind.link) {
      final updated = await textManager.retrySendText(item);
      state = [
        for (final it in state)
          if (it.id == id) updated else it
      ];
    } else if (item.savedPath != null) {
      final file = File(item.savedPath!);
      if (file.existsSync()) {
        await fileManager.sendFile(
          file: file,
          targetDeviceId: item.deviceId,
          isPhoto: item.kind == TransferKind.photo,
        );
      }
    }
  }

  void cancel(String id) {
    fileManager.cancelTransfer(id);
    dbService.updateTransferStatus(id, TransferStatus.cancelled);
    state = [
      for (final item in state)
        if (item.id == id) item.copyWith(status: TransferStatus.cancelled) else item
    ];
  }
}
