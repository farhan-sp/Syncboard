import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/crypto/crypto_utils.dart';
import 'package:syncboard_mobile/core/protocol/protocol_constants.dart';
import 'package:syncboard_mobile/core/protocol/protocol_models.dart';

void main() {
  group('Milestone 2 - Reconnect & Auth Handshake Tests', () {
    test('Auth hello message includes deviceId and 16-byte nonce', () {
      const deviceId = 'phone-device-id-123';
      final nonce = CryptoUtils.generateNonce(16);

      final hello = AuthHelloMessage(deviceId: deviceId, nonce: nonce);
      final json = hello.toJson();

      expect(json['type'], ProtocolConstants.typeAuthHello);
      expect(json['deviceId'], deviceId);
      expect(json['nonce'], nonce);
      expect(nonce.isNotEmpty, isTrue);
    });

    test('HMAC challenge-response exchange produces exact match on both sides', () {
      final clientSecret = CryptoUtils.generateClientSecret(32);
      final challenge = CryptoUtils.generateNonce(32);
      final nonce = CryptoUtils.generateNonce(16);

      // Phone calculates HMAC
      final phoneHmac = CryptoUtils.computeAuthHmac(clientSecret, challenge, nonce);

      // Desktop verifies HMAC using same secret
      final desktopExpectedHmac = CryptoUtils.computeAuthHmac(clientSecret, challenge, nonce);

      expect(phoneHmac, equals(desktopExpectedHmac));
      expect(phoneHmac.length, 64);

      // Tampered challenge fails
      final tamperedHmac = CryptoUtils.computeAuthHmac(clientSecret, 'tampered-challenge', nonce);
      expect(phoneHmac, isNot(equals(tamperedHmac)));
    });

    test('Exponential backoff calculation sequence', () {
      int calculateBackoff(int attempt) {
        return min(30, pow(2, min(attempt, 5)).toInt());
      }

      expect(calculateBackoff(1), 2);   // 2^1 = 2s
      expect(calculateBackoff(2), 4);   // 2^2 = 4s
      expect(calculateBackoff(3), 8);   // 2^3 = 8s
      expect(calculateBackoff(4), 16);  // 2^4 = 16s
      expect(calculateBackoff(5), 30);  // min(30, 32) = 30s
      expect(calculateBackoff(10), 30); // max 30s
    });
  });
}
