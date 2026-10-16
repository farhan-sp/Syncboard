import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import '../crypto/crypto_utils.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../protocol/protocol_constants.dart';
import '../protocol/protocol_models.dart';
import '../secrets/secure_storage_service.dart';
import '../service/foreground_service_manager.dart';
import 'connection_provider.dart';
import 'tls_pinned_client.dart';

typedef OnMessageCallback = void Function(dynamic message);

class AuthException implements Exception {
  final String message;
  AuthException([this.message = "Autentikasi perangkat gagal atau pasangan telah dicabut oleh desktop."]);
  @override
  String toString() => message;
}

class ConnectionManager {
  final ISecureStorageService secureStorage;
  final DatabaseService databaseService;

  WebSocket? _webSocket;
  StreamSubscription? _socketSubscription;
  Timer? _pingTimer;
  Timer? _reconnectTimer;

  DeviceItem? _currentDevice;
  ConnectionStatus _status = ConnectionStatus.disconnected;
  String? _lastError;
  bool _manualDisconnect = false;
  int _reconnectAttempts = 0;

  final StreamController<ConnectionStatus> _statusController =
      StreamController<ConnectionStatus>.broadcast();
  final StreamController<String> _errorController =
      StreamController<String>.broadcast();
  final StreamController<dynamic> _messageController =
      StreamController<dynamic>.broadcast();

  Stream<ConnectionStatus> get statusStream => _statusController.stream;
  Stream<String> get errorStream => _errorController.stream;
  Stream<dynamic> get messageStream => _messageController.stream;

  ConnectionStatus get status => _status;
  DeviceItem? get currentDevice => _currentDevice;
  String? get lastError => _lastError;
  WebSocket? get activeWebSocket => _webSocket;

  ConnectionManager({
    required this.secureStorage,
    required this.databaseService,
  });

  void _setStatus(ConnectionStatus newStatus) {
    _status = newStatus;
    _statusController.add(newStatus);
  }

  void _setError(String error) {
    _lastError = error;
    _errorController.add(error);
  }

  /// Connects to a trusted device and executes the HMAC challenge-response authentication handshake.
  Future<void> connectToDevice(DeviceItem device) async {
    _manualDisconnect = false;
    _cancelReconnectTimer();
    _currentDevice = device;
    _setStatus(ConnectionStatus.connecting);

    try {
      // 1. Establish TLS connection with certificate fingerprint pinning
      final ws = await TlsPinnedClient.connect(
        host: device.lastHost,
        port: device.port,
        expectedFingerprint: device.certFingerprint,
      );

      _webSocket = ws;

      // 2. Perform Reconnect/Auth handshake and start single persistent socket listener
      await _performAuthHandshakeAndListen(ws, device);

      // 3. Mark connected and start 15s ping/pong
      _setStatus(ConnectionStatus.connected);
      _reconnectAttempts = 0;
      await databaseService.setActiveDevice(device.deviceId);

      // Start Android Foreground Service with persistent notification
      try {
        await ForegroundServiceManager.startService(desktopName: device.name);
      } catch (_) {}

      _startPingPong(ws);
    } catch (e) {
      _setStatus(ConnectionStatus.disconnected);
      final errorMsg = _translateError(e);
      _setError(errorMsg);
      _closeSocket();

      try {
        await ForegroundServiceManager.stopService();
      } catch (_) {}

      if (!_manualDisconnect) {
        _scheduleReconnect();
      }
    }
  }

