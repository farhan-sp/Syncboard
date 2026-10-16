import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const selfsigned = require('selfsigned');
import { getAppPaths } from './config';

export function extractDerFromPem(pemCert: string): Buffer {
  const base64 = pemCert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

export function computeCertFingerprint(pemCert: string): string {
  const der = extractDerFromPem(pemCert);
  return crypto.createHash('sha256').update(der).digest('hex').toLowerCase();
}

let cachedCert: { cert: string; key: string; fingerprint: string } | null = null;

export function getCachedCertificate() {
  if (cachedCert) return cachedCert;
  const paths = getAppPaths();
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
    } catch (err: any) {
      console.warn('Failed to read existing certificate, regenerating:', err.message);
    }
  }
  return null;
}

export async function getOrCreateCertificate(): Promise<{
  cert: string;
  key: string;
  fingerprint: string;
}> {
  const existing = getCachedCertificate();
  if (existing) return existing;

  const paths = getAppPaths();
  const certPath = path.join(paths.certsDir, 'cert.pem');
  const keyPath = path.join(paths.certsDir, 'key.pem');
  const fpPath = path.join(paths.certsDir, 'fingerprint.txt');

  console.log('[SyncBoard] Generating self-signed TLS certificate (10 years validity)...');
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

  console.log(`[SyncBoard] TLS Certificate ready. SHA-256 Fingerprint: ${fingerprint}`);

  cachedCert = { cert, key, fingerprint };
  return cachedCert;
}
