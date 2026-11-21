import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../connection/connection_manager.dart';
import '../connection/connection_provider.dart';
import '../crypto/crypto_utils.dart';
import '../db/database_service.dart';
import '../db/models.dart';
import '../protocol/protocol_constants.dart';
import '../protocol/protocol_models.dart';
import 'chunk_framing.dart';
import 'filename_sanitizer.dart';

class IncomingFileOfferEvent {
  final FileOfferMessage offer;
  final String senderDeviceName;
  final Completer<bool> decisionCompleter;

  IncomingFileOfferEvent({
    required this.offer,
    required this.senderDeviceName,
    required this.decisionCompleter,
  });
}

class ActiveFileReceiveSession {
  final FileOfferMessage offer;
  final File tempFile;
  final IOSink sink;
  final TransferItem initialItem;
  int bytesReceived;
  int lastProgressReportBytes;
  bool isFinalizing;
  final Completer<File> completionCompleter;

  ActiveFileReceiveSession({
    required this.offer,
    required this.tempFile,
    required this.sink,
    required this.initialItem,
    this.bytesReceived = 0,
    this.lastProgressReportBytes = 0,
    this.isFinalizing = false,
    required this.completionCompleter,
  });
}

class ActiveFileSendSession {
  final String transferId;
  final File file;
  final int totalSize;
  final TransferItem initialItem;
  bool isCancelled = false;
  bool isDisconnected = false;
  final Completer<bool> completionCompleter;

  ActiveFileSendSession({
    required this.transferId,
    required this.file,
    required this.totalSize,
    required this.initialItem,
    required this.completionCompleter,
  });
}

class FileTransferManager {
  final ConnectionManager connectionManager;
  final DatabaseService databaseService;
  static const _uuid = Uuid();

  final Map<String, Completer<bool>> _pendingOfferDecisions = {};
  final Map<String, ActiveFileSendSession> _activeSendSessions = {};
  final Map<String, ActiveFileReceiveSession> _activeReceiveSessions = {};

  StreamSubscription<dynamic>? _messageSubscription;
  StreamSubscription<ConnectionStatus>? _statusSubscription;

  final StreamController<IncomingFileOfferEvent> _incomingOfferController =
      StreamController<IncomingFileOfferEvent>.broadcast();
  final StreamController<TransferItem> _transferUpdateController =
      StreamController<TransferItem>.broadcast();

  Stream<IncomingFileOfferEvent> get incomingOfferStream => _incomingOfferController.stream;
  Stream<TransferItem> get transferUpdateStream => _transferUpdateController.stream;

  FileTransferManager({
    required this.connectionManager,
    required this.databaseService,
  }) {
    _messageSubscription = connectionManager.messageStream.listen(_handleIncomingMessage);
    _statusSubscription = connectionManager.statusStream.listen((status) {
      if (status == ConnectionStatus.disconnected) {
        _abortAllActiveTransfers();
      }
    });
  }

  // --- OUTGOING FILE TRANSFER ---

