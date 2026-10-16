import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';

abstract class ISecureStorageService {
  Future<void> storeClientSecret(String deviceId, String secret);
  Future<String?> getClientSecret(String deviceId);
  Future<bool> removeClientSecret(String deviceId);
  Future<String> getOrCreatePhoneDeviceId();
  Future<void> clearAllSecrets();
}

class SecureStorageService implements ISecureStorageService {
  final FlutterSecureStorage _storage;
  static const _uuid = Uuid();

  SecureStorageService([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(
                encryptedSharedPreferences: true,
                resetOnError: true,
              ),
            );

  @override
  Future<void> storeClientSecret(String deviceId, String secret) async {
    await _storage.write(key: 'secret_$deviceId', value: secret);
  }

  @override
  Future<String?> getClientSecret(String deviceId) async {
    return await _storage.read(key: 'secret_$deviceId');
  }

  @override
  Future<bool> removeClientSecret(String deviceId) async {
    final key = 'secret_$deviceId';
    final exists = await _storage.containsKey(key: key);
    if (exists) {
      await _storage.delete(key: key);
      return true;
    }
    return false;
  }

  @override
  Future<String> getOrCreatePhoneDeviceId() async {
    const key = 'phone_device_id';
    final existing = await _storage.read(key: key);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }
    final newId = _uuid.v4();
    await _storage.write(key: key, value: newId);
    return newId;
  }

  @override
  Future<void> clearAllSecrets() async {
    await _storage.deleteAll();
  }
}

class InMemorySecureStorageService implements ISecureStorageService {
  final Map<String, String> _memory = {};
  static const _uuid = Uuid();

  @override
  Future<void> storeClientSecret(String deviceId, String secret) async {
    _memory['secret_$deviceId'] = secret;
  }

  @override
  Future<String?> getClientSecret(String deviceId) async {
    return _memory['secret_$deviceId'];
  }

  @override
  Future<bool> removeClientSecret(String deviceId) async {
    return _memory.remove('secret_$deviceId') != null;
  }

  @override
  Future<String> getOrCreatePhoneDeviceId() async {
    const key = 'phone_device_id';
    if (_memory.containsKey(key)) {
      return _memory[key]!;
    }
    final newId = _uuid.v4();
    _memory[key] = newId;
    return newId;
  }

  @override
  Future<void> clearAllSecrets() async {
    _memory.clear();
  }
}
