import crypto from 'crypto';
const QRCode = require('qrcode');
import { getHostIpList } from './network';
import { getSetting } from './db';
import { getOrCreateCertificate } from './cert';
import { deriveVerificationCode } from '../shared/validation';
import { PAIRING_EXPIRY_MS } from '../shared/constants';
import { PairingSessionData, QRPairPayload } from '../shared/types';

class PairingManager {
  private activeTokens: Map<string, { expiresAt: number; used: boolean }> = new Map();

  generatePairToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  async createPairingSession(): Promise<PairingSessionData> {
    // Purge expired tokens
    const now = Date.now();
    for (const [tok, data] of this.activeTokens.entries()) {
      if (data.expiresAt <= now) {
        this.activeTokens.delete(tok);
      }
    }

    const pairToken = this.generatePairToken();
    const expiresAt = now + PAIRING_EXPIRY_MS;

    this.activeTokens.set(pairToken, {
      expiresAt,
      used: false,
    });

    const certInfo = await getOrCreateCertificate();
    const deviceId = getSetting('deviceId') || '';
    const deviceName = getSetting('deviceName') || 'SyncBoard Desktop';
    const port = parseInt(getSetting('serverPort', '48620') || '48620', 10);
    const hosts = getHostIpList();

    const payload: QRPairPayload = {
      v: 1,
      deviceId,
      deviceName,
      hosts,
      port,
      certFingerprint: certInfo.fingerprint,
      pairToken,
      expiresAt,
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return {
      payload,
      qrDataUrl,
      expiresAt,
    };
  }

  validateToken(pairToken: string): { valid: boolean; reason?: string } {
    const session = this.activeTokens.get(pairToken);
    if (!session) {
      return { valid: false, reason: 'Token tidak ditemukan atau tidak valid' };
    }
    if (session.used) {
      return { valid: false, reason: 'Token pasangan sudah pernah digunakan' };
    }
    if (Date.now() > session.expiresAt) {
      this.activeTokens.delete(pairToken);
      return { valid: false, reason: 'Token pasangan sudah kedaluwarsa (lebih dari 2 menit)' };
    }

    // Mark token as single-use consumed
    session.used = true;
    return { valid: true };
  }

  getVerificationCode(pairToken: string, phoneDeviceId: string): string {
    const desktopDeviceId = getSetting('deviceId') || '';
    return deriveVerificationCode(pairToken, desktopDeviceId, phoneDeviceId);
  }
}

export const pairingManager = new PairingManager();
