const https = require('https');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');
const { getOrCreateCertificate } = require('./cert');
const { pairingManager } = require('./pairing');
const { secretManager } = require('./secrets');
const { transferManager } = require('./transfers');
const { PING_INTERVAL_MS, DEFAULT_PORT } = require('../shared/constants');

class SyncBoardServer {
  constructor() {
    this.httpsServer = null;
    this.wss = null;
    this.clients = new Map();
    this.pendingPairRequests = new Map();
    this.pendingAcks = new Map();
    this.heartbeatInterval = null;
    this.onEventCallback = null;

    transferManager.setEventCallback((event, data) => this.emit(event, data));
  }

  setEventCallback(cb) {
    this.onEventCallback = cb;
  }

  emit(event, data) {
    if (this.onEventCallback) {
      this.onEventCallback(event, data);
    }
  }

  async start(customPort) {
    if (this.httpsServer) {
      await this.stop();
    }

    const certInfo = await getOrCreateCertificate();
    const port = customPort || parseInt(db.getSetting('serverPort', String(DEFAULT_PORT)) || String(DEFAULT_PORT), 10);

    return new Promise((resolve, reject) => {
      this.httpsServer = https.createServer(
        {
          cert: certInfo.cert,
          key: certInfo.key,
          requestCert: false,
          rejectUnauthorized: false,
        },
        (_req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('SyncBoard TLS Server Aktif.\n');
        }
      );

      this.wss = new WebSocketServer({ server: this.httpsServer });

      this.wss.on('connection', (ws, req) => {
        this.handleNewConnection(ws, req);
      });

      this.httpsServer.listen(port, '0.0.0.0', () => {
        console.log(`[SyncBoard Server] Listening on WSS port ${port}`);
        this.startHeartbeat();
        resolve({ port, certFingerprint: certInfo.fingerprint });
      });

      this.httpsServer.on('error', (err) => {
        console.error('[SyncBoard Server] Server error:', err);
        reject(err);
      });
    });
  }

