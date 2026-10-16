import 'dart:async';
import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:uuid/uuid.dart';
import '../connection/connection_manager.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../protocol/protocol_constants.dart';
import '../protocol/protocol_models.dart';

class TextTransferManager {
  final ConnectionManager connectionManager;
  final DatabaseService databaseService;
  static const _uuid = Uuid();

  final Map<String, Completer<bool>> _pendingAcks = {};
  final StreamController<TransferItem> _incomingTextController =
      StreamController<TransferItem>.broadcast();

  Stream<TransferItem> get incomingTextStream => _incomingTextController.stream;

  TextTransferManager({
    required this.connectionManager,
    required this.databaseService,
  }) {
    // Listen to incoming messages from active WebSocket connection
    connectionManager.messageStream.listen(_handleIncomingMessage);
  }

  /// Sends a text or link message over the active WebSocket:
  /// 1. Constructs TextSendMessage without trimming
  /// 2. Inserts into SQLite as "Mengirim"
  /// 3. Sends JSON frame
  /// 4. Awaits text.ack within timeout
  /// 5. Marks "Selesai" or "Gagal"
  Future<TransferItem> sendText({
    required String body,
    required String targetDeviceId,
    RetentionMode retentionMode = RetentionMode.save,
    int retentionDurationMinutes = 60,
  }) async {
    final ws = connectionManager.activeWebSocket;
    if (ws == null || connectionManager.status.name != 'connected') {
      throw StateError("Tidak ada koneksi aktif ke desktop.");
    }

    final id = _uuid.v4();
    final isUrl = Uri.tryParse(body)?.hasAbsolutePath ?? false;
    final kindStr = isUrl ? 'link' : 'text';
    final now = DateTime.now();

    DateTime? expiresAt;
    if (retentionMode == RetentionMode.sendOnce) {
      expiresAt = now.add(Duration(minutes: retentionDurationMinutes));
    }

    final transferItem = TransferItem(
      id: id,
      deviceId: targetDeviceId,
      direction: TransferDirection.outgoing,
      kind: isUrl ? TransferKind.link : TransferKind.text,
      textBody: body, // Byte-identical UTF-8, no trim
      status: TransferStatus.sending,
      createdAt: now,
      expiresAt: expiresAt,
    );

    // Save initial status to database
    await databaseService.saveTransfer(transferItem);

    // Prepare message frame
    final msg = TextSendMessage(
      id: id,
      kind: kindStr,
      body: body,
      ts: now.millisecondsSinceEpoch,
    );

    final ackCompleter = Completer<bool>();
    _pendingAcks[id] = ackCompleter;

    try {
      ws.add(jsonEncode(msg.toJson()));

      // Await text.ack with 7s timeout
      await ackCompleter.future.timeout(const Duration(seconds: 7));

      // Successfully acknowledged!
      final completedItem = transferItem.copyWith(status: TransferStatus.done);
      await databaseService.updateTransferStatus(id, TransferStatus.done);
      return completedItem;
    } catch (_) {
      // Timeout or error -> mark as failed
      final failedItem = transferItem.copyWith(status: TransferStatus.failed);
      await databaseService.updateTransferStatus(id, TransferStatus.failed);
      return failedItem;
    } finally {
      _pendingAcks.remove(id);
    }
  }

  /// Retries sending a failed text transfer
  Future<TransferItem> retrySendText(TransferItem failedItem) async {
    if (failedItem.textBody == null) return failedItem;

    return await sendText(
      body: failedItem.textBody!,
      targetDeviceId: failedItem.deviceId,
      retentionMode: failedItem.expiresAt != null ? RetentionMode.sendOnce : RetentionMode.save,
    );
  }

  void _handleIncomingMessage(dynamic rawData) async {
    if (rawData is! String) return;

    try {
      final json = jsonDecode(rawData);
      if (json is! Map<String, dynamic>) return;

      final type = json['type'] as String?;

      if (type == ProtocolConstants.typeTextSend) {
        await _processIncomingTextSend(json);
      } else if (type == ProtocolConstants.typeTextAck) {
        _processTextAck(json);
      }
    } catch (_) {}
  }

  Future<void> _processIncomingTextSend(Map<String, dynamic> json) async {
    final msg = TextSendMessage.fromJson(json);

    // 1. Immediately reply with text.ack
    final ack = TextAckMessage(id: msg.id);
    try {
      connectionManager.activeWebSocket?.add(jsonEncode(ack.toJson()));
    } catch (_) {}

    // 2. Preserve exact byte-for-byte UTF-8 body (no trimming)
    final isUrl = msg.kind == 'link';
    final now = DateTime.now();

    final activeDev = connectionManager.currentDevice;
    final deviceId = activeDev?.deviceId ?? 'unknown_desktop';

    final transfer = TransferItem(
      id: msg.id,
      deviceId: deviceId,
      direction: TransferDirection.incoming,
      kind: isUrl ? TransferKind.link : TransferKind.text,
      textBody: msg.body, // Preserved exactly as sent
      status: TransferStatus.done,
      createdAt: DateTime.fromMillisecondsSinceEpoch(msg.ts),
    );

    // 3. Save to SQLite database
    await databaseService.saveTransfer(transfer);

    // 4. Haptic tactile feedback
    try {
      HapticFeedback.lightImpact();
    } catch (_) {}

    // 5. Broadcast to Riverpod state
    _incomingTextController.add(transfer);
  }

  void _processTextAck(Map<String, dynamic> json) {
    final ack = TextAckMessage.fromJson(json);
    final completer = _pendingAcks[ack.id];
    if (completer != null && !completer.isCompleted) {
      completer.complete(true);
    }
  }

  void dispose() {
    _pendingAcks.clear();
    _incomingTextController.close();
  }
}