  /// Initiates an outgoing file transfer:
  /// 1. Computes SHA-256 via streaming without loading whole file into memory
  /// 2. Sends file.offer and awaits file.accept or file.reject
  /// 3. Streams file in 256 KB binary chunks
  /// 4. Awaits file.done verification from receiver
  Future<TransferItem> sendFile({
    required File file,
    required String targetDeviceId,
    bool isPhoto = false,
  }) async {
    final ws = connectionManager.activeWebSocket;
    if (ws == null || connectionManager.status.name != 'connected') {
      throw StateError("Tidak ada koneksi aktif ke desktop.");
    }

    final transferId = _uuid.v4();
    final fileName = p.basename(file.path);
    final totalSize = await file.length();
    final now = DateTime.now();

    // 1. Compute SHA-256 via streaming
    final sha256Checksum = await CryptoUtils.calculateFileSha256(file);

    // Initial database record
    final transferItem = TransferItem(
      id: transferId,
      deviceId: targetDeviceId,
      direction: TransferDirection.outgoing,
      kind: isPhoto ? TransferKind.photo : TransferKind.file,
      fileName: fileName,
      fileSize: totalSize,
      savedPath: file.path,
      status: TransferStatus.waiting,
      progress: 0.0,
      createdAt: now,
    );

    await databaseService.saveTransfer(transferItem);
    _transferUpdateController.add(transferItem);

    // 2. Send file.offer frame
    final offer = FileOfferMessage(
      id: transferId,
      name: fileName,
      size: totalSize,
      mime: isPhoto ? 'image/jpeg' : 'application/octet-stream',
      sha256: sha256Checksum,
      chunkSize: ProtocolConstants.defaultChunkSize,
    );

    final offerCompleter = Completer<bool>();
    _pendingOfferDecisions[transferId] = offerCompleter;

    ws.add(jsonEncode(offer.toJson()));

    // Wait for file.accept or file.reject (timeout 60 seconds)
    final isAccepted = await offerCompleter.future.timeout(
      const Duration(seconds: 60),
      onTimeout: () {
        _pendingOfferDecisions.remove(transferId);
        databaseService.updateTransferStatus(transferId, TransferStatus.failed);
        throw TimeoutException("Tawaran berkas tidak direspons oleh desktop.");
      },
    );

    _pendingOfferDecisions.remove(transferId);

    if (!isAccepted) {
      final rejectedItem = transferItem.copyWith(status: TransferStatus.cancelled);
      await databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
      _transferUpdateController.add(rejectedItem);
      return rejectedItem;
    }

    // 3. Accepted! Begin streaming file in 256 KB binary chunks
    final sendSession = ActiveFileSendSession(
      transferId: transferId,
      file: file,
      totalSize: totalSize,
      initialItem: transferItem,
      completionCompleter: Completer<bool>(),
    );
    _activeSendSessions[transferId] = sendSession;

    await databaseService.updateTransferStatus(transferId, TransferStatus.sending, progress: 0.0);
    _transferUpdateController.add(transferItem.copyWith(status: TransferStatus.sending, progress: 0.0));

    try {
      await _streamFileChunks(sendSession, ws);

      // 4. Wait for receiver's file.done verification result
      final verifiedOk = await sendSession.completionCompleter.future.timeout(
        const Duration(seconds: 15),
        onTimeout: () => true,
      );
      if (!verifiedOk) {
        if (sendSession.isCancelled && !sendSession.isDisconnected) {
          final cancelledItem = transferItem.copyWith(status: TransferStatus.cancelled);
          await databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
          _transferUpdateController.add(cancelledItem);
          return cancelledItem;
        }
        throw Exception("Verifikasi integritas SHA-256 gagal di perangkat tujuan.");
      }

      final completedItem = transferItem.copyWith(status: TransferStatus.done, progress: 1.0);
      await databaseService.updateTransferStatus(transferId, TransferStatus.done, progress: 1.0);
      _transferUpdateController.add(completedItem);
      return completedItem;
    } catch (e) {
      if (sendSession.isCancelled && !sendSession.isDisconnected) {
        final cancelledItem = transferItem.copyWith(status: TransferStatus.cancelled);
        await databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
        _transferUpdateController.add(cancelledItem);
        return cancelledItem;
      }
      final failedItem = transferItem.copyWith(status: TransferStatus.failed);
      await databaseService.updateTransferStatus(transferId, TransferStatus.failed);
      _transferUpdateController.add(failedItem);
      rethrow;
    } finally {
      _activeSendSessions.remove(transferId);
    }
  }

  /// Streams file in 256 KB chunks via openRead stream without memory growth
  Future<void> _streamFileChunks(ActiveFileSendSession session, dynamic ws) async {
    final stream = session.file.openRead();
    int currentOffset = 0;
    List<int> chunkBuffer = [];
    final chunkSize = ProtocolConstants.defaultChunkSize;

    int lastProgressReport = 0;

    await for (final List<int> data in stream) {
      if (session.isCancelled) break;

      chunkBuffer.addAll(data);

      while (chunkBuffer.length >= chunkSize) {
        if (session.isCancelled) break;

        final chunkPayload = Uint8List.fromList(chunkBuffer.sublist(0, chunkSize));
        chunkBuffer = chunkBuffer.sublist(chunkSize);

        final binaryFrame = ChunkFraming.pack(
          transferId: session.transferId,
          offset: currentOffset,
          payload: chunkPayload,
        );

        ws.add(binaryFrame);
        currentOffset += chunkSize;

        // Periodic local UI progress update (every 512 KB)
        if (currentOffset - lastProgressReport >= 512 * 1024) {
          lastProgressReport = currentOffset;
          final progress = session.totalSize > 0
              ? (currentOffset / session.totalSize).clamp(0.0, 1.0)
              : 1.0;

          _transferUpdateController.add(
            session.initialItem.copyWith(status: TransferStatus.sending, progress: progress),
          );
        }

        // Slight yield to keep event loop responsive
        await Future.delayed(Duration.zero);
      }
    }

    // Send remaining remainder chunk
    if (!session.isCancelled && chunkBuffer.isNotEmpty) {
      final chunkPayload = Uint8List.fromList(chunkBuffer);
      final binaryFrame = ChunkFraming.pack(
        transferId: session.transferId,
        offset: currentOffset,
        payload: chunkPayload,
      );

      ws.add(binaryFrame);
      currentOffset += chunkPayload.length;
    }

    if (session.isCancelled) {
      throw Exception("Transfer dibatalkan oleh pengguna.");
    }
  }

