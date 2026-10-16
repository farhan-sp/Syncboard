const crypto = require('crypto');
const QRCode = require('qrcode');
const { getHostIpList } = require('./network');
const { getSetting } = require('./db');
const { getOrCreateCertificate } = require('./cert');

class PairingManager {
  constructor() {
    // Map of active tokens: pairToken -> { expiresAt, used: boolean }
    this.activeTokens = new Map();
  }

  generatePairToken() {
    return crypto.randomBytes(32).toString('base64url');
  }

  deriveVerificationCode(pairToken, desktopDeviceId, phoneDeviceId) {
    const raw = `${pairToken}${desktopDeviceId}${phoneDeviceId}`;
    const hash = crypto.createHash('sha256').update(raw, 'utf8').digest();
    const num = hash.readUInt32BE(0) % 1000000;
    const str = String(num).padStart(6, '0');
    return `${str.slice(0, 3)}-${str.slice(3)}`;
  }

  async createPairingSession() {
    // Clean up expired tokens
    const now = Date.now();
    for (const [tok, data] of this.activeTokens.entries()) {
      if (data.expiresAt <= now) {
        this.activeTokens.delete(tok);
      }
    }

    const pairToken = this.generatePairToken();
    const expiresAt = now + 2 * 60 * 1000; // 2 minutes

    this.activeTokens.set(pairToken, {
      expiresAt,
      used: false,
    });

    const certInfo = await getOrCreateCertificate();
    const deviceId = getSetting('deviceId');
    const deviceName = getSetting('deviceName');
    const port = parseInt(getSetting('serverPort', '48620'), 10);
    const hosts = getHostIpList();

    const payload = {
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

  validateToken(pairToken) {
    const session = this.activeTokens.get(pairToken);
    if (!session) {
      return { valid: false, reason: 'Token tidak ditemukan' };
    }
    if (session.used) {
      return { valid: false, reason: 'Token sudah pernah digunakan' };
    }
    if (Date.now() > session.expiresAt) {
      this.activeTokens.delete(pairToken);
      return { valid: false, reason: 'Token sudah kedaluwarsa (lebih dari 2 menit)' };
    }
    // Mark as used
    session.used = true;
    return { valid: true };
  }

  getVerificationCode(pairToken, phoneDeviceId) {
    const desktopDeviceId = getSetting('deviceId') || '';
    return this.deriveVerificationCode(pairToken, desktopDeviceId, phoneDeviceId);
  }
}

const pairingManager = new PairingManager();
module.exports = pairingManager;
module.exports.pairingManager = pairingManager;
module.exports.PairingManager = PairingManager;
