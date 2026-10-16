import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/crypto/crypto_utils.dart';
import 'package:syncboard_mobile/core/db/database_service.dart';
import 'package:syncboard_mobile/core/pairing/pairing_manager.dart';
import 'package:syncboard_mobile/core/protocol/protocol_models.dart';
import 'package:syncboard_mobile/core/secrets/secure_storage_service.dart';

void main() {
  group('Milestone 2 - Pairing & Verification Code Tests', () {
    late ISecureStorageService secureStorage;

    setUp(() {
      secureStorage = InMemorySecureStorageService();
    });

    test('Expired QR code throws QrExpiredException', () async {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final expiredQr = QrPayload(
        v: 1,
        deviceId: 'desktop-macbook',
        deviceName: 'MacBook Pro Desktop',
        hosts: ['192.168.1.50'],
        port: 48620,
        certFingerprint: 'SHA256:AA:BB:CC:DD',
        pairToken: 'test-token',
        expiresAt: nowSec - 30, // 30 seconds ago
      );

      final manager = PairingManager(
        secureStorage: secureStorage,
        databaseService: DatabaseService(),
      );

      expect(
        () => manager.initiatePairing(qr: expiredQr, phoneDeviceName: 'Ponsel'),
        throwsA(isA<QrExpiredException>()),
      );
    });

    test('Incompatible protocol version throws FormatException', () async {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final incompatibleQr = QrPayload(
        v: 99, // Future/incompatible version
        deviceId: 'desktop-future',
        deviceName: 'Future Desktop',
        hosts: ['192.168.1.50'],
        port: 48620,
        certFingerprint: 'SHA256:AA:BB:CC:DD',
        pairToken: 'test-token',
        expiresAt: nowSec + 120,
      );

      final manager = PairingManager(
        secureStorage: secureStorage,
        databaseService: DatabaseService(),
      );

      expect(
        () => manager.initiatePairing(qr: incompatibleQr, phoneDeviceName: 'Ponsel'),
        throwsA(isA<FormatException>()),
      );
    });

    test('6-digit verification code is derived deterministically with random token', () async {
      const desktopId = 'desktop-pc-001';
      final phoneId = await secureStorage.getOrCreatePhoneDeviceId();
      final pairToken = CryptoUtils.generateClientSecret(32);

      final codeFromPhone = CryptoUtils.deriveVerificationCode(pairToken, desktopId, phoneId);
      final codeFromDesktop = CryptoUtils.deriveVerificationCode(pairToken, desktopId, phoneId);

      expect(codeFromPhone, equals(codeFromDesktop));
      expect(codeFromPhone.length, 7); // "XXX-XXX"
      expect(codeFromPhone[3], '-');
    });

    test('Client secret generated has 32 bytes entropy and is stored securely', () async {
      final secret = CryptoUtils.generateClientSecret(32);
      expect(secret.isNotEmpty, isTrue);

      await secureStorage.storeClientSecret('desktop-001', secret);
      final retrieved = await secureStorage.getClientSecret('desktop-001');

      expect(retrieved, equals(secret));

      // Unpair wipes secret
      final removed = await secureStorage.removeClientSecret('desktop-001');
      expect(removed, isTrue);
      expect(await secureStorage.getClientSecret('desktop-001'), isNull);
    });
  });
}
