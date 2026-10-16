import 'package:flutter_test/flutter_test.dart';
import 'package:syncboard_mobile/core/crypto/crypto_utils.dart';

void main() {
  group('SyncBoard Crypto & Auth Tests', () {
    test('6-digit verification code derivation matches format XXX-XXX', () {
      const pairToken = 'dGhpcy1pcy1hLXJhbmRvbS0zMi1ieXRlLXRva2Vu';
      const desktopId = 'desktop-pc-001';
      const phoneId = 'phone-pixel-002';

      final code = CryptoUtils.deriveVerificationCode(pairToken, desktopId, phoneId);

      expect(RegExp(r'^\d{3}-\d{3}$').hasMatch(code), isTrue,
          reason: 'Verification code must be formatted as XXX-XXX: $code');
    });

    test('Verification code derivation is deterministic and matches format', () {
      const pairToken = 'random-pair-token-xyz';
      const desktopId = 'desktop-device-alpha';
      const phoneId = 'phone-device-beta';

      final code1 = CryptoUtils.deriveVerificationCode(pairToken, desktopId, phoneId);
      final code2 = CryptoUtils.deriveVerificationCode(pairToken, desktopId, phoneId);

      expect(code1, equals(code2),
          reason: 'Derivation must be deterministic');
      expect(RegExp(r'^\d{3}-\d{3}$').hasMatch(code1), isTrue);
    });

    test('HMAC-SHA256 authentication computation', () {
      const clientSecret = 'test-client-secret-key-32-bytes';
      const challenge = 'challenge-nonce-abc';
      const nonce = 'phone-nonce-123';

      final hmac1 = CryptoUtils.computeAuthHmac(clientSecret, challenge, nonce);
      final hmac2 = CryptoUtils.computeAuthHmac(clientSecret, challenge, nonce);

      expect(hmac1, equals(hmac2));
      expect(hmac1.length, 64, reason: 'HMAC SHA-256 hex must be 64 characters');

      // Different challenge must yield different HMAC
      final hmacOther = CryptoUtils.computeAuthHmac(clientSecret, 'different-challenge', nonce);
      expect(hmac1, isNot(equals(hmacOther)));
    });

    test('Certificate fingerprint normalization', () {
      const rawFp = 'SHA256:4A:8B:1C:2D:3E:4F:5A:6B:7C:8D:9E:0F:1A:2B:3C:4D:5E:6F:7A:8B:9C:0D:1E:2F:3A:4B:5C:6D:7E:8F:90:12';
      final normalized = CryptoUtils.normalizeFingerprint(rawFp);

      expect(normalized.length, 64);
      expect(normalized.contains(':'), isFalse);
      expect(normalized.contains('sha256'), isFalse);
      expect(normalized, equals(normalized.toLowerCase()));
    });
  });
}
