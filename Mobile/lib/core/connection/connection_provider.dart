import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../secrets/secure_storage_service.dart';
import 'connection_manager.dart';

enum ConnectionStatus {
  connected('Terhubung'),
  connecting('Menghubungkan'),
  disconnected('Tidak terhubung');

  final String label;
  const ConnectionStatus(this.label);
}

final databaseServiceProvider = Provider<DatabaseService>((ref) {
  return DatabaseService();
});

final secureStorageServiceProvider = Provider<ISecureStorageService>((ref) {
  return SecureStorageService();
});

// ConnectionManager singleton provider
final connectionManagerProvider = Provider<ConnectionManager>((ref) {
  final secureStorage = ref.watch(secureStorageServiceProvider);
  final dbService = ref.watch(databaseServiceProvider);

  final manager = ConnectionManager(
    secureStorage: secureStorage,
    databaseService: dbService,
  );

  ref.onDispose(() {
    manager.dispose();
  });

  return manager;
});

// Connection status stream provider
final connectionStatusProvider = StateProvider<ConnectionStatus>((ref) {
  final manager = ref.watch(connectionManagerProvider);
  manager.statusStream.listen((newStatus) {
    ref.controller.state = newStatus;
  });
  return manager.status;
});

// Currently active desktop device
final activeDeviceProvider = StateProvider<DeviceItem?>((ref) {
  final dbService = ref.watch(databaseServiceProvider);
  final connManager = ref.watch(connectionManagerProvider);

  // Asynchronously load active device from SQLite on app startup
  dbService.getActiveDevice().then((active) {
    if (active != null && ref.controller.state == null) {
      ref.controller.state = active;
      if (connManager.status == ConnectionStatus.disconnected) {
        connManager.connectToDevice(active);
      }
    }
  }).catchError((_) {});

  return null;
});

// All trusted paired devices
final trustedDevicesProvider = StateNotifierProvider<TrustedDevicesNotifier, List<DeviceItem>>((ref) {
  final dbService = ref.watch(databaseServiceProvider);
  final notifier = TrustedDevicesNotifier(dbService);
  notifier.loadDevices();
  return notifier;
});

class TrustedDevicesNotifier extends StateNotifier<List<DeviceItem>> {
  final DatabaseService _dbService;

  TrustedDevicesNotifier(this._dbService) : super([]);

  Future<void> loadDevices() async {
    try {
      final devices = await _dbService.getAllDevices();
      state = devices;
    } catch (_) {
      // If DB is in memory or test environment
    }
  }

  Future<void> rename(String deviceId, String newName) async {
    await _dbService.updateDeviceName(deviceId, newName);
    state = [
      for (final dev in state)
        if (dev.deviceId == deviceId) dev.copyWith(name: newName) else dev
    ];
  }

  Future<void> unpair(String deviceId) async {
    await _dbService.deleteDevice(deviceId);
    state = state.where((dev) => dev.deviceId != deviceId).toList();
  }

  Future<void> setActive(String? deviceId) async {
    await _dbService.setActiveDevice(deviceId);
    state = [
      for (final dev in state)
        dev.copyWith(isActive: dev.deviceId == deviceId)
    ];
  }

  void addDevice(DeviceItem device) {
    state = [
      ...state.where((d) => d.deviceId != device.deviceId),
      device,
    ];
  }
}