  /// Reconnect Auth Handshake & persistent socket listener:
  /// 1. Phone sends { type: "auth.hello", deviceId, nonce }
  /// 2. Desktop replies with { type: "auth.challenge", challenge }
  /// 3. Phone computes HMAC-SHA256(clientSecret, challenge + nonce)
  /// 4. Phone sends { type: "auth.response", signature }
  /// 5. Desktop confirms with auth.ok
  /// Single stream listener handles auth handshake and continues routing messages seamlessly.
  Future<void> _performAuthHandshakeAndListen(WebSocket ws, DeviceItem device) async {
    final phoneDeviceId = await secureStorage.getOrCreatePhoneDeviceId();
    final clientSecret = await secureStorage.getClientSecret(device.deviceId);

    if (clientSecret == null || clientSecret.isEmpty) {
      throw AuthException("Kunci rahasia untuk perangkat '${device.name}' tidak ditemukan di penyimpanan aman.");
    }

    final nonce = CryptoUtils.generateNonce(16);
    final helloMsg = AuthHelloMessage(
      deviceId: phoneDeviceId,
      nonce: nonce,
    );

    final completer = Completer<void>();
    bool isAuthenticated = false;

    _socketSubscription?.cancel();
    _socketSubscription = ws.listen(
      (data) {
        if (data is String) {
          try {
            final json = jsonDecode(data);
            if (json is Map<String, dynamic>) {
              final type = json['type'] as String?;

              // Handle ping heartbeat at any stage
              if (type == ProtocolConstants.typePing) {
                try {
                  ws.add(jsonEncode({'type': ProtocolConstants.typePong}));
                } catch (_) {}
                return;
              }
              if (type == ProtocolConstants.typePong) {
                return; // Pong heartbeat handled
              }

              // Authentication phase handling
              if (!isAuthenticated) {
                if (type == ProtocolConstants.typeAuthChallenge) {
                  final challenge = json['challenge'] as String;
                  final signature = CryptoUtils.computeAuthHmac(clientSecret, challenge, nonce);
                  final responseMsg = AuthResponseMessage(signature: signature);
                  ws.add(jsonEncode(responseMsg.toJson()));
                  return;
                } else if (type == ProtocolConstants.typeAuthSuccess ||
                    type == ProtocolConstants.typeAuthOk ||
                    type == 'auth.ok') {
                  isAuthenticated = true;
                  if (!completer.isCompleted) {
                    completer.complete();
                  }
                  return;
                } else if (type == ProtocolConstants.typeAuthFailed) {
                  if (!completer.isCompleted) {
                    completer.completeError(AuthException());
                  }
                  return;
                }
              }
            }
          } catch (e) {
            if (!isAuthenticated && !completer.isCompleted) {
              completer.completeError(e);
              return;
            }
          }
        }

        // Post-authentication: route messages to controller
        if (isAuthenticated) {
          _messageController.add(data);
        }
      },
      onError: (err) {
        if (!isAuthenticated && !completer.isCompleted) {
          completer.completeError(err);
        } else {
          _onConnectionLost();
        }
      },
      onDone: () {
        if (!isAuthenticated && !completer.isCompleted) {
          completer.completeError(Exception("Koneksi ditutup oleh desktop saat autentikasi."));
        } else {
          _onConnectionLost();
        }
      },
      cancelOnError: true,
    );

    // Send auth.hello
    ws.add(jsonEncode(helloMsg.toJson()));

    return completer.future.timeout(
      const Duration(seconds: 10),
      onTimeout: () {
        _socketSubscription?.cancel();
        _socketSubscription = null;
        throw TimeoutException("Batas waktu autentikasi desktop habis.");
      },
    );
  }

  void _startPingPong(WebSocket ws) {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(
      const Duration(seconds: ProtocolConstants.pingIntervalSeconds),
      (_) {
        try {
          ws.add(jsonEncode({'type': ProtocolConstants.typePing}));
        } catch (_) {
          _onConnectionLost();
        }
      },
    );
  }

  void _onConnectionLost() {
    _closeSocket();
    _setStatus(ConnectionStatus.disconnected);
    _setError("Koneksi dengan desktop terputus.");

    if (!_manualDisconnect && _currentDevice != null) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    _cancelReconnectTimer();
    _reconnectAttempts++;

    // Exponential backoff: 2s, 4s, 8s, max 30s with jitter
    final backoffSec = min(30, pow(2, min(_reconnectAttempts, 5)).toInt());
    _reconnectTimer = Timer(Duration(seconds: backoffSec), () {
      if (!_manualDisconnect && _currentDevice != null) {
        connectToDevice(_currentDevice!);
      }
    });
  }

  void _cancelReconnectTimer() {
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
  }

  void _closeSocket() {
    _pingTimer?.cancel();
    _pingTimer = null;
    _socketSubscription?.cancel();
    _socketSubscription = null;
    try {
      _webSocket?.close();
    } catch (_) {}
    _webSocket = null;
    try {
      ForegroundServiceManager.stopService();
    } catch (_) {}
  }

  /// User action: "Putuskan" (Disconnect)
  Future<void> disconnect() async {
    _manualDisconnect = true;
    _cancelReconnectTimer();
    _closeSocket();
    _setStatus(ConnectionStatus.disconnected);
    await databaseService.setActiveDevice(null);
  }

  /// User action: "Hapus Pasangan" (Unpair)
  /// Revokes trust, removes secret from secure storage, and deletes from SQLite.
  Future<void> unpairDevice(String deviceId) async {
    if (_currentDevice?.deviceId == deviceId) {
      await disconnect();
      _currentDevice = null;
    }
    await secureStorage.removeClientSecret(deviceId);
    await databaseService.deleteDevice(deviceId);
  }

  String _translateError(dynamic error) {
    if (error is CertificateFingerprintMismatchException) {
      return error.toString();
    }
    if (error is AuthException) {
      return error.message;
    }
    if (error is SocketException) {
      return "Tidak dapat terhubung ke desktop. Pastikan kedua perangkat berada di Wi-Fi yang sama dan firewall mengizinkan koneksi.";
    }
    if (error is TimeoutException) {
      return "Batas waktu koneksi habis. Desktop tidak merespons.";
    }
    return "Gagal terhubung ke desktop: $error";
  }

  void dispose() {
    _closeSocket();
    _cancelReconnectTimer();
    _statusController.close();
    _errorController.close();
    _messageController.close();
  }
}
