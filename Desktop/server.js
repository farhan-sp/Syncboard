"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncBoardServer = exports.SyncBoardServer = void 0;
const https_1 = __importDefault(require("https"));
const crypto_1 = __importDefault(require("crypto"));
const ws_1 = require("ws");
const db = __importStar(require("./db"));
const cert_1 = require("./cert");
const pairing_1 = require("./pairing");
const secrets_1 = require("./secrets");
const transfers_1 = require("./transfers");
const constants_1 = require("../shared/constants");
class SyncBoardServer {
    httpsServer = null;
    wss = null;
    clients = new Map();
    pendingPairRequests = new Map();
    pendingAcks = new Map();
    heartbeatInterval = null;
    onEventCallback = null;
    constructor() {
        transfers_1.transferManager.setEventCallback((event, data) => this.emit(event, data));
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
        const certInfo = await (0, cert_1.getOrCreateCertificate)();
        const port = customPort || parseInt(db.getSetting('serverPort', String(constants_1.DEFAULT_PORT)) || String(constants_1.DEFAULT_PORT), 10);
        return new Promise((resolve, reject) => {
            this.httpsServer = https_1.default.createServer({
                cert: certInfo.cert,
                key: certInfo.key,
                // Trust is established via fingerprint pinning at application level
                requestCert: false,
                rejectUnauthorized: false,
            }, (_req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('SyncBoard TLS Server Aktif.\n');
            });
            this.wss = new ws_1.WebSocketServer({ server: this.httpsServer });
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
        // Close all active client connections
        for (const [ws, client] of this.clients.entries()) {
            transfers_1.transferManager.cleanupForClient(ws, client.deviceId);
            try {
                ws.close(1001, 'Server Berhenti');
            }
            catch { }
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
        };
        this.clients.set(ws, clientState);
        ws.on('pong', () => {
            clientState.isAlive = true;
        });
        ws.on('message', (data, isBinary) => {
            if (isBinary) {
                this.handleBinaryMessage(clientState, Buffer.from(data));
            }
            else {
                try {
                    const msg = JSON.parse(data.toString('utf8'));
                    this.handleTextMessage(clientState, msg);
                }
                catch (err) {
                    console.error('[SyncBoard Server] Error parsing JSON text frame:', err.message);
                }
            }
        });
        ws.on('close', (code, reason) => {
            console.log(`[SyncBoard Server] Connection closed (${code}): ${reason.toString()}`);
            transfers_1.transferManager.cleanupForClient(ws, clientState.deviceId);
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
                    transfers_1.transferManager.handleIncomingOffer(client.ws, client.deviceId, msg);
                }
                else {
                    client.ws.close(4401, 'Unauthorized');
                }
                break;
            case 'file.accept':
                transfers_1.transferManager.handleFileAccept(client.ws, msg);
                break;
            case 'file.reject':
                transfers_1.transferManager.handleFileReject(client.ws, msg);
                break;
            case 'file.progress':
                transfers_1.transferManager.handleFileProgress(client.ws, msg);
                break;
            case 'file.done':
                transfers_1.transferManager.handleFileDone(client.ws, msg);
                break;
            case 'transfer.cancel':
                transfers_1.transferManager.handleRemoteCancel(client.ws, msg);
                break;
            default:
                console.log(`[SyncBoard Server] Received message type: ${msg.type}`);
                break;
        }
    }
    // --- Pairing Flow ---
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
        // 1. Validate pairToken (single-use & expiration check)
        const tokenValidation = pairing_1.pairingManager.validateToken(pairToken);
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
        // 2. Derive identical 6-digit verification code: "482-915"
        const verificationCode = pairing_1.pairingManager.getVerificationCode(pairToken, deviceId);
        const requestId = crypto_1.default.randomUUID();
        const pendingReq = {
            requestId,
            deviceId,
            deviceName: deviceName || 'Ponsel Android',
            verificationCode,
            pairToken,
            clientSecret,
            receivedAt: Date.now(),
        };
        console.log(`[SyncBoard Pairing] Pair request from "${deviceName}" (${deviceId}). Verification Code: ${verificationCode}`);
        // 3. Emit event to Desktop UI modal
        this.emit('event:pair-request', pendingReq);
        // 4. Store pending promise waiting for user to click "Izinkan" or "Tolak"
        this.pendingPairRequests.set(requestId, {
            request: pendingReq,
            ws: client.ws,
            resolve: async (accepted) => {
                if (accepted) {
                    // Save client secret securely in OS Secure Storage
                    secrets_1.secretManager.setDeviceSecret(deviceId, clientSecret);
                    // Save device to SQLite database (without raw secret)
                    const certInfo = await (0, cert_1.getOrCreateCertificate)();
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
                }
                else {
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
    // Called when desktop user clicks "Izinkan" or "Tolak" in UI
    respondPairRequest(requestId, accept) {
        const entry = this.pendingPairRequests.get(requestId);
        if (!entry)
            return false;
        entry.resolve(accept);
        this.pendingPairRequests.delete(requestId);
        return true;
    }
    // --- Reconnect & Auth Challenge-Response Flow ---
    handleAuthHello(client, msg) {
        const { deviceId, nonce } = msg;
        if (!deviceId || !nonce) {
            client.ws.close(4400, 'Parameter auth.hello tidak lengkap');
            return;
        }
        // Check if device is in trusted devices database
        const device = db.getDevice(deviceId);
        if (!device || device.status === 'revoked') {
            console.warn(`[SyncBoard Auth] Rejected unknown or revoked device: ${deviceId}`);
            client.ws.close(4401, 'Perangkat tidak dikenal atau telah dicabut');
            return;
        }
        // Check if secret exists in secure storage
        const storedSecret = secrets_1.secretManager.getDeviceSecret(deviceId);
        if (!storedSecret) {
            console.warn(`[SyncBoard Auth] No secure secret found for device: ${deviceId}`);
            client.ws.close(4401, 'Kunci rahasia perangkat tidak ditemukan di penyimpanan aman');
            return;
        }
        // Generate random 32-byte challenge
        const challenge = crypto_1.default.randomBytes(32).toString('hex');
        client.deviceId = deviceId;
        client.deviceName = device.name;
        client.authNonce = nonce;
        client.authChallenge = challenge;
        // Reply with challenge
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
        const storedSecret = secrets_1.secretManager.getDeviceSecret(client.deviceId);
        if (!storedSecret) {
            client.ws.close(4401, 'Kunci rahasia tidak ditemukan');
            return;
        }
        // Expected signature: HMAC-SHA256(clientSecret, challenge + nonce)
        const dataToSign = `${client.authChallenge}${client.authNonce}`;
        const expectedSignature = crypto_1.default
            .createHmac('sha256', storedSecret)
            .update(dataToSign, 'utf8')
            .digest('hex');
        // Timing-safe comparison to prevent side-channel timing attacks
        const sigBuffer = Buffer.from(signature || '', 'hex');
        const expectedBuffer = Buffer.from(expectedSignature, 'hex');
        const isValid = sigBuffer.length === expectedBuffer.length &&
            crypto_1.default.timingSafeEqual(sigBuffer, expectedBuffer);
        if (!isValid) {
            console.warn(`[SyncBoard Auth] Invalid HMAC signature from ${client.deviceId}!`);
            client.ws.close(4401, 'Tanda tangan autentikasi HMAC tidak cocok');
            return;
        }
        // Autentikasi Berhasil!
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
    handleIncomingTextAck(_client, msg) {
        const { id } = msg;
        if (!id)
            return;
        const pending = this.pendingAcks.get(id);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingAcks.delete(id);
        }
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
        const id = crypto_1.default.randomUUID();
        const ts = Date.now();
        const effectiveKind = kind === 'link' ? 'link' : 'text';
        if (!targetWs || targetWs.readyState !== ws_1.WebSocket.OPEN) {
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
            if (failed)
                this.emit('event:transfer-update', failed);
            console.warn(`[SyncBoard Text] ACK timeout for message ${id}`);
        }, 10000);
        this.pendingAcks.set(id, { timeout });
        return transfer;
    }
    async retryTransfer(id) {
        const transfer = db.getTransfer(id);
        if (!transfer)
            throw new Error('Transfer tidak ditemukan');
        if (transfer.kind === 'text' || transfer.kind === 'link') {
            return this.sendTextMessage(transfer.deviceId, transfer.textBody || '', transfer.kind);
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
        }
        else {
            // Pick first authenticated client
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
        return await transfers_1.transferManager.startSendFile(targetClient.ws, targetClient.deviceId, filePath);
    }
    cancelTransfer(id) {
        return transfers_1.transferManager.cancelTransfer(id);
    }
    respondFileOffer(offerId, accept) {
        return transfers_1.transferManager.respondPendingOffer(offerId, accept);
    }
    handleBinaryMessage(_client, buffer) {
        transfers_1.transferManager.handleBinaryChunk(buffer);
    }
    sendJson(ws, payload) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    }
    // --- Device Management Actions ---
    disconnectDevice(deviceId) {
        let found = false;
        for (const [ws, client] of this.clients.entries()) {
            if (client.deviceId === deviceId) {
                try {
                    ws.close(1000, 'Diputuskan oleh pengguna desktop');
                }
                catch { }
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
        secrets_1.secretManager.removeDeviceSecret(deviceId);
        const deleted = db.removeDevice(deviceId);
        this.broadcastDeviceStatus();
        return deleted;
    }
    broadcastDeviceStatus() {
        const devices = db.getDevices();
        // Update connected status based on active clients
        const activeDeviceIds = new Set();
        for (const client of this.clients.values()) {
            if (client.deviceId)
                activeDeviceIds.add(client.deviceId);
        }
        const updated = devices.map((d) => ({
            ...d,
            status: activeDeviceIds.has(d.id) ? 'connected' : 'paired',
        }));
        this.emit('event:device-status', updated);
    }
    // --- Heartbeat Ping/Pong ---
    startHeartbeat() {
        if (this.heartbeatInterval)
            clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            for (const [ws, client] of this.clients.entries()) {
                if (!client.isAlive) {
                    console.log('[SyncBoard Heartbeat] Terminating inactive dead connection');
                    ws.terminate();
                    this.clients.delete(ws);
                    continue;
                }
                // Send ping every 15 seconds
                client.isAlive = false;
                this.sendJson(ws, { type: 'ping' });
            }
        }, constants_1.PING_INTERVAL_MS);
    }
    getConnectedDeviceCount() {
        let count = 0;
        for (const client of this.clients.values()) {
            if (client.deviceId)
                count++;
        }
        return count;
    }
}
exports.SyncBoardServer = SyncBoardServer;
exports.syncBoardServer = new SyncBoardServer();
