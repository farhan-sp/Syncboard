import 'dart:async';
import 'dart:convert';
import 'dart:io';
import '../crypto/crypto_utils.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../protocol/protocol_constants.dart';
import '../protocol/protocol_models.dart';
import '../secrets/secure_storage_service.dart';
import '../connection/tls_pinned_client.dart';

class QrExpiredException implements Exception {
  final String message;
  QrExpiredException([this.message = "Kode QR telah kedaluwarsa. Silakan segarkan di desktop."]);
  @override
  String toString() => message;
}

class PairingRejectedException implements Exception {
  final String message;
  PairingRejectedException([this.message = "Pemasangan ditolak oleh aplikasi desktop."]);
  @override
  String toString() => message;
}

class PairingSession {
  final QrPayload qrPayload;
  final String verificationCode;
  final String clientSecret;
  final String connectedHost;
  final WebSocket webSocket;
  final Future<DeviceItem> approvalFuture;
  final StreamSubscription socketSubscription;

  PairingSession({
    required this.qrPayload,
    required this.verificationCode,
    required this.clientSecret,
    required this.connectedHost,
    required this.webSocket,
    required this.approvalFuture,
    required this.socketSubscription,
  });
}

class PairingManager {
  final ISecureStorageService secureStorage;
  final DatabaseService databaseService;

  PairingManager({
    required this.secureStorage,
    required this.databaseService,
  });

  /// Initiates pairing handshake with desktop:
  /// 1. Validates QR expiration & version
  /// 2. Connects to desktop over TLS with SHA-256 fingerprint pinning
  /// 3. Sends pair.request with newly generated clientSecret
  /// 4. Immediately starts listening for heartbeat ping/pong and desktop approval
  /// 5. Returns [PairingSession] with verification code to show to user
  Future<PairingSession> initiatePairing({
    required QrPayload qr,
    required String phoneDeviceName,
  }) async {
    // 1. Validation
    if (qr.v != ProtocolConstants.protocolVersion) {
      throw FormatException("Versi protokol QR (${qr.v}) tidak kompatibel dengan aplikasi ini.");
    }
    if (qr.isExpired) {
      throw QrExpiredException();
    }

    // 2. Phone identity
    final phoneDeviceId = await secureStorage.getOrCreatePhoneDeviceId();

    // 3. Derive 6-digit code and generate clientSecret
    final verificationCode = CryptoUtils.deriveVerificationCode(
      qr.pairToken,
      qr.deviceId,
      phoneDeviceId,
    );
    final clientSecret = CryptoUtils.generateClientSecret(32);

    // 4. Connect over TLS with certificate fingerprint pinning
    final connectionResult = await TlsPinnedClient.connectToFirstReachableHost(
      candidateHosts: qr.hosts,
      port: qr.port,
      expectedFingerprint: qr.certFingerprint,
    );

    final ws = connectionResult.webSocket;

    final completer = Completer<DeviceItem>();
    late final StreamSubscription sub;

    sub = ws.listen(
      (data) async {
        try {
          if (data is String) {
            final json = jsonDecode(data) as Map<String, dynamic>;
            final type = json['type'] as String?;

            // 1. Always reply to ping so Desktop heartbeat doesn't terminate connection
            if (type == ProtocolConstants.typePing) {
              try {
                ws.add(jsonEncode({'type': ProtocolConstants.typePong}));
              } catch (_) {}
              return;
            }

            // 2. Handle approval or rejection (supporting both pair.response and legacy pair.confirm/reject)
            final isApproved = type == ProtocolConstants.typePairConfirm ||
                (type == ProtocolConstants.typePairResponse && json['ok'] == true);
            final isRejected = type == ProtocolConstants.typePairReject ||
                (type == ProtocolConstants.typePairResponse && json['ok'] == false);

            if (isApproved) {
              sub.cancel();
              try {
                ws.close();
              } catch (_) {}

              // Save client secret into OS secure storage ONLY
              await secureStorage.storeClientSecret(
                qr.deviceId,
                clientSecret,
              );

              // Save device into SQLite (NO secrets)
              final device = DeviceItem(
                deviceId: qr.deviceId,
                name: qr.deviceName,
                certFingerprint: qr.certFingerprint,
                lastHost: connectionResult.connectedHost,
                port: qr.port,
                pairedAt: DateTime.now(),
                lastConnectedAt: DateTime.now(),
                isActive: true,
              );

              await databaseService.saveDevice(device);
              await databaseService.setActiveDevice(device.deviceId);

              if (!completer.isCompleted) {
                completer.complete(device);
              }
            } else if (isRejected) {
              sub.cancel();
              try {
                ws.close();
              } catch (_) {}
              if (!completer.isCompleted) {
                completer.completeError(
                  PairingRejectedException(json['reason'] as String? ?? "Pemasangan ditolak oleh desktop."),
                );
              }
            }
          }
        } catch (e) {
          sub.cancel();
          try {
            ws.close();
          } catch (_) {}
          if (!completer.isCompleted) {
            completer.completeError(e);
          }
        }
      },
      onError: (err) {
        sub.cancel();
        if (!completer.isCompleted) {
          completer.completeError(err);
        }
      },
      onDone: () {
        if (!completer.isCompleted) {
          completer.completeError(Exception("Koneksi terputus saat menunggu persetujuan desktop."));
        }
      },
      cancelOnError: true,
    );

    // 5. Send pair.request frame
    final requestMsg = PairRequestMessage(
      deviceId: phoneDeviceId,
      deviceName: phoneDeviceName,
      pairToken: qr.pairToken,
      clientSecret: clientSecret,
    );

    ws.add(jsonEncode(requestMsg.toJson()));

    final future = completer.future.timeout(
      const Duration(minutes: 2),
      onTimeout: () {
        sub.cancel();
        try {
          ws.close();
        } catch (_) {}
        throw TimeoutException("Batas waktu pemasangan habis. Desktop tidak merespons.");
      },
    );
    // Suppress unhandled exception crash if closed before awaitDesktopApproval is called
    future.ignore();

    return PairingSession(
      qrPayload: qr,
      verificationCode: verificationCode,
      clientSecret: clientSecret,
      connectedHost: connectionResult.connectedHost,
      webSocket: ws,
      approvalFuture: future,
      socketSubscription: sub,
    );
  }

  /// Awaits desktop user approval ("Izinkan" or "Tolak").
  /// Upon confirmation, saves clientSecret to OS secure storage and device to SQLite.
  Future<DeviceItem> awaitDesktopApproval(PairingSession session) async {
    return session.approvalFuture;
  }

  /// Cancels an in-progress pairing session
  void cancelPairing(PairingSession session) {
    try {
      session.socketSubscription.cancel();
      session.webSocket.add(jsonEncode({
        'type': ProtocolConstants.typePairReject,
        'reason': 'cancelled_by_phone',
      }));
      session.webSocket.close();
    } catch (_) {}
  }
}
