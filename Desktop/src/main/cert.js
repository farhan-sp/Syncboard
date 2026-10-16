const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const selfsigned = require('selfsigned');
const { getPaths } = require('./config');

function extractDerFromPem(pemCert) {
  const base64 = pemCert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

function computeCertFingerprint(pemCert) {
  const der = extractDerFromPem(pemCert);
  return crypto.createHash('sha256').update(der).digest('hex').toLowerCase();
}

let cachedCert = null;

function getCachedCertificate() {
  if (cachedCert) return cachedCert;
  const paths = getPaths();
  const certPath = path.join(paths.certsDir, 'cert.pem');
  const keyPath = path.join(paths.certsDir, 'key.pem');
  const fpPath = path.join(paths.certsDir, 'fingerprint.txt');

  if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(fpPath)) {
    try {
      const cert = fs.readFileSync(certPath, 'utf8');
      const key = fs.readFileSync(keyPath, 'utf8');
      const fingerprint = fs.readFileSync(fpPath, 'utf8').trim();
      cachedCert = { cert, key, fingerprint };
      return cachedCert;
    } catch (err) {
      console.warn('Failed to read existing certificate, regenerating:', err.message);
    }
  }
  return null;
}

async function getOrCreateCertificate() {
  const existing = getCachedCertificate();
  if (existing) return existing;

  const paths = getPaths();
  const certPath = path.join(paths.certsDir, 'cert.pem');
  const keyPath = path.join(paths.certsDir, 'key.pem');
  const fpPath = path.join(paths.certsDir, 'fingerprint.txt');

  // Generate self-signed certificate (valid for 10 years)
  console.log('Generating self-signed TLS certificate for SyncBoard...');
  const attrs = [
    { name: 'commonName', value: 'SyncBoard Desktop' },
    { name: 'organizationName', value: 'SyncBoard Local P2P' },
    { shortName: 'OU', value: 'Desktop Server' },
  ];

  const pems = await selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256',
  });

  const cert = pems.cert;
  const key = pems.private;
  const fingerprint = computeCertFingerprint(cert);

  if (!fs.existsSync(paths.certsDir)) {
    fs.mkdirSync(paths.certsDir, { recursive: true });
  }

  fs.writeFileSync(certPath, cert, { mode: 0o644 });
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  fs.writeFileSync(fpPath, fingerprint, { mode: 0o644 });

  console.log(`SyncBoard TLS certificate generated. SHA-256 Fingerprint: ${fingerprint}`);

  cachedCert = { cert, key, fingerprint };
  return cachedCert;
}

module.exports = {
  getOrCreateCertificate,
  getCachedCertificate,
  computeCertFingerprint,
  extractDerFromPem,
};