  // --- INCOMING FILE TRANSFER ---

  void _handleIncomingMessage(dynamic rawData) async {
    if (rawData is String) {
      try {
        final json = jsonDecode(rawData);
        if (json is! Map<String, dynamic>) return;

        final type = json['type'] as String?;

        if (type == ProtocolConstants.typeFileOffer) {
          await _handleIncomingFileOffer(FileOfferMessage.fromJson(json));
        } else if (type == ProtocolConstants.typeFileAccept) {
          final accept = FileAcceptMessage.fromJson(json);
          final completer = _pendingOfferDecisions[accept.id];
          if (completer != null && !completer.isCompleted) {
            completer.complete(true);
          }
        } else if (type == ProtocolConstants.typeFileReject) {
          final reject = FileRejectMessage.fromJson(json);
          final completer = _pendingOfferDecisions[reject.id];
          if (completer != null && !completer.isCompleted) {
            completer.complete(false);
          }
        } else if (type == ProtocolConstants.typeFileProgress) {
          // Progress update from peer
          final progress = FileProgressMessage.fromJson(json);
          _handlePeerProgress(progress);
        } else if (type == ProtocolConstants.typeFileDone) {
          final done = FileDoneMessage.fromJson(json);
          await _handleFileDone(done);
        } else if (type == ProtocolConstants.typeTransferCancel) {
          final cancel = TransferCancelMessage.fromJson(json);
          _handleTransferCancel(cancel.id);
        }
      } catch (_) {}
    } else if (rawData is List<int>) {
      // Binary chunk frame
      _handleIncomingBinaryChunk(Uint8List.fromList(rawData));
    }
  }

  Future<void> _handleIncomingFileOffer(FileOfferMessage offer) async {
    final senderName = connectionManager.currentDevice?.name ?? 'Desktop';
    final decisionCompleter = Completer<bool>();

    // Emit event to UI (approval sheet)
    _incomingOfferController.add(IncomingFileOfferEvent(
      offer: offer,
      senderDeviceName: senderName,
      decisionCompleter: decisionCompleter,
    ));

    final isAccepted = await decisionCompleter.future;

    final ws = connectionManager.activeWebSocket;
    if (ws == null) return;

    if (!isAccepted) {
      ws.add(jsonEncode(FileRejectMessage(id: offer.id, reason: 'Ditolak oleh pengguna ponsel').toJson()));
      return;
    }

    // User accepted!
    // 1. Reply file.accept
    ws.add(jsonEncode(FileAcceptMessage(id: offer.id).toJson()));

    // 2. Create temporary file with sanitized ID
    final tempDir = await getTemporaryDirectory();
    final safeId = FileNameSanitizer.sanitize(offer.id, defaultName: 'temp_offer');
    final tempFile = File(p.join(tempDir.path, '$safeId.tmp'));
    if (tempFile.existsSync()) tempFile.deleteSync();

    final sink = tempFile.openWrite(mode: FileMode.writeOnly);

    // 3. Insert into SQLite as "Mengirim" (downloading)
    final isImage = offer.mime.startsWith('image/');
    final initialItem = TransferItem(
      id: offer.id,
      deviceId: connectionManager.currentDevice?.deviceId ?? 'desktop',
      direction: TransferDirection.incoming,
      kind: isImage ? TransferKind.photo : TransferKind.file,
      fileName: offer.name,
      fileSize: offer.size,
      status: TransferStatus.sending,
      progress: 0.0,
      createdAt: DateTime.now(),
    );

    final session = ActiveFileReceiveSession(
      offer: offer,
      tempFile: tempFile,
      sink: sink,
      initialItem: initialItem,
      completionCompleter: Completer<File>(),
    );
    _activeReceiveSessions[offer.id] = session;

    await databaseService.saveTransfer(initialItem);
    _transferUpdateController.add(initialItem);

    if (offer.size == 0) {
      session.isFinalizing = true;
      await _finalizeReceiveSession(session);
    }
  }

