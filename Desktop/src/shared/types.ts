/**
 * Shared protocol types and data structures for SyncBoard (v1)
 */

export type TransferStatus = 'Menunggu' | 'Mengirim' | 'Selesai' | 'Dibatalkan' | 'Gagal';
export type TransferKind = 'text' | 'link' | 'photo' | 'file';
export type TransferDirection = 'incoming' | 'outgoing';
export type HistoryMode = 'simpan' | 'kirim_sekali';
export type AppTheme = 'dark' | 'light' | 'system';

// --- Shared Protocol v1 Messages ---

export interface QRPairPayload {
  v: 1;
  deviceId: string;
  deviceName: string;
  hosts: string[];
  port: number;
  certFingerprint: string;
  pairToken: string; // 32 bytes base64url
  expiresAt: number; // millisecond timestamp
}

export interface PairRequestMessage {
  type: 'pair.request';
  deviceId: string;
  deviceName: string;
  pairToken: string;
  clientSecret: string; // 32 bytes hex or base64
}

export interface PairResponseMessage {
  type: 'pair.response';
  ok: boolean;
  reason?: string;
}

export interface AuthHelloMessage {
  type: 'auth.hello';
  deviceId: string;
  nonce: string;
}

export interface AuthChallengeMessage {
  type: 'auth.challenge';
  challenge: string;
}

export interface AuthResponseMessage {
  type: 'auth.response';
  signature: string; // HMAC-SHA256(clientSecret, challenge + nonce)
}

export interface AuthOkMessage {
  type: 'auth.ok';
  deviceId: string;
  deviceName: string;
}

export interface TextSendMessage {
  type: 'text.send';
  id: string;
  kind: 'text' | 'link';
  body: string;
  ts: number;
}

export interface TextAckMessage {
  type: 'text.ack';
  id: string;
}

export interface FileOfferMessage {
  type: 'file.offer';
  id: string;
  name: string;
  size: number;
  mime: string;
  sha256: string;
  chunkSize: number; // default 262144 (256 KB)
}

export interface FileAcceptMessage {
  type: 'file.accept';
  id: string;
}

export interface FileRejectMessage {
  type: 'file.reject';
  id: string;
  reason: string;
}

export interface FileProgressMessage {
  type: 'file.progress';
  id: string;
  bytesReceived: number;
}

export interface FileDoneMessage {
  type: 'file.done';
  id: string;
  ok: boolean;
  reason?: string;
}

export interface TransferCancelMessage {
  type: 'transfer.cancel';
  id: string;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

export type ProtocolMessage =
  | PairRequestMessage
  | PairResponseMessage
  | AuthHelloMessage
  | AuthChallengeMessage
  | AuthResponseMessage
  | AuthOkMessage
  | TextSendMessage
  | TextAckMessage
  | FileOfferMessage
  | FileAcceptMessage
  | FileRejectMessage
  | FileProgressMessage
  | FileDoneMessage
  | TransferCancelMessage
  | PingMessage
  | PongMessage;

// --- Database & Entity Models ---

export interface DeviceModel {
  id: string;
  name: string;
  certFingerprint: string;
  pairedAt: number;
  lastSeenAt: number;
  status: 'paired' | 'connected' | 'disconnected' | 'revoked';
  ipAddress?: string;
}

export interface TransferModel {
  id: string;
  deviceId: string;
  deviceName?: string;
  direction: TransferDirection;
  kind: TransferKind;
  textBody?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  savedPath?: string | null;
  mime?: string | null;
  sha256?: string | null;
  status: TransferStatus;
  pinned: number; // 0 or 1
  createdAt: number;
  expiresAt?: number | null;
  speedBps?: number;
  bytesTransferred?: number;
}

export interface AppSettings {
  serverPort: number;
  deviceName: string;
  downloadDir: string;
  confirmBeforeReceive: boolean;
  historyMode: HistoryMode;
  retentionHours: number; // 1, 24, 168 (7 days)
  theme: AppTheme;
  startWithSystem: boolean;
}

export interface NetworkInfo {
  deviceId: string;
  deviceName: string;
  serverPort: number;
  certFingerprint: string;
  addresses: { interface: string; address: string; netmask: string }[];
  hosts: string[];
  isServerRunning: boolean;
  activeClientCount: number;
}

export interface PairingSessionData {
  payload: QRPairPayload;
  qrDataUrl: string;
  expiresAt: number;
}

export interface PendingPairRequest {
  requestId: string;
  deviceId: string;
  deviceName: string;
  verificationCode: string;
  pairToken: string;
  clientSecret: string;
  receivedAt: number;
}

export interface PendingFileOffer {
  id: string;
  deviceId: string;
  deviceName: string;
  name: string;
  size: number;
  mime: string;
  sha256: string;
}
