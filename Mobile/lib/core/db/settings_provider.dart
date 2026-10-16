import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models.dart';

final settingsProvider = StateNotifierProvider<SettingsNotifier, SettingsData>((ref) {
  final notifier = SettingsNotifier();
  notifier.loadSettings();
  return notifier;
});

class SettingsNotifier extends StateNotifier<SettingsData> {
  SettingsNotifier()
      : super(SettingsData(
          deviceId: 'phone-android-syncboard-01',
          deviceName: 'Ponsel Android Saya',
          saveFolder: 'Unduhan/SyncBoard',
          retentionMode: RetentionMode.save,
          retentionDurationMinutes: 60,
          requireFileConfirmation: true,
          themeMode: ThemeModeOption.system,
          defaultPort: 48620,
        ));

  Future<void> loadSettings() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      final name = prefs.getString('settings_device_name') ?? state.deviceName;
      final folder = prefs.getString('settings_save_folder') ?? state.saveFolder;
      final retentionStr = prefs.getString('settings_retention_mode') ?? 'simpan';
      final duration = prefs.getInt('settings_retention_duration') ?? state.retentionDurationMinutes;
      final reqConfirm = prefs.getBool('settings_require_confirmation') ?? state.requireFileConfirmation;
      final themeStr = prefs.getString('settings_theme_mode') ?? 'system';
      final port = prefs.getInt('settings_default_port') ?? state.defaultPort;

      final retentionMode = retentionStr == 'kirim_sekali' ? RetentionMode.sendOnce : RetentionMode.save;
      final themeMode = ThemeModeOption.values.firstWhere(
        (t) => t.name == themeStr,
        orElse: () => ThemeModeOption.system,
      );

      state = state.copyWith(
        deviceName: name,
        saveFolder: folder,
        retentionMode: retentionMode,
        retentionDurationMinutes: duration,
        requireFileConfirmation: reqConfirm,
        themeMode: themeMode,
        defaultPort: port,
      );
    } catch (_) {}
  }

  Future<void> updateDeviceName(String name) async {
    state = state.copyWith(deviceName: name);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('settings_device_name', name);
  }

  Future<void> updateRetentionMode(RetentionMode mode) async {
    state = state.copyWith(retentionMode: mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('settings_retention_mode', mode == RetentionMode.sendOnce ? 'kirim_sekali' : 'simpan');
  }

  Future<void> updateRetentionDuration(int minutes) async {
    state = state.copyWith(retentionDurationMinutes: minutes);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('settings_retention_duration', minutes);
  }

  Future<void> updateRequireConfirmation(bool req) async {
    state = state.copyWith(requireFileConfirmation: req);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('settings_require_confirmation', req);
  }

  Future<void> updateThemeMode(ThemeModeOption mode) async {
    state = state.copyWith(themeMode: mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('settings_theme_mode', mode.name);
  }

  Future<void> updateSaveFolder(String path) async {
    state = state.copyWith(saveFolder: path);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('settings_save_folder', path);
  }

  Future<void> updateDefaultPort(int port) async {
    state = state.copyWith(defaultPort: port);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('settings_default_port', port);
  }
}
