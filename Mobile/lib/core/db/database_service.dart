import 'dart:io';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'models.dart';

class DatabaseService {
  static Database? _database;
  static const String dbName = 'syncboard.db';
  static const int dbVersion = 1;

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final Directory documentsDir = await getApplicationDocumentsDirectory();
    final String path = p.join(documentsDir.path, dbName);

    return await openDatabase(
      path,
      version: dbVersion,
      onCreate: _onCreate,
    );
  }

  Future<void> _onCreate(Database db, int version) async {
    // 1. Devices Table (Trusted devices, NO SECRETS!)
    await db.execute('''
      CREATE TABLE devices (
        device_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cert_fingerprint TEXT NOT NULL,
        last_host TEXT NOT NULL,
        port INTEGER NOT NULL DEFAULT 48620,
        paired_at INTEGER NOT NULL,
        last_connected_at INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 0
      )
    ''');

    // 2. Transfers Table
    await db.execute('''
      CREATE TABLE transfers (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
        kind TEXT NOT NULL CHECK(kind IN ('text', 'link', 'photo', 'file')),
        text_body TEXT,
        file_name TEXT,
        file_size INTEGER,
        saved_path TEXT,
        status TEXT NOT NULL CHECK(status IN ('Menunggu', 'Mengirim', 'Selesai', 'Dibatalkan', 'Gagal')),
        progress REAL NOT NULL DEFAULT 0.0,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      )
    ''');

    // 3. Settings Table
    await db.execute('''
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    ''');
  }

  // --- Devices Operations ---

  Future<void> saveDevice(DeviceItem device) async {
    final db = await database;
    await db.insert(
      'devices',
      {
        'device_id': device.deviceId,
        'name': device.name,
        'cert_fingerprint': device.certFingerprint,
        'last_host': device.lastHost,
        'port': device.port,
        'paired_at': device.pairedAt.millisecondsSinceEpoch,
        'last_connected_at': device.lastConnectedAt.millisecondsSinceEpoch,
        'is_active': device.isActive ? 1 : 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<DeviceItem>> getAllDevices() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'devices',
      orderBy: 'last_connected_at DESC',
    );

    return maps.map((map) {
      return DeviceItem(
        deviceId: map['device_id'] as String,
        name: map['name'] as String,
        certFingerprint: map['cert_fingerprint'] as String,
        lastHost: map['last_host'] as String,
        port: map['port'] as int,
        pairedAt: DateTime.fromMillisecondsSinceEpoch(map['paired_at'] as int),
        lastConnectedAt: DateTime.fromMillisecondsSinceEpoch(map['last_connected_at'] as int),
        isActive: (map['is_active'] as int) == 1,
      );
    }).toList();
  }

  Future<DeviceItem?> getDevice(String deviceId) async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'devices',
      where: 'device_id = ?',
      whereArgs: [deviceId],
      limit: 1,
    );
    if (maps.isEmpty) return null;
    final map = maps.first;
    return DeviceItem(
      deviceId: map['device_id'] as String,
      name: map['name'] as String,
      certFingerprint: map['cert_fingerprint'] as String,
      lastHost: map['last_host'] as String,
      port: map['port'] as int,
      pairedAt: DateTime.fromMillisecondsSinceEpoch(map['paired_at'] as int),
      lastConnectedAt: DateTime.fromMillisecondsSinceEpoch(map['last_connected_at'] as int),
      isActive: (map['is_active'] as int) == 1,
    );
  }

  Future<void> updateDeviceName(String deviceId, String newName) async {
    final db = await database;
    await db.update(
      'devices',
      {'name': newName},
      where: 'device_id = ?',
      whereArgs: [deviceId],
    );
  }

  Future<DeviceItem?> getActiveDevice() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'devices',
      where: 'is_active = 1',
      limit: 1,
    );
    if (maps.isEmpty) return null;
    final map = maps.first;
    return DeviceItem(
      deviceId: map['device_id'] as String,
      name: map['name'] as String,
      certFingerprint: map['cert_fingerprint'] as String,
      lastHost: map['last_host'] as String,
      port: map['port'] as int,
      pairedAt: DateTime.fromMillisecondsSinceEpoch(map['paired_at'] as int),
      lastConnectedAt: DateTime.fromMillisecondsSinceEpoch(map['last_connected_at'] as int),
      isActive: true,
    );
  }

  Future<void> setActiveDevice(String? deviceId) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.update('devices', {'is_active': 0});
      if (deviceId != null) {
        await txn.update(
          'devices',
          {'is_active': 1, 'last_connected_at': DateTime.now().millisecondsSinceEpoch},
          where: 'device_id = ?',
          whereArgs: [deviceId],
        );
      }
    });
  }

  Future<void> deleteDevice(String deviceId) async {
    final db = await database;
    await db.delete(
      'devices',
      where: 'device_id = ?',
      whereArgs: [deviceId],
    );
  }

  // --- Transfers Operations ---

  Future<void> saveTransfer(TransferItem item) async {
    final db = await database;
    await db.insert(
      'transfers',
      {
        'id': item.id,
        'device_id': item.deviceId,
        'direction': item.direction == TransferDirection.incoming ? 'in' : 'out',
        'kind': item.kind.name,
        'text_body': item.textBody,
        'file_name': item.fileName,
        'file_size': item.fileSize,
        'saved_path': item.savedPath,
        'status': item.status.label,
        'progress': item.progress,
        'pinned': item.pinned ? 1 : 0,
        'created_at': item.createdAt.millisecondsSinceEpoch,
        'expires_at': item.expiresAt?.millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<TransferItem>> getAllTransfers() async {
    final db = await database;
    final List<Map<String, dynamic>> maps = await db.query(
      'transfers',
      orderBy: 'pinned DESC, created_at DESC',
    );

    return maps.map((map) {
      final dirStr = map['direction'] as String;
      final kindStr = map['kind'] as String;
      final statusStr = map['status'] as String;

      final direction = dirStr == 'in' ? TransferDirection.incoming : TransferDirection.outgoing;
      final kind = TransferKind.values.firstWhere(
        (k) => k.name == kindStr,
        orElse: () => TransferKind.text,
      );
      final status = TransferStatus.values.firstWhere(
        (s) => s.label == statusStr,
        orElse: () => TransferStatus.waiting,
      );

      return TransferItem(
        id: map['id'] as String,
        deviceId: map['device_id'] as String,
        direction: direction,
        kind: kind,
        textBody: map['text_body'] as String?,
        fileName: map['file_name'] as String?,
        fileSize: map['file_size'] as int?,
        savedPath: map['saved_path'] as String?,
        status: status,
        progress: (map['progress'] as num?)?.toDouble() ?? 0.0,
        pinned: (map['pinned'] as int) == 1,
        createdAt: DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
        expiresAt: map['expires_at'] != null
            ? DateTime.fromMillisecondsSinceEpoch(map['expires_at'] as int)
            : null,
      );
    }).toList();
  }

  Future<void> updateTransferStatus(String id, TransferStatus status, {String? savedPath, double? progress}) async {
    final db = await database;
    final values = <String, dynamic>{
      'status': status.label,
    };
    if (savedPath != null) values['saved_path'] = savedPath;
    if (progress != null) values['progress'] = progress;

    await db.update('transfers', values, where: 'id = ?', whereArgs: [id]);
  }

  Future<void> setTransferPinned(String id, bool pinned) async {
    final db = await database;
    await db.update(
      'transfers',
      {'pinned': pinned ? 1 : 0},
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> deleteTransfer(String id) async {
    final db = await database;
    await db.delete('transfers', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> clearAllTransfers() async {
    final db = await database;
    await db.delete('transfers');
  }

  /// Cleans up expired transfers in "Kirim Sekali" mode.
  Future<int> cleanupExpired(DateTime now) async {
    final db = await database;
    return await db.delete(
      'transfers',
      where: 'expires_at IS NOT NULL AND expires_at <= ?',
      whereArgs: [now.millisecondsSinceEpoch],
    );
  }
}
