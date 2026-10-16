import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/protocol/protocol_constants.dart';
import 'package:syncboard_mobile/core/protocol/protocol_models.dart';

void main() {
  group('SyncBoard Protocol (v1) Message Tests', () {
    test('QrPayload serialization & expiration check', () {
      final nowSec = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final payload = QrPayload(
        v: 1,
        deviceId: 'desktop-test-id',
        deviceName: 'PC Desktop Penguji',
        hosts: ['192.168.1.50', '10.0.0.5'],
        port: 48620,
        certFingerprint: 'SHA256:AA:BB:CC:DD',
        pairToken: 'token-32-bytes-random',
        expiresAt: nowSec + 120, // 2 minutes in future
      );

      final json = payload.toJson();
      expect(json['v'], 1);
      expect(json['deviceId'], 'desktop-test-id');
      expect(json['port'], ProtocolConstants.defaultPort);
      expect(payload.isExpired, isFalse);

      final parsed = QrPayload.fromJson(json);
      expect(parsed.deviceName, 'PC Desktop Penguji');
      expect(parsed.hosts.length, 2);

      // Expired payload
      final expiredPayload = QrPayload(
        v: 1,
        deviceId: 'desktop-test-id',
        deviceName: 'PC Desktop',
        hosts: ['192.168.1.50'],
        port: 48620,
        certFingerprint: 'SHA256:AA:BB:CC:DD',
        pairToken: 'token',
        expiresAt: nowSec - 10, // In past
      );
      expect(expiredPayload.isExpired, isTrue);
    });

    test('PairRequestMessage serialization', () {
      final msg = PairRequestMessage(
        deviceId: 'phone-01',
        deviceName: 'Ponsel Penguji',
        pairToken: 'token-abc',
        clientSecret: 'secret-xyz',
      );

      final json = msg.toJson();
      expect(json['type'], ProtocolConstants.typePairRequest);
      expect(json['deviceId'], 'phone-01');
      expect(json['clientSecret'], 'secret-xyz');
    });

    test('TextSendMessage byte-identical UTF-8 serialization', () {
      const rawBody = "Halo! Ini teks khusus UTF-8 dengan emoji 🚀 dan simbol €¥©.";
      final msg = TextSendMessage(
        id: 'msg-001',
        kind: 'text',
        body: rawBody,
        ts: 1700000000000,
      );

      final json = msg.toJson();
      final reconstructed = TextSendMessage.fromJson(json);

      expect(reconstructed.body, rawBody);
      expect(reconstructed.kind, 'text');
    });

    test('FileOfferMessage chunk size defaults to 256 KB', () {
      final offer = FileOfferMessage(
        id: 'file-001',
        name: 'dokumen.pdf',
        size: 1048576,
        mime: 'application/pdf',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      );

      expect(offer.chunkSize, ProtocolConstants.defaultChunkSize);
      expect(offer.chunkSize, 256 * 1024);
    });
  });
}
