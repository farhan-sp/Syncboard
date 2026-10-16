enum TransferDirection {
  incoming('Masuk'),
  outgoing('Keluar');

  final String label;
  const TransferDirection(this.label);
}

enum TransferKind {
  text('Teks'),
  link('Tautan'),
  photo('Foto'),
  file('Berkas');

  final String label;
  const TransferKind(this.label);
}

enum TransferStatus {
  waiting('Menunggu'),
  sending('Mengirim'),
  done('Selesai'),
  cancelled('Dibatalkan'),
  failed('Gagal');

  final String label;
  const TransferStatus(this.label);
}

enum RetentionMode {
  sendOnce('Kirim Sekali'),
  save('Simpan');

  final String label;
  const RetentionMode(this.label);
}

enum ThemeModeOption {
  system('Ikuti Sistem'),
  light('Terang'),
  dark('Gelap');

  final String label;
  const ThemeModeOption(this.label);
}

class TransferItem {
  final String id;
  final String deviceId;
  final TransferDirection direction;
  final TransferKind kind;
  final String? textBody;
  final String? fileName;
  final int? fileSize;
  final String? savedPath;
  final TransferStatus status;
  final double progress;
  final bool pinned;
  final DateTime createdAt;
  final DateTime? expiresAt;

  TransferItem({
    required this.id,
    required this.deviceId,
    required this.direction,
    required this.kind,
    this.textBody,
    this.fileName,
    this.fileSize,
    this.savedPath,
    this.status = TransferStatus.waiting,
    this.progress = 0.0,
    this.pinned = false,
    required this.createdAt,
    this.expiresAt,
  });

  TransferItem copyWith({
    String? id,
    String? deviceId,
    TransferDirection? direction,
    TransferKind? kind,
    String? textBody,
    String? fileName,
    int? fileSize,
    String? savedPath,
    TransferStatus? status,
    double? progress,
    bool? pinned,
    DateTime? createdAt,
    DateTime? expiresAt,
  }) {
    return TransferItem(
      id: id ?? this.id,
      deviceId: deviceId ?? this.deviceId,
      direction: direction ?? this.direction,
      kind: kind ?? this.kind,
      textBody: textBody ?? this.textBody,
      fileName: fileName ?? this.fileName,
      fileSize: fileSize ?? this.fileSize,
      savedPath: savedPath ?? this.savedPath,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      pinned: pinned ?? this.pinned,
      createdAt: createdAt ?? this.createdAt,
      expiresAt: expiresAt ?? this.expiresAt,
    );
  }
}

class DeviceItem {
  final String deviceId;
  final String name;
  final String certFingerprint;
  final String lastHost;
  final int port;
  final DateTime pairedAt;
  final DateTime lastConnectedAt;
  final bool isActive;

  DeviceItem({
    required this.deviceId,
    required this.name,
    required this.certFingerprint,
    required this.lastHost,
    this.port = 48620,
    required this.pairedAt,
    required this.lastConnectedAt,
    this.isActive = false,
  });

  DeviceItem copyWith({
    String? deviceId,
    String? name,
    String? certFingerprint,
    String? lastHost,
    int? port,
    DateTime? pairedAt,
    DateTime? lastConnectedAt,
    bool? isActive,
  }) {
    return DeviceItem(
      deviceId: deviceId ?? this.deviceId,
      name: name ?? this.name,
      certFingerprint: certFingerprint ?? this.certFingerprint,
      lastHost: lastHost ?? this.lastHost,
      port: port ?? this.port,
      pairedAt: pairedAt ?? this.pairedAt,
      lastConnectedAt: lastConnectedAt ?? this.lastConnectedAt,
      isActive: isActive ?? this.isActive,
    );
  }
}

class SettingsData {
  final String deviceId;
  final String deviceName;
  final String saveFolder;
  final RetentionMode retentionMode;
  final int retentionDurationMinutes;
  final bool requireFileConfirmation;
  final ThemeModeOption themeMode;
  final int defaultPort;

  SettingsData({
    required this.deviceId,
    required this.deviceName,
    this.saveFolder = 'Unduhan/SyncBoard',
    this.retentionMode = RetentionMode.save,
    this.retentionDurationMinutes = 60,
    this.requireFileConfirmation = true,
    this.themeMode = ThemeModeOption.system,
    this.defaultPort = 48620,
  });

  SettingsData copyWith({
    String? deviceId,
    String? deviceName,
    String? saveFolder,
    RetentionMode? retentionMode,
    int? retentionDurationMinutes,
    bool? requireFileConfirmation,
    ThemeModeOption? themeMode,
    int? defaultPort,
  }) {
    return SettingsData(
      deviceId: deviceId ?? this.deviceId,
      deviceName: deviceName ?? this.deviceName,
      saveFolder: saveFolder ?? this.saveFolder,
      retentionMode: retentionMode ?? this.retentionMode,
      retentionDurationMinutes:
          retentionDurationMinutes ?? this.retentionDurationMinutes,
      requireFileConfirmation:
          requireFileConfirmation ?? this.requireFileConfirmation,
      themeMode: themeMode ?? this.themeMode,
      defaultPort: defaultPort ?? this.defaultPort,
    );
  }
}
