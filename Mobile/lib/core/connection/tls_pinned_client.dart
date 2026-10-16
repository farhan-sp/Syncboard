import 'dart:async';
import 'dart:convert';
import 'dart:io';
import '../crypto/crypto_utils.dart';

class CertificateFingerprintMismatchException implements Exception {
  final String expected;
  final String actual;
  CertificateFingerprintMismatchException({required this.expected, required this.actual});

  @override
  String toString() =>
      "Sidik jari sertifikat tidak cocok! Keamanan menolak koneksi. (Harapan: $expected, Diterima: $actual)";
}

class HostUnreachableException implements Exception {
  final List<String> attemptedHosts;
  final int port;
  HostUnreachableException(this.attemptedHosts, this.port);

  @override
  String toString() =>
      "Tidak dapat terhubung ke desktop melalui host $attemptedHosts pada port $port. Pastikan kedua perangkat berada di jaringan Wi-Fi yang sama.";
}

class TlsConnectionResult {
  final WebSocket webSocket;
  final String connectedHost;
  final int port;

  TlsConnectionResult({
    required this.webSocket,
    required this.connectedHost,
    required this.port,
  });
}

class TlsPinnedClient {
  /// Connects to a WSS server with SHA-256 certificate fingerprint pinning.
  /// Rejects any certificate whose SHA-256 digest does not match [expectedFingerprint].
  static Future<WebSocket> connect({
    required String host,
    required int port,
    required String expectedFingerprint,
    Duration timeout = const Duration(seconds: 6),
  }) async {
    final normalizedExpected = CryptoUtils.normalizeFingerprint(expectedFingerprint);
    final securityContext = SecurityContext(withTrustedRoots: false);

    final httpClient = HttpClient(context: securityContext);
    httpClient.connectionTimeout = timeout;

    bool fingerprintMatched = false;
    String? observedFingerprint;

    httpClient.badCertificateCallback = (X509Certificate cert, String certHost, int certPort) {
      final certDer = cert.der;
      final sha256Hex = CryptoUtils.calculateSha256(certDer);
      observedFingerprint = sha256Hex;

      if (sha256Hex == normalizedExpected) {
        fingerprintMatched = true;
        return true; // Pinning match confirmed!
      } else {
        fingerprintMatched = false;
        return false; // Pinning mismatch -> abort connection immediately
      }
    };

    try {
      final uri = Uri(scheme: 'wss', host: host, port: port);
      final ws = await WebSocket.connect(
        uri.toString(),
        customClient: httpClient,
      ).timeout(timeout);
      ws.pingInterval = const Duration(seconds: 10);
      return ws;
    } catch (e) {
      httpClient.close(force: true);
      if (!fingerprintMatched && observedFingerprint != null) {
        throw CertificateFingerprintMismatchException(
          expected: normalizedExpected,
          actual: observedFingerprint!,
        );
      }
      rethrow;
    }
  }

  /// Connects to the first reachable host in [candidateHosts] using TLS fingerprint pinning.
  static Future<TlsConnectionResult> connectToFirstReachableHost({
    required List<String> candidateHosts,
    required int port,
    required String expectedFingerprint,
    Duration perHostTimeout = const Duration(seconds: 4),
  }) async {
    final errors = <String>[];

    for (final host in candidateHosts) {
      try {
        final ws = await connect(
          host: host,
          port: port,
          expectedFingerprint: expectedFingerprint,
          timeout: perHostTimeout,
        );
        return TlsConnectionResult(
          webSocket: ws,
          connectedHost: host,
          port: port,
        );
      } catch (e) {
        errors.add("$host: $e");
        // If fingerprint mismatched, do not continue to next host as this could be an MITM attack
        if (e is CertificateFingerprintMismatchException) {
          rethrow;
        }
      }
    }

    throw HostUnreachableException(candidateHosts, port);
  }
}
