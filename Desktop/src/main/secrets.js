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
const { getAppPaths } = require('./config');

class SecretManager {
  constructor() {
    this.secretsPath = null;
    this.cachedSecrets = {};
    this.perInstallKey = null;
    this.warningMessage = null;
  }

  init() {
    if (this.secretsPath) return;
    const paths = getAppPaths();
    this.secretsPath = path.join(paths.userData, 'secrets.enc');
    this.initPerInstallKey(paths.userData);
    this.checkSafeStorageAvailability();
    this.loadSecrets();
  }

  initPerInstallKey(userDataDir) {
    const keyPath = path.join(userDataDir, 'install_key.bin');
    if (fs.existsSync(keyPath)) {
      try {
        this.perInstallKey = fs.readFileSync(keyPath);
      } catch (err) {
        console.error('Failed to read install key:', err);
      }
    }

    if (!this.perInstallKey || this.perInstallKey.length !== 32) {
      this.perInstallKey = crypto.randomBytes(32);
      try {
        fs.writeFileSync(keyPath, this.perInstallKey, { mode: 0o600 });
      } catch (err) {
        console.error('Failed to save install key:', err);
      }
    }
  }

  checkSafeStorageAvailability() {
    const isAvailable = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
    if (process.platform === 'linux' && !isAvailable) {
      this.warningMessage =
        'Peringatan Keamanan: Layanan penyimpanan kunci rahasia Linux (Secret Service / KWallet) tidak terdeteksi. Rahasia perangkat diamankan menggunakan enkripsi file (AES-256-GCM) dengan kunci instalasi lokal.';
      console.warn(`[SyncBoard Security] ${this.warningMessage}`);
    } else {
      this.warningMessage = null;
    }
  }

  getWarningMessage() {
    return this.warningMessage;
  }

  encrypt(plainText) {
    const isAvailable = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
    if (isAvailable && safeStorage.encryptString) {
      return {
        mode: 'safeStorage',
        data: safeStorage.encryptString(plainText).toString('base64'),
      };
    }

    // AES-256-GCM fallback with per-install key
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.perInstallKey, iv);
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

  decrypt(entry) {
    if (!entry) return null;
    try {
      if (entry.mode === 'safeStorage' && safeStorage && typeof safeStorage.decryptString === 'function') {
        const buffer = Buffer.from(entry.data, 'base64');
        return safeStorage.decryptString(buffer);
      }

      if (entry.mode === 'aes-gcm') {
        const iv = Buffer.from(entry.iv, 'base64');
        const tag = Buffer.from(entry.tag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', this.perInstallKey, iv);
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

  loadSecrets() {
    if (!this.secretsPath || !fs.existsSync(this.secretsPath)) {
      this.cachedSecrets = {};
      return;
    }
    try {
      const raw = fs.readFileSync(this.secretsPath, 'utf8');
      this.cachedSecrets = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load secrets:', err);
      this.cachedSecrets = {};
    }
  }

  saveSecrets() {
    if (!this.secretsPath) return;
    try {
      fs.writeFileSync(this.secretsPath, JSON.stringify(this.cachedSecrets, null, 2), {
        mode: 0o600,
      });
    } catch (err) {
      console.error('Failed to save secrets file:', err);
    }
  }

  setDeviceSecret(deviceId, secret) {
    this.init();
    this.cachedSecrets[deviceId] = this.encrypt(secret);
    this.saveSecrets();
  }

  getDeviceSecret(deviceId) {
    this.init();
    return this.decrypt(this.cachedSecrets[deviceId]);
  }

  removeDeviceSecret(deviceId) {
    this.init();
    if (this.cachedSecrets[deviceId]) {
      delete this.cachedSecrets[deviceId];
      this.saveSecrets();
    }
  }
}

const secretManager = new SecretManager();
module.exports = {
  secretManager,
  SecretManager,
};