  void _handleIncomingBinaryChunk(Uint8List frame) {
    try {
      final chunk = ChunkFraming.unpack(frame);
      final session = _activeReceiveSessions[chunk.transferId];
      if (session == null || session.isFinalizing) return;

      session.sink.add(chunk.payload);
      session.bytesReceived += chunk.payload.length;

      final progress = session.offer.size > 0
          ? (session.bytesReceived / session.offer.size).clamp(0.0, 1.0)
          : 1.0;

      if (session.bytesReceived - session.lastProgressReportBytes >= 256 * 1024 ||
          session.bytesReceived >= session.offer.size) {
        session.lastProgressReportBytes = session.bytesReceived;
        try {
          connectionManager.activeWebSocket?.add(
            jsonEncode(FileProgressMessage(id: chunk.transferId, bytesReceived: session.bytesReceived).toJson()),
          );
        } catch (_) {}

        _transferUpdateController.add(
          session.initialItem.copyWith(status: TransferStatus.sending, progress: progress),
        );
      }

      if (session.bytesReceived >= session.offer.size) {
        session.isFinalizing = true;
        unawaited(_finalizeReceiveSession(session));
      }
    } catch (_) {}
  }

  void _handlePeerProgress(FileProgressMessage progress) {
    final session = _activeSendSessions[progress.id];
    if (session != null) {
      final ratio = session.totalSize > 0
          ? (progress.bytesReceived / session.totalSize).clamp(0.0, 1.0)
          : 1.0;
      _transferUpdateController.add(
        session.initialItem.copyWith(status: TransferStatus.sending, progress: ratio),
      );
    }
  }

  Future<void> _finalizeReceiveSession(ActiveFileReceiveSession session) async {
    _activeReceiveSessions.remove(session.offer.id);

    try {
      await session.sink.flush();
      await session.sink.close();
    } catch (_) {}

    final actualSize = session.tempFile.existsSync() ? await session.tempFile.length() : -1;
    final actualSha256 = session.tempFile.existsSync()
        ? await CryptoUtils.calculateFileSha256(session.tempFile)
        : '';

    if (actualSize != session.offer.size ||
        actualSha256.toLowerCase() != session.offer.sha256.toLowerCase()) {
      _deleteTempFile(session.tempFile);
      await databaseService.updateTransferStatus(session.offer.id, TransferStatus.failed);
      _transferUpdateController.add(session.initialItem.copyWith(status: TransferStatus.failed));

      try {
        connectionManager.activeWebSocket?.add(
          jsonEncode(FileDoneMessage(
            id: session.offer.id,
            ok: false,
            reason: 'Verifikasi ukuran atau SHA-256 gagal',
          ).toJson()),
        );
      } catch (_) {}
      return;
    }

    // Sanitize filename and move to destination folder
    final sanitizedName = FileNameSanitizer.sanitize(session.offer.name);
    final appDir = await getApplicationDocumentsDirectory();
    final destDir = Directory(p.join(appDir.path, 'SyncBoard'));
    if (!destDir.existsSync()) destDir.createSync(recursive: true);

    final finalFile = FileNameSanitizer.getUniqueFile(destDir, sanitizedName);
    try {
      await session.tempFile.rename(finalFile.path);
    } catch (_) {
      await session.tempFile.copy(finalFile.path);
      _deleteTempFile(session.tempFile);
    }

    await databaseService.updateTransferStatus(
      session.offer.id,
      TransferStatus.done,
      savedPath: finalFile.path,
      progress: 1.0,
    );

    _transferUpdateController.add(
      session.initialItem.copyWith(
        fileName: p.basename(finalFile.path),
        fileSize: actualSize,
        savedPath: finalFile.path,
        status: TransferStatus.done,
        progress: 1.0,
      ),
    );

    try {
      connectionManager.activeWebSocket?.add(
        jsonEncode(FileDoneMessage(id: session.offer.id, ok: true).toJson()),
      );
    } catch (_) {}
  }

