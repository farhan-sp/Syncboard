const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse: uuidParse, stringify: uuidStringify, v4: uuidv4 } = require('uuid');
const { WebSocket } = require('ws');
const db = require('./db');
const { getAppPaths } = require('./config');
const { resolveUniqueFileName } = require('../shared/validation');
const {
  DEFAULT_CHUNK_SIZE,
  BINARY_HEADER_ID_SIZE,
  BINARY_HEADER_TOTAL_SIZE,
} = require('../shared/constants');

class TransferManager {
  constructor() {
    this.outgoingTransfers = new Map();
    this.incomingTransfers = new Map();
    this.pendingOffers = new Map();
    this.emitEventCallback = null;
  }

  setEventCallback(cb) {
    this.emitEventCallback = cb;
  }

  emit(event, data) {
    if (this.emitEventCallback) {
      this.emitEventCallback(event, data);
    }
  }

  // --- Compute File SHA-256 via Stream (memory-safe for any file size) ---
  async computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: DEFAULT_CHUNK_SIZE });
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', (err) => reject(err));
    });
  }

  // --- Send File: Offer -> Accept -> Stream Binary Chunks ---
  async startSendFile(ws, deviceId, filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Berkas tidak ditemukan: ${filePath}`);
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      throw new Error(`Jalur yang dipilih bukan berkas: ${filePath}`);
    }

    const id = uuidv4();
    const fileName = path.basename(filePath);
    const fileSize = stat.size;
    const sha256 = await this.computeFileSha256(filePath);
    const chunkSize = DEFAULT_CHUNK_SIZE;

    // Detect mime
    const ext = path.extname(filePath).toLowerCase();
    const isPhoto = /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(ext);
    const kind = isPhoto ? 'photo' : 'file';
    const mime = isPhoto ? 'image/' + ext.replace('.', '') : 'application/octet-stream';

    // Record in SQLite
    const transfer = db.addTransfer({
      id,
      deviceId,
      direction: 'outgoing',
      kind,
      fileName,
      fileSize,
      savedPath: filePath,
      sha256,
      status: 'Menunggu',
    });
    this.emit('event:transfer-update', transfer);

    // Save outgoing transfer state
    const outgoingState = {
      id,
      deviceId,
      ws,
      filePath,
      fileName,
      fileSize,
      mime,
      sha256,
      chunkSize,
      bytesSent: 0,
      isPaused: false,
      isCancelled: false,
    };
    this.outgoingTransfers.set(id, outgoingState);

    // Send file.offer to phone
    const offerMsg = {
      type: 'file.offer',
      id,
      name: fileName,
      size: fileSize,
      mime,
      sha256,
      chunkSize,
    };
    ws.send(JSON.stringify(offerMsg));

    console.log(`[SyncBoard File] Sent file.offer "${fileName}" (${fileSize} bytes, id: ${id})`);
    return id;
  }

  // Handle phone accepting or rejecting our file offer
  handleFileAccept(ws, msg) {
    const outgoing = this.outgoingTransfers.get(msg.id);
    if (!outgoing) {
      console.warn(`[SyncBoard File] Received accept for unknown transfer: ${msg.id}`);
      return;
    }

    console.log(`[SyncBoard File] Phone accepted offer: ${outgoing.fileName}. Starting binary chunk stream...`);
    const updated = db.updateTransfer(outgoing.id, { status: 'Mengirim' });
    if (updated) this.emit('event:transfer-update', updated);

    this.streamOutgoingChunks(outgoing);
  }

  handleFileReject(ws, msg) {
    const outgoing = this.outgoingTransfers.get(msg.id);
    if (!outgoing) return;

    console.log(`[SyncBoard File] Phone rejected offer: ${outgoing.fileName}. Reason: ${msg.reason}`);
    const updated = db.updateTransfer(outgoing.id, { status: 'Dibatalkan' });
    if (updated) this.emit('event:transfer-update', updated);
    this.outgoingTransfers.delete(msg.id);
  }

  // Stream binary chunks with backpressure protection
  streamOutgoingChunks(outgoing) {
    const { id, filePath, ws, chunkSize } = outgoing;
    const transferIdBytes = Buffer.from(uuidParse(id));

    let currentOffset = 0;
    const readStream = fs.createReadStream(filePath, { highWaterMark: chunkSize });
    outgoing.readStream = readStream;

    readStream.on('data', (chunk) => {
      if (outgoing.isCancelled) {
        readStream.destroy();
        return;
      }

      // Construct 24-byte binary frame: [16B UUID][8B Offset BigEndian][Payload]
      const frame = Buffer.alloc(BINARY_HEADER_TOTAL_SIZE + chunk.length);
      transferIdBytes.copy(frame, 0);
      frame.writeBigUInt64BE(BigInt(currentOffset), BINARY_HEADER_ID_SIZE);
      chunk.copy(frame, BINARY_HEADER_TOTAL_SIZE);

      currentOffset += chunk.length;
      outgoing.bytesSent = currentOffset;

      // Send binary frame
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame, { binary: true });
      }

      // Backpressure management: pause read stream if socket buffer exceeds 1 MB
      if (ws.bufferedAmount > 4 * chunkSize) {
        readStream.pause();
        const checkDrain = setInterval(() => {
          if (ws.bufferedAmount < 2 * chunkSize || outgoing.isCancelled) {
            clearInterval(checkDrain);
            if (!outgoing.isCancelled) readStream.resume();
          }
        }, 20);
      }
    });

    readStream.on('end', () => {
      console.log(`[SyncBoard File] All chunks sent for "${outgoing.fileName}" (${currentOffset} bytes). Waiting for file.done...`);
    });

    readStream.on('error', (err) => {
      console.error(`[SyncBoard File] Read stream error on "${outgoing.fileName}":`, err);
      this.cancelTransfer(id, 'Gagal membaca berkas lokal');
    });
  }

  // --- Receive File: Offer -> User Approval / Auto-Accept -> Binary Chunks -> Temp File -> SHA256 -> Move ---
  handleIncomingOffer(ws, deviceId, msg) {
    const { id, name, size, mime, sha256, chunkSize = DEFAULT_CHUNK_SIZE } = msg;

    if (!id || !name || typeof size !== 'number' || size < 0 || !sha256) {
      ws.send(JSON.stringify({ type: 'file.reject', id, reason: 'Parameter file.offer tidak valid' }));
      return;
    }

    const device = db.getDevice(deviceId);
    const deviceName = device?.name || 'Ponsel Android';
    const paths = getAppPaths();
    const tempPath = path.join(paths.tempDir, `${id}.tmp`);

    const autoAccept = db.getSetting('confirmBeforeReceive', 'true') === 'false';

    const ext = path.extname(name).toLowerCase();
    const isPhoto = /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(ext);
    const kind = isPhoto ? 'photo' : 'file';

    const transfer = db.addTransfer({
      id,
      deviceId,
      direction: 'incoming',
      kind,
      fileName: name,
      fileSize: size,
      sha256,
      status: autoAccept ? 'Mengirim' : 'Menunggu',
    });
    this.emit('event:transfer-update', transfer);

    const setupIncomingState = () => {
      const writeStream = fs.createWriteStream(tempPath);
      const hasher = crypto.createHash('sha256');

      const incomingState = {
        id,
        deviceId,
        ws,
        name,
        size,
        mime,
        sha256,
        chunkSize,
        bytesReceived: 0,
        tempPath,
        writeStream,
        hasher,
        lastProgressReportTime: Date.now(),
        isCancelled: false,
      };
      this.incomingTransfers.set(id, incomingState);

      // Reply with file.accept
      ws.send(JSON.stringify({ type: 'file.accept', id }));
      console.log(`[SyncBoard File] Accepted file.offer for "${name}" (${size} bytes)`);

      // Handle edge case of 0-byte file immediately
      if (size === 0) {
        writeStream.end(async () => {
          await this.finalizeIncomingFile(incomingState);
        });
      }
    };

    if (autoAccept) {
      setupIncomingState();
    } else {
      // Pending user confirmation in UI
      const pending = {
        id,
        deviceId,
        deviceName,
        name,
        size,
        mime,
        sha256,
      };
      this.emit('event:file-offer', pending);

      this.pendingOffers.set(id, {
        offer: pending,
        ws,
        resolve: (accepted) => {
          if (accepted) {
            setupIncomingState();
          } else {
            ws.send(JSON.stringify({ type: 'file.reject', id, reason: 'Ditolak oleh pengguna desktop' }));
            db.updateTransfer(id, { status: 'Dibatalkan' });
            this.emit('event:transfer-update', db.getTransfer(id));
            console.log(`[SyncBoard File] User rejected incoming file: "${name}"`);
          }
        },
      });
    }
  }

  respondPendingOffer(offerId, accept) {
    const entry = this.pendingOffers.get(offerId);
    if (!entry) return false;

    entry.resolve(accept);
    this.pendingOffers.delete(offerId);
    return true;
  }

  // --- Process Incoming Binary Frame ---
  handleBinaryChunk(buffer) {
    if (buffer.length < BINARY_HEADER_TOTAL_SIZE) {
      console.warn('[SyncBoard File] Binary frame too short (< 24 bytes)');
      return;
    }

    // Extract 16-byte transfer ID
    const transferId = uuidStringify(buffer.subarray(0, BINARY_HEADER_ID_SIZE));
    const offset = Number(buffer.readBigUInt64BE(BINARY_HEADER_ID_SIZE));
    const payload = buffer.subarray(BINARY_HEADER_TOTAL_SIZE);

    const incoming = this.incomingTransfers.get(transferId);
    if (!incoming || incoming.isCancelled) {
      return;
    }

    // Write chunk directly to temp file
    incoming.writeStream.write(payload);
    incoming.hasher.update(payload);
    incoming.bytesReceived += payload.length;

    // Send progress updates throttled (every 250ms or on completion)
    const now = Date.now();
    if (now - incoming.lastProgressReportTime > 250 || incoming.bytesReceived >= incoming.size) {
      incoming.lastProgressReportTime = now;
      const progressMsg = {
        type: 'file.progress',
        id: transferId,
        bytesReceived: incoming.bytesReceived,
      };
      if (incoming.ws && incoming.ws.readyState === WebSocket.OPEN) {
        incoming.ws.send(JSON.stringify(progressMsg));
      }
      this.emit('event:transfer-progress', { id: transferId, bytesReceived: incoming.bytesReceived });
    }

    // Check if entire file has been received
    if (incoming.bytesReceived >= incoming.size) {
      incoming.writeStream.end(async () => {
        await this.finalizeIncomingFile(incoming);
      });
    }
  }

  handleFileProgress(ws, msg) {
    this.emit('event:transfer-progress', { id: msg.id, bytesReceived: msg.bytesReceived });
  }

  // Verify SHA-256 and move from .tmp to final download directory
  async finalizeIncomingFile(incoming) {
    const { id, tempPath, sha256: expectedSha256, name, ws } = incoming;
    const computedSha256 = incoming.hasher.digest('hex').toLowerCase();

    console.log(`[SyncBoard File] Received all bytes for "${name}". Verifying SHA-256 integrity...`);
    console.log(`Expected: ${expectedSha256}`);
    console.log(`Computed: ${computedSha256}`);

    if (computedSha256 !== expectedSha256.toLowerCase()) {
      console.error(`[SyncBoard File] SHA-256 mismatch for "${name}"!`);
      // Delete temp file immediately
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}

      db.updateTransfer(id, { status: 'Gagal' });
      this.emit('event:transfer-update', db.getTransfer(id));

      const doneMsg = {
        type: 'file.done',
        id,
        ok: false,
        reason: 'Hash SHA-256 tidak cocok (integritas gagal)',
      };
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(doneMsg));
      }
      this.incomingTransfers.delete(id);
      return;
    }

    // Verified! Determine destination path with safe filename sanitization & collision avoidance
    const paths = getAppPaths();
    const downloadDir = db.getSetting('downloadDir', paths.downloads) || paths.downloads;
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const { finalName, fullPath } = resolveUniqueFileName(
      downloadDir,
      name,
      (p) => fs.existsSync(p),
      path.join
    );

    // Move temp file to destination
    try {
      fs.renameSync(tempPath, fullPath);
    } catch (err) {
      fs.copyFileSync(tempPath, fullPath);
      fs.unlinkSync(tempPath);
    }

    console.log(`[SyncBoard File] File successfully saved: "${finalName}" at ${fullPath}`);

    const transfer = db.updateTransfer(id, {
      fileName: finalName,
      savedPath: fullPath,
      status: 'Selesai',
    });
    this.emit('event:transfer-update', transfer);

    // Send file.done { ok: true }
    const doneMsg = {
      type: 'file.done',
      id,
      ok: true,
    };
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(doneMsg));
    }
    this.incomingTransfers.delete(id);
  }

  handleFileDone(ws, msg) {
    const outgoing = this.outgoingTransfers.get(msg.id);
    if (!outgoing) return;

    if (msg.ok) {
      console.log(`[SyncBoard File] Receiver confirmed file.done OK: "${outgoing.fileName}"`);
      const transfer = db.updateTransfer(msg.id, { status: 'Selesai' });
      if (transfer) this.emit('event:transfer-update', transfer);
    } else {
      console.warn(`[SyncBoard File] Receiver reported file.done failed: "${outgoing.fileName}" (${msg.reason})`);
      const transfer = db.updateTransfer(msg.id, { status: 'Gagal' });
      if (transfer) this.emit('event:transfer-update', transfer);
    }
    this.outgoingTransfers.delete(msg.id);
  }

  handleRemoteCancel(ws, msg) {
    const { id } = msg;
    this.cancelTransfer(id, 'Dibatalkan oleh pihak pengirim/penerima', false);
  }

  cancelTransfer(id, reason, notifyRemote = true) {
    // Check outgoing
    const outgoing = this.outgoingTransfers.get(id);
    if (outgoing) {
      outgoing.isCancelled = true;
      if (outgoing.readStream) outgoing.readStream.destroy();
      if (notifyRemote && outgoing.ws.readyState === WebSocket.OPEN) {
        outgoing.ws.send(JSON.stringify({ type: 'transfer.cancel', id }));
      }
      this.outgoingTransfers.delete(id);
      db.updateTransfer(id, { status: 'Dibatalkan' });
      this.emit('event:transfer-update', db.getTransfer(id));
      console.log(`[SyncBoard File] Cancelled outgoing transfer: ${id}`);
      return true;
    }

    // Check incoming
    const incoming = this.incomingTransfers.get(id);
    if (incoming) {
      incoming.isCancelled = true;
      incoming.writeStream.destroy();
      try {
        if (fs.existsSync(incoming.tempPath)) fs.unlinkSync(incoming.tempPath);
      } catch {}
      if (notifyRemote && incoming.ws.readyState === WebSocket.OPEN) {
        incoming.ws.send(JSON.stringify({ type: 'transfer.cancel', id }));
      }
      this.incomingTransfers.delete(id);
      db.updateTransfer(id, { status: 'Dibatalkan' });
      this.emit('event:transfer-update', db.getTransfer(id));
      console.log(`[SyncBoard File] Cancelled incoming transfer & deleted temp: ${id}`);
      return true;
    }

    // Check pending offers
    const pending = this.pendingOffers.get(id);
    if (pending) {
      pending.resolve(false);
      return true;
    }

    return false;
  }

  cleanupForClient(ws, deviceId) {
    for (const [id, outgoing] of this.outgoingTransfers.entries()) {
      if (outgoing.ws === ws || (deviceId && outgoing.deviceId === deviceId)) {
        this.cancelTransfer(id, 'Koneksi terputus', false);
      }
    }
    for (const [id, incoming] of this.incomingTransfers.entries()) {
      if (incoming.ws === ws || (deviceId && incoming.deviceId === deviceId)) {
        this.cancelTransfer(id, 'Koneksi terputus', false);
      }
    }
    for (const [id, entry] of this.pendingOffers.entries()) {
      if (entry.ws === ws || (deviceId && entry.offer.deviceId === deviceId)) {
        entry.resolve(false);
        this.pendingOffers.delete(id);
      }
    }
  }
}

const transferManager = new TransferManager();

module.exports = {
  TransferManager,
  transferManager,
};