  async stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    for (const [ws, client] of this.clients.entries()) {
      transferManager.cleanupForClient(ws, client.deviceId);
      try {
        ws.close(1001, 'Server Berhenti');
      } catch {}
    }
    this.clients.clear();
    this.pendingPairRequests.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpsServer) {
      return new Promise((resolve) => {
        this.httpsServer.close(() => {
          this.httpsServer = null;
          console.log('[SyncBoard Server] Server stopped cleanly.');
          resolve();
        });
      });
    }
  }

  handleNewConnection(ws, req) {
    const clientIp = req.socket.remoteAddress;
    console.log(`[SyncBoard Server] New incoming connection from ${clientIp}`);

    const clientState = {
      ws,
      isAlive: true,
      deviceId: null,
      deviceName: null,
    };
    this.clients.set(ws, clientState);

    ws.on('pong', () => {
      clientState.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this.handleBinaryMessage(clientState, Buffer.from(data));
      } else {
        try {
          const msg = JSON.parse(data.toString('utf8'));
          this.handleTextMessage(clientState, msg);
        } catch (err) {
          console.error('[SyncBoard Server] Error parsing JSON text frame:', err.message);
        }
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[SyncBoard Server] Connection closed (${code}): ${reason.toString()}`);
      transferManager.cleanupForClient(ws, clientState.deviceId);
      if (clientState.deviceId) {
        db.updateDeviceLastSeen(clientState.deviceId);
        const dev = db.getDevice(clientState.deviceId);
        if (dev) {
          db.upsertDevice({ ...dev, status: 'paired' });
        }
        this.broadcastDeviceStatus();
      }
      this.clients.delete(ws);
    });

    ws.on('error', (err) => {
      console.warn('[SyncBoard Server] Client socket error:', err.message);
    });
  }

  handleTextMessage(client, msg) {
    switch (msg.type) {
      case 'ping':
        client.isAlive = true;
        this.sendJson(client.ws, { type: 'pong' });
        break;

      case 'pong':
        client.isAlive = true;
        break;

      case 'pair.request':
        this.handlePairRequest(client, msg);
        break;

      case 'auth.hello':
        this.handleAuthHello(client, msg);
        break;

      case 'auth.response':
        this.handleAuthResponse(client, msg);
        break;

      case 'text.send':
        this.handleIncomingTextSend(client, msg);
        break;

      case 'text.ack':
        this.handleIncomingTextAck(client, msg);
        break;

      case 'file.offer':
        if (client.deviceId) {
          transferManager.handleIncomingOffer(client.ws, client.deviceId, msg);
        } else {
          client.ws.close(4401, 'Unauthorized');
        }
        break;

      case 'file.accept':
        transferManager.handleFileAccept(client.ws, msg);
        break;

      case 'file.reject':
        transferManager.handleFileReject(client.ws, msg);
        break;

      case 'file.progress':
        transferManager.handleFileProgress(client.ws, msg);
        break;

      case 'file.done':
        transferManager.handleFileDone(client.ws, msg);
        break;

      case 'transfer.cancel':
        transferManager.handleRemoteCancel(client.ws, msg);
        break;

      default:
        console.log(`[SyncBoard Server] Received message type: ${msg.type}`);
        break;
    }
  }

  async handlePairRequest(client, msg) {
    const { deviceId, deviceName, pairToken, clientSecret } = msg;

    if (!deviceId || !pairToken || !clientSecret) {
      this.sendJson(client.ws, {
        type: 'pair.response',
        ok: false,
        reason: 'Parameter permintaan pemasangan tidak lengkap',
      });
      client.ws.close(4400, 'Bad pair request');
      return;
    }

    const tokenValidation = pairingManager.validateToken(pairToken);
    if (!tokenValidation.valid) {
      console.warn(`[SyncBoard Pairing] Rejected token: ${tokenValidation.reason}`);
      this.sendJson(client.ws, {
        type: 'pair.response',
        ok: false,
        reason: tokenValidation.reason,
      });
      client.ws.close(4403, tokenValidation.reason);
      return;
    }

    const verificationCode = pairingManager.getVerificationCode(pairToken, deviceId);
    const requestId = crypto.randomUUID();

    const pendingReq = {
      requestId,
      deviceId,
      deviceName: deviceName || 'Ponsel Android',
      verificationCode,
      pairToken,
      clientSecret,
      receivedAt: Date.now(),
    };

    console.log(
      `[SyncBoard Pairing] Pair request from "${deviceName}" (${deviceId}). Verification Code: ${verificationCode}`
    );

    this.emit('event:pair-request', pendingReq);

    this.pendingPairRequests.set(requestId, {
      request: pendingReq,
      ws: client.ws,
      resolve: async (accepted) => {
        if (accepted) {
          secretManager.setDeviceSecret(deviceId, clientSecret);
          const certInfo = await getOrCreateCertificate();

          db.upsertDevice({
            id: deviceId,
            name: deviceName || 'Ponsel Android',
            certFingerprint: certInfo.fingerprint,
            pairedAt: Date.now(),
            lastSeenAt: Date.now(),
            status: 'connected',
          });

          client.deviceId = deviceId;
          client.deviceName = deviceName;

          this.sendJson(client.ws, {
            type: 'pair.response',
            ok: true,
          });

          console.log(`[SyncBoard Pairing] Successfully paired with ${deviceName}!`);
          this.broadcastDeviceStatus();
        } else {
          this.sendJson(client.ws, {
            type: 'pair.response',
            ok: false,
            reason: 'Ditolak oleh pengguna desktop',
          });
          client.ws.close(4403, 'Pairing rejected by user');
          console.log(`[SyncBoard Pairing] User rejected pairing for ${deviceName}.`);
        }
      },
    });
  }

  respondPairRequest(requestId, accept) {
    const entry = this.pendingPairRequests.get(requestId);
    if (!entry) return false;

    entry.resolve(accept);
    this.pendingPairRequests.delete(requestId);
    return true;
  }

  handleAuthHello(client, msg) {
    const { deviceId, nonce } = msg;

    if (!deviceId || !nonce) {
      client.ws.close(4400, 'Parameter auth.hello tidak lengkap');
      return;
    }

    const device = db.getDevice(deviceId);
    if (!device || device.status === 'revoked') {
      console.warn(`[SyncBoard Auth] Rejected unknown or revoked device: ${deviceId}`);
      client.ws.close(4401, 'Perangkat tidak dikenal atau telah dicabut');
      return;
    }

    const storedSecret = secretManager.getDeviceSecret(deviceId);
    if (!storedSecret) {
      console.warn(`[SyncBoard Auth] No secure secret found for device: ${deviceId}`);
      client.ws.close(4401, 'Kunci rahasia perangkat tidak ditemukan di penyimpanan aman');
      return;
    }

    const challenge = crypto.randomBytes(32).toString('hex');
    client.deviceId = deviceId;
    client.deviceName = device.name;
    client.authNonce = nonce;
    client.authChallenge = challenge;

    this.sendJson(client.ws, {
      type: 'auth.challenge',
      challenge,
    });
  }

  handleAuthResponse(client, msg) {
    const { signature } = msg;

    if (!client.deviceId || !client.authNonce || !client.authChallenge) {
      client.ws.close(4401, 'Sesi autentikasi tidak valid');
      return;
    }

    const storedSecret = secretManager.getDeviceSecret(client.deviceId);
    if (!storedSecret) {
      client.ws.close(4401, 'Kunci rahasia tidak ditemukan');
      return;
    }

    const dataToSign = `${client.authChallenge}${client.authNonce}`;
    const expectedSignature = crypto
      .createHmac('sha256', storedSecret)
      .update(dataToSign, 'utf8')
      .digest('hex');

    const sigBuffer = Buffer.from(signature || '', 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    const isValid =
      sigBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(sigBuffer, expectedBuffer);

    if (!isValid) {
      console.warn(`[SyncBoard Auth] Invalid HMAC signature from ${client.deviceId}!`);
      client.ws.close(4401, 'Tanda tangan autentikasi HMAC tidak cocok');
      return;
    }

    console.log(`[SyncBoard Auth] Device "${client.deviceName}" (${client.deviceId}) authenticated successfully!`);

    db.updateDeviceLastSeen(client.deviceId);
    db.upsertDevice({
      id: client.deviceId,
      name: client.deviceName || 'Ponsel Android',
      certFingerprint: db.getDevice(client.deviceId)?.certFingerprint || '',
      status: 'connected',
    });

    const desktopDeviceId = db.getSetting('deviceId') || '';
    const desktopDeviceName = db.getSetting('deviceName') || 'SyncBoard Desktop';

    this.sendJson(client.ws, {
      type: 'auth.ok',
      deviceId: desktopDeviceId,
      deviceName: desktopDeviceName,
    });

    this.broadcastDeviceStatus();
  }

  // --- M3: Text & Link Send/Receive/Ack Flow ---
  handleIncomingTextSend(client, msg) {
    const { id, kind, body, ts } = msg;

    if (!id || typeof body !== 'string') {
      console.warn('[SyncBoard Text] Malformed text.send message');
      return;
    }

    // Verify client is authenticated
    if (!client.deviceId) {
      console.warn('[SyncBoard Text] Received text.send from unauthenticated client');
      client.ws.close(4401, 'Unauthorized');
      return;
    }

    // CRITICAL: Text received must be byte-identical to text sent (UTF-8, no trimming)
    const effectiveKind = kind === 'link' ? 'link' : 'text';
    const transfer = db.addTransfer({
      id,
      deviceId: client.deviceId,
      direction: 'incoming',
      kind: effectiveKind,
      textBody: body,
      status: 'Selesai',
      createdAt: ts || Date.now(),
    });

    // Send immediate acknowledgment frame
    this.sendJson(client.ws, {
      type: 'text.ack',
      id,
    });

    // Emit event to renderer
    this.emit('event:transfer-update', transfer);
    console.log(`[SyncBoard Text] Received text (${body.length} chars) from ${client.deviceName || client.deviceId}`);
  }

  handleIncomingTextAck(client, msg) {
    const { id } = msg;
    if (!id) return;

    // Clear timeout if pending
    const pending = this.pendingAcks.get(id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(id);
    }

    // Update status to 'Selesai'
    const transfer = db.updateTransfer(id, { status: 'Selesai' });
    if (transfer) {
      this.emit('event:transfer-update', transfer);
      console.log(`[SyncBoard Text] Acknowledged text send: ${id}`);
    }
  }

  async sendTextMessage(targetDeviceId, text, kind = 'text') {
    if (typeof text !== 'string' || !text.length) {
      throw new Error('Teks pesan tidak boleh kosong');
    }

    const devices = db.getDevices();
    const devId = targetDeviceId || (devices.length > 0 ? devices[0].id : null);
    if (!devId) {
      throw new Error('Belum ada perangkat yang terpasang');
    }

    let targetWs = null;
    for (const [ws, client] of this.clients.entries()) {
      if (client.deviceId === devId) {
        targetWs = ws;
        break;
      }
    }

    const id = crypto.randomUUID();
    const ts = Date.now();
    const effectiveKind = kind === 'link' ? 'link' : 'text';

    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
      const transfer = db.addTransfer({
        id,
        deviceId: devId,
        direction: 'outgoing',
        kind: effectiveKind,
        textBody: text,
        status: 'Gagal',
        createdAt: ts,
      });
      this.emit('event:transfer-update', transfer);
      throw new Error('Perangkat target sedang tidak terhubung via Wi-Fi');
    }

    const transfer = db.addTransfer({
      id,
      deviceId: devId,
      direction: 'outgoing',
      kind: effectiveKind,
      textBody: text,
      status: 'Mengirim',
      createdAt: ts,
    });
    this.emit('event:transfer-update', transfer);

    this.sendJson(targetWs, {
      type: 'text.send',
      id,
      kind: effectiveKind,
      body: text,
      ts,
    });

    const timeout = setTimeout(() => {
      this.pendingAcks.delete(id);
      const failed = db.updateTransfer(id, { status: 'Gagal' });
      if (failed) this.emit('event:transfer-update', failed);
      console.warn(`[SyncBoard Text] ACK timeout for message ${id}`);
    }, 10000);

    this.pendingAcks.set(id, { timeout });
    return transfer;
  }

  async retryTransfer(id) {
    const transfer = db.getTransfer(id);
    if (!transfer) throw new Error('Transfer tidak ditemukan');

    if (transfer.kind === 'text' || transfer.kind === 'link') {
      return this.sendTextMessage(transfer.deviceId, transfer.textBody, transfer.kind);
    }

    if ((transfer.kind === 'file' || transfer.kind === 'photo') && transfer.direction === 'outgoing') {
      if (transfer.savedPath) {
        return await this.sendFile(transfer.savedPath, transfer.deviceId);
      }
    }
    return transfer;
  }

  async sendFile(filePath, targetDeviceId) {
    let targetClient;
    if (targetDeviceId) {
      for (const client of this.clients.values()) {
        if (client.deviceId === targetDeviceId) {
          targetClient = client;
          break;
        }
      }
    } else {
      for (const client of this.clients.values()) {
        if (client.deviceId) {
          targetClient = client;
          break;
        }
      }
    }

    if (!targetClient || !targetClient.deviceId) {
      throw new Error('Tidak ada perangkat ponsel yang terhubung saat ini');
    }

    return await transferManager.startSendFile(targetClient.ws, targetClient.deviceId, filePath);
  }

  cancelTransfer(id) {
    return transferManager.cancelTransfer(id);
  }

  respondFileOffer(offerId, accept) {
    return transferManager.respondPendingOffer(offerId, accept);
  }

  handleBinaryMessage(_client, buffer) {
    transferManager.handleBinaryChunk(buffer);
  }

  sendJson(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  disconnectDevice(deviceId) {
    let found = false;
    for (const [ws, client] of this.clients.entries()) {
      if (client.deviceId === deviceId) {
        try {
          ws.close(1000, 'Diputuskan oleh pengguna desktop');
        } catch {}
        found = true;
      }
    }
    db.updateDeviceLastSeen(deviceId);
    const dev = db.getDevice(deviceId);
    if (dev) {
      db.upsertDevice({ ...dev, status: 'paired' });
    }
    this.broadcastDeviceStatus();
    return found;
  }

  removeDevice(deviceId) {
    this.disconnectDevice(deviceId);
    secretManager.removeDeviceSecret(deviceId);
    const deleted = db.removeDevice(deviceId);
    this.broadcastDeviceStatus();
    return deleted;
  }

  broadcastDeviceStatus() {
    const devices = db.getDevices();
    const activeDeviceIds = new Set();
    for (const client of this.clients.values()) {
      if (client.deviceId) activeDeviceIds.add(client.deviceId);
    }

    const updated = devices.map((d) => ({
      ...d,
      status: activeDeviceIds.has(d.id) ? 'connected' : 'paired',
    }));

    this.emit('event:device-status', updated);
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(() => {
      for (const [ws, client] of this.clients.entries()) {
        if (!client.isAlive) {
          console.log('[SyncBoard Heartbeat] Terminating inactive dead connection');
          ws.terminate();
          this.clients.delete(ws);
          continue;
        }

        client.isAlive = false;
        this.sendJson(ws, { type: 'ping' });
      }
    }, PING_INTERVAL_MS);
  }

  getConnectedDeviceCount() {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.deviceId) count++;
    }
    return count;
  }
}

const syncBoardServer = new SyncBoardServer();
module.exports = {
  syncBoardServer,
  SyncBoardServer,
};