  Future<void> _handleFileDone(FileDoneMessage done) async {
    final sendSession = _activeSendSessions[done.id];
    if (sendSession != null) {
      if (!sendSession.completionCompleter.isCompleted) {
        sendSession.completionCompleter.complete(done.ok);
      }
      return;
    }

    final receiveSession = _activeReceiveSessions[done.id];
    if (receiveSession == null || receiveSession.isFinalizing) return;

    if (!done.ok) {
      _activeReceiveSessions.remove(done.id);
      try {
        await receiveSession.sink.close();
      } catch (_) {}
      _deleteTempFile(receiveSession.tempFile);
      await databaseService.updateTransferStatus(done.id, TransferStatus.failed);
      _transferUpdateController.add(receiveSession.initialItem.copyWith(status: TransferStatus.failed));
      return;
    }

    receiveSession.isFinalizing = true;
    await _finalizeReceiveSession(receiveSession);
  }

  void _handleTransferCancel(String transferId) {
    // If receiving:
    final receiveSession = _activeReceiveSessions.remove(transferId);
    if (receiveSession != null) {
      receiveSession.sink.close().catchError((_) {});
      _deleteTempFile(receiveSession.tempFile);
      databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
      _transferUpdateController.add(
        receiveSession.initialItem.copyWith(status: TransferStatus.cancelled),
      );
    }

    // If sending:
    final sendSession = _activeSendSessions.remove(transferId);
    if (sendSession != null) {
      sendSession.isCancelled = true;
      if (!sendSession.completionCompleter.isCompleted) {
        sendSession.completionCompleter.complete(false);
      }
      databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
      _transferUpdateController.add(
        sendSession.initialItem.copyWith(status: TransferStatus.cancelled),
      );
    }
  }

  void _abortAllActiveTransfers() {
    for (final completer in _pendingOfferDecisions.values) {
      if (!completer.isCompleted) {
        completer.completeError(StateError("Koneksi ke desktop terputus."));
      }
    }
    _pendingOfferDecisions.clear();

    for (final s in _activeReceiveSessions.values.toList()) {
      _activeReceiveSessions.remove(s.offer.id);
      if (!s.isFinalizing) {
        s.sink.close().catchError((_) {});
        _deleteTempFile(s.tempFile);
        databaseService.updateTransferStatus(s.offer.id, TransferStatus.failed);
        _transferUpdateController.add(s.initialItem.copyWith(status: TransferStatus.failed));
      }
    }

    for (final s in _activeSendSessions.values.toList()) {
      _activeSendSessions.remove(s.transferId);
      s.isDisconnected = true;
      s.isCancelled = true;
      if (!s.completionCompleter.isCompleted) {
        s.completionCompleter.complete(false);
      }
      databaseService.updateTransferStatus(s.transferId, TransferStatus.failed);
      _transferUpdateController.add(s.initialItem.copyWith(status: TransferStatus.failed));
    }
  }

  /// Cancels an in-progress transfer
  void cancelTransfer(String transferId) {
    try {
      connectionManager.activeWebSocket?.add(jsonEncode(
        TransferCancelMessage(id: transferId).toJson(),
      ));
    } catch (_) {}
    _handleTransferCancel(transferId);
  }

  /// Opens received file safely using open_filex (NEVER auto-opened)
  static Future<void> openFileSafely(String filePath) async {
    final file = File(filePath);
    if (!file.existsSync()) {
      throw FileSystemException("Berkas tidak ditemukan", filePath);
    }
    await OpenFilex.open(filePath);
  }

  void _deleteTempFile(File file) {
    try {
      if (file.existsSync()) file.deleteSync();
    } catch (_) {}
  }

  void dispose() {
    _messageSubscription?.cancel();
    _statusSubscription?.cancel();
    for (final s in _activeReceiveSessions.values) {
      s.sink.close().catchError((_) {});
      _deleteTempFile(s.tempFile);
    }
    _activeReceiveSessions.clear();
    _activeSendSessions.clear();
    _pendingOfferDecisions.clear();
    _incomingOfferController.close();
    _transferUpdateController.close();
  }
}
