let safeStorage = null;
if (process.versions && process.versions.electron) {
  try {
    safeStorage = require('electron').safeStorage;
  } catch (err) {
    safeStorage = null;
  }
}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { getPaths } = require('./config');

class SecureStorage {
  constructor() {
    this.secretsFilePath = null;
    this.cachedSecrets = null;
    this.fallbackKey = null;
  }

  _init() {
    if (this.secretsFilePath) return;
    const paths = getPaths();
    this.secretsFilePath = path.join(paths.userData, 'secrets.enc');
    this._loadSecrets();
  }

  _getFallbackKey() {
    if (this.fallbackKey) return this.fallbackKey;
    // Derive a 256-bit key from machine-specific properties as a fallback
    const seed = `${os.hostname()}-${os.platform()}-${os.arch()}-${process.env.USER || 'syncboard'}`;
    this.fallbackKey = crypto.createHash('sha256').update(seed).digest();
    return this.fallbackKey;
  }

  _encrypt(plainText) {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      return {
        mode: 'safeStorage',
        data: safeStorage.encryptString(plainText).toString('base64'),
      };
    }
    // AES-256-GCM fallback
    const key = this._getFallbackKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag().toString('base64');
    return {
      mode: 'aes-gcm',
      iv: iv.toString('base64'),
      tag,
      data: encrypted,
    };
  }

  _decrypt(entry) {
    if (!entry) return null;
    try {
      if (entry.mode === 'safeStorage' && safeStorage && typeof safeStorage.decryptString === 'function') {
        const buffer = Buffer.from(entry.data, 'base64');
        return safeStorage.decryptString(buffer);
      }
      if (entry.mode === 'aes-gcm') {
        const key = this._getFallbackKey();
        const iv = Buffer.from(entry.iv, 'base64');
        const tag = Buffer.from(entry.tag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(entry.data, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (err) {
      console.error('Failed to decrypt secret:', err.message);
      return null;
    }
    return null;
  }

  _loadSecrets() {
    if (!fs.existsSync(this.secretsFilePath)) {
      this.cachedSecrets = {};
      return;
    }
    try {
      const raw = fs.readFileSync(this.secretsFilePath, 'utf8');
      this.cachedSecrets = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to read secrets file:', err);
      this.cachedSecrets = {};
    }
  }

  _saveSecrets() {
    try {
      fs.writeFileSync(
        this.secretsFilePath,
        JSON.stringify(this.cachedSecrets, null, 2),
        { mode: 0o600 }
      );
    } catch (err) {
      console.error('Failed to write secrets file:', err);
    }
  }

  setDeviceSecret(deviceId, secret) {
    this._init();
    this.cachedSecrets[deviceId] = this._encrypt(secret);
    this._saveSecrets();
  }

  getDeviceSecret(deviceId) {
    this._init();
    const entry = this.cachedSecrets[deviceId];
    if (!entry) return null;
    return this._decrypt(entry);
  }

  removeDeviceSecret(deviceId) {
    this._init();
    if (this.cachedSecrets[deviceId]) {
      delete this.cachedSecrets[deviceId];
      this._saveSecrets();
    }
  }
}

module.exports = new SecureStorage();
