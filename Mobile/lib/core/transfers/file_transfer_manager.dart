import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';
import '../connection/connection_manager.dart';
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
  int bytesReceived;
  final Completer<File> completionCompleter;

  ActiveFileReceiveSession({
    required this.offer,
    required this.tempFile,
    required this.sink,
    this.bytesReceived = 0,
    required this.completionCompleter,
  });
}

class ActiveFileSendSession {
  final String transferId;
  final File file;
  final int totalSize;
  bool isCancelled = false;
  final Completer<bool> completionCompleter;

  ActiveFileSendSession({
    required this.transferId,
    required this.file,
    required this.totalSize,
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
    connectionManager.messageStream.listen(_handleIncomingMessage);
  }

  // --- OUTGOING FILE TRANSFER ---

  /// Initiates an outgoing file transfer:
  /// 1. Computes SHA-256 via streaming without loading whole file into memory
  /// 2. Sends file.offer and awaits file.accept or file.reject
  /// 3. Streams file in 256 KB binary chunks
  /// 4. Sends file.done upon completion
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
      completionCompleter: Completer<bool>(),
    );
    _activeSendSessions[transferId] = sendSession;

    await databaseService.updateTransferStatus(transferId, TransferStatus.sending, progress: 0.0);
    _transferUpdateController.add(transferItem.copyWith(status: TransferStatus.sending, progress: 0.0));

