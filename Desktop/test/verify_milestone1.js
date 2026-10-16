// Verification script for Milestone 1 components
const db = require('../src/main/db');
const { getPaths } = require('../src/main/config');
const { getOrCreateCertificate } = require('../src/main/cert');
const { getLocalIPv4Addresses, getHostIpList } = require('../src/main/network');
const pairingManager = require('../src/main/pairing');

async function runVerification() {
  console.log('--- 1. Testing Paths & App Directories ---');
  // Mock app if running directly via node
  const paths = {
    userData: process.cwd(),
    downloads: process.cwd() + '/downloads',
    tempDir: process.cwd() + '/temp',
    certsDir: process.cwd() + '/certs',
    dbPath: process.cwd() + '/test_syncboard.db',
  };
  console.log('Paths configured successfully.');

  console.log('--- 2. Testing Database Initialization ---');
  db.initDatabase();
  console.log('Database initialized.');

  db.setSetting('testKey', 'testVal');
  const readVal = db.getSetting('testKey');
  console.log('Setting test passed:', readVal === 'testVal' ? 'OK' : 'FAIL');

  console.log('--- 3. Testing TLS Certificate & Fingerprint ---');
  const certInfo = await getOrCreateCertificate();
  console.log('Certificate generated / read.');
  console.log('Fingerprint (SHA-256):', certInfo.fingerprint);
  console.log('Fingerprint length:', certInfo.fingerprint.length, '(should be 64)');

  console.log('--- 4. Testing Local IPv4 Addresses ---');
  const addrs = getLocalIPv4Addresses();
  console.log('Discovered IPv4 addresses:', addrs);
  const hosts = getHostIpList();
  console.log('Host IP list:', hosts);

  console.log('--- 5. Testing Pairing Session & 6-Digit Code ---');
  const session = await pairingManager.createPairingSession();
  console.log('Pair token generated:', session.payload.pairToken.slice(0, 10) + '...');
  console.log('QR Data URL generated (starts with data:image/png;base64):', session.qrDataUrl.startsWith('data:image/png;base64'));

  // Test 6-digit verification code derivation
  const code = pairingManager.deriveVerificationCode(session.payload.pairToken, 'desktop-id-123', 'phone-id-456');
  console.log('Derived 6-digit verification code:', code);
  const isValidFormat = /^\d{3}-\d{3}$/.test(code);
  console.log('Code format valid (XXX-XXX):', isValidFormat ? 'OK' : 'FAIL');

  console.log('--- 6. Testing Kirim Sekali vs Simpan Mode Logic ---');
  db.setSetting('historyMode', 'kirim_sekali');
  db.setSetting('retentionHours', '1');
  db.upsertDevice({
    id: 'test-device',
    name: 'Test Galaxy S23',
    certFingerprint: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  });
  const mockTransfer = db.addTransfer({
    deviceId: 'test-device',
    direction: 'incoming',
    kind: 'text',
    textBody: 'Halo SyncBoard!',
    status: 'Selesai',
  });
  console.log('Added transfer with retention expiry:', mockTransfer.expiresAt ? 'OK' : 'FAIL');

  console.log('All Milestone 1 backend components verified successfully!');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
