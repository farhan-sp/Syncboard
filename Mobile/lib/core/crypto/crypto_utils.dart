import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';

class CryptoUtils {
  static final Random _secureRandom = Random.secure();

  /// Generates 32 cryptographically secure random bytes as Base64Url string.
  static String generateClientSecret([int length = 32]) {
    final values = List<int>.generate(length, (i) => _secureRandom.nextInt(256));
    return base64UrlEncode(values).replaceAll('=', '');
  }

  /// Generates a random nonce string.
  static String generateNonce([int length = 16]) => generateClientSecret(length);

  /// Derives a 6-digit verification code formatted as "XXX-XXX" (e.g. "482-915")
  /// from SHA-256(pairToken + desktopDeviceId + phoneDeviceId).
  static String deriveVerificationCode(
    String pairToken,
    String desktopDeviceId,
    String phoneDeviceId,
  ) {
    final raw = "$pairToken$desktopDeviceId$phoneDeviceId";
    final digest = sha256.convert(utf8.encode(raw)).bytes;

    final value = ((digest[0] & 0xFF) << 24) |
        ((digest[1] & 0xFF) << 16) |
        ((digest[2] & 0xFF) << 8) |
        (digest[3] & 0xFF);

    final codeNum = (value & 0xFFFFFFFF) % 1000000;
    final rawCode = codeNum.toString().padLeft(6, '0');
    return "${rawCode.substring(0, 3)}-${rawCode.substring(3, 6)}";
  }

  /// Computes HMAC-SHA256 over (challenge + nonce) using clientSecret.
  static String computeAuthHmac(
    String clientSecret,
    String challenge,
    String nonce,
  ) {
    final secretBytes = utf8.encode(clientSecret);
    final message = utf8.encode(challenge + nonce);
    final hmacSha256 = Hmac(sha256, secretBytes);
    final digest = hmacSha256.convert(message);
    return digest.toString(); // Hex format
  }

  /// Normalizes certificate fingerprint (strips "SHA256:", colons, spaces, lowercases).
  static String normalizeFingerprint(String fp) {
    return fp
        .replaceAll(RegExp(r'SHA-?256:?', caseSensitive: false), '')
        .replaceAll(':', '')
        .replaceAll(' ', '')
        .trim()
        .toLowerCase();
  }

  /// Calculates SHA-256 of byte array.
  static String calculateSha256(List<int> bytes) {
    return sha256.convert(bytes).toString();
  }

  /// Streams a file to compute SHA-256 without loading entire file into memory.
  static Future<String> calculateFileSha256(File file) async {
    final digest = await sha256.bind(file.openRead()).first;
    return digest.toString();
  }
}