    try {
      await _streamFileChunks(sendSession, ws);

      // 4. Send file.done { id, ok: true }
      final doneMsg = FileDoneMessage(id: transferId, ok: true);
      ws.add(jsonEncode(doneMsg.toJson()));

      final completedItem = transferItem.copyWith(status: TransferStatus.done, progress: 1.0);
      await databaseService.updateTransferStatus(transferId, TransferStatus.done, progress: 1.0);
      _transferUpdateController.add(completedItem);
      return completedItem;
    } catch (e) {
      if (sendSession.isCancelled) {
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

        // Periodic progress reporting (every 512 KB)
        if (currentOffset - lastProgressReport >= 512 * 1024) {
          lastProgressReport = currentOffset;
          final progress = (currentOffset / session.totalSize).clamp(0.0, 1.0);
          final progressMsg = FileProgressMessage(id: session.transferId, bytesReceived: currentOffset);
          ws.add(jsonEncode(progressMsg.toJson()));

          _transferUpdateController.add(TransferItem(
            id: session.transferId,
            deviceId: 'active',
            direction: TransferDirection.outgoing,
            kind: TransferKind.file,
            fileSize: session.totalSize,
            status: TransferStatus.sending,
            progress: progress,
            createdAt: DateTime.now(),
          ));
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
          _pendingOfferDecisions[accept.id]?.complete(true);
        } else if (type == ProtocolConstants.typeFileReject) {
          final reject = FileRejectMessage.fromJson(json);
          _pendingOfferDecisions[reject.id]?.complete(false);
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

    // 2. Create temporary file
    final tempDir = await getTemporaryDirectory();
    final tempFile = File(p.join(tempDir.path, '${offer.id}.tmp'));
    if (tempFile.existsSync()) tempFile.deleteSync();

    final sink = tempFile.openWrite(mode: FileMode.writeOnly);

    final session = ActiveFileReceiveSession(
      offer: offer,
      tempFile: tempFile,
      sink: sink,
      completionCompleter: Completer<File>(),
    );
    _activeReceiveSessions[offer.id] = session;

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
    await databaseService.saveTransfer(initialItem);
    _transferUpdateController.add(initialItem);
  }

  void _handleIncomingBinaryChunk(Uint8List frame) {
    try {
      final chunk = ChunkFraming.unpack(frame);
      final session = _activeReceiveSessions[chunk.transferId];
      if (session == null) return;

      session.sink.add(chunk.payload);
      session.bytesReceived += chunk.payload.length;

      final progress = (session.bytesReceived / session.offer.size).clamp(0.0, 1.0);

      _transferUpdateController.add(TransferItem(
        id: chunk.transferId,
        deviceId: connectionManager.currentDevice?.deviceId ?? 'desktop',
        direction: TransferDirection.incoming,
        kind: session.offer.mime.startsWith('image/') ? TransferKind.photo : TransferKind.file,
        fileName: session.offer.name,
        fileSize: session.offer.size,
        status: TransferStatus.sending,
        progress: progress,
        createdAt: DateTime.now(),
      ));
    } catch (_) {}
  }

  void _handlePeerProgress(FileProgressMessage progress) {
    final session = _activeSendSessions[progress.id];
    if (session != null) {
      final ratio = (progress.bytesReceived / session.totalSize).clamp(0.0, 1.0);
      _transferUpdateController.add(TransferItem(
        id: progress.id,
        deviceId: 'active',
        direction: TransferDirection.outgoing,
        kind: TransferKind.file,
        fileSize: session.totalSize,
        status: TransferStatus.sending,
        progress: ratio,
        createdAt: DateTime.now(),
      ));
    }
  }

  Future<void> _handleFileDone(FileDoneMessage done) async {
    final session = _activeReceiveSessions[done.id];
    if (session == null) return;

    await session.sink.flush();
    await session.sink.close();

    _activeReceiveSessions.remove(done.id);

    if (!done.ok) {
      _deleteTempFile(session.tempFile);
      await databaseService.updateTransferStatus(done.id, TransferStatus.failed);
      _transferUpdateController.add(TransferItem(
        id: done.id,
        deviceId: 'desktop',
        direction: TransferDirection.incoming,
        kind: TransferKind.file,
        status: TransferStatus.failed,
        createdAt: DateTime.now(),
      ));
      return;
    }

    // 1. Verify size
    final actualSize = await session.tempFile.length();
    if (actualSize != session.offer.size) {
      _deleteTempFile(session.tempFile);
      await databaseService.updateTransferStatus(done.id, TransferStatus.failed);
      throw Exception("Ukuran berkas tidak sesuai: $actualSize vs ${session.offer.size}");
    }

    // 2. Verify SHA-256 checksum
    final actualSha256 = await CryptoUtils.calculateFileSha256(session.tempFile);
    if (actualSha256.toLowerCase() != session.offer.sha256.toLowerCase()) {
      _deleteTempFile(session.tempFile);
      await databaseService.updateTransferStatus(done.id, TransferStatus.failed);
      throw Exception("Checksum SHA-256 tidak cocok! Berkas mungkin rusak.");
    }

    // 3. Sanitize filename and move to destination folder
    final sanitizedName = FileNameSanitizer.sanitize(session.offer.name);
    final appDir = await getApplicationDocumentsDirectory();
    final destDir = Directory(p.join(appDir.path, 'SyncBoard'));
    if (!destDir.existsSync()) destDir.createSync(recursive: true);

    final finalFile = FileNameSanitizer.getUniqueFile(destDir, sanitizedName);
    await session.tempFile.rename(finalFile.path);

    // 4. Mark "Selesai" in database
    await databaseService.updateTransferStatus(
      done.id,
      TransferStatus.done,
      savedPath: finalFile.path,
      progress: 1.0,
    );

    final completedItem = TransferItem(
      id: done.id,
      deviceId: connectionManager.currentDevice?.deviceId ?? 'desktop',
      direction: TransferDirection.incoming,
      kind: session.offer.mime.startsWith('image/') ? TransferKind.photo : TransferKind.file,
      fileName: p.basename(finalFile.path),
      fileSize: actualSize,
      savedPath: finalFile.path,
      status: TransferStatus.done,
      progress: 1.0,
      createdAt: DateTime.now(),
    );
    _transferUpdateController.add(completedItem);
  }

  void _handleTransferCancel(String transferId) {
    // If receiving:
    final receiveSession = _activeReceiveSessions.remove(transferId);
    if (receiveSession != null) {
      receiveSession.sink.close();
      _deleteTempFile(receiveSession.tempFile);
      databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
      _transferUpdateController.add(TransferItem(
        id: transferId,
        deviceId: 'desktop',
        direction: TransferDirection.incoming,
        kind: TransferKind.file,
        status: TransferStatus.cancelled,
        createdAt: DateTime.now(),
      ));
    }

    // If sending:
    final sendSession = _activeSendSessions.remove(transferId);
    if (sendSession != null) {
      sendSession.isCancelled = true;
      databaseService.updateTransferStatus(transferId, TransferStatus.cancelled);
      _transferUpdateController.add(TransferItem(
        id: transferId,
        deviceId: 'desktop',
        direction: TransferDirection.outgoing,
        kind: TransferKind.file,
        status: TransferStatus.cancelled,
        createdAt: DateTime.now(),
      ));
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
    for (final s in _activeReceiveSessions.values) {
      s.sink.close();
      _deleteTempFile(s.tempFile);
    }
    _activeReceiveSessions.clear();
    _activeSendSessions.clear();
    _pendingOfferDecisions.clear();
    _incomingOfferController.close();
    _transferUpdateController.close();
  }
}
