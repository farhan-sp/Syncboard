const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Set test environment
const TEST_DIR = path.join(__dirname, '../scratch/m5_test_env');
const TEST_DB = path.join(TEST_DIR, 'test_m5.db');
const TEST_DOWNLOADS = path.join(TEST_DIR, 'downloads');
const TEST_TEMP = path.join(TEST_DIR, 'temp');

if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(TEST_DOWNLOADS, { recursive: true });
fs.mkdirSync(TEST_TEMP, { recursive: true });

process.env.SYNCBOARD_USER_DATA = TEST_DIR;
process.env.SYNCBOARD_DB_PATH = TEST_DB;
process.env.SYNCBOARD_DOWNLOADS_PATH = TEST_DOWNLOADS;
process.env.SYNCBOARD_TEMP_PATH = TEST_TEMP;

const db = require('../src/main/db');
db.initDatabase();

const { getPlatformTroubleshootingInfo } = require('../src/main/network');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

console.log('====================================================');
console.log('  SyncBoard Milestone 5: History & Settings Tests   ');
console.log('====================================================\n');

// 1. Testing Settings Persistence
console.log('--- 1. Testing App Settings Persistence ---');
db.setSetting('deviceName', 'My Custom Desktop');
db.setSetting('serverPort', '48630');
db.setSetting('confirmBeforeReceive', 'false');
db.setSetting('historyMode', 'kirim_sekali');
db.setSetting('retentionHours', '168');
db.setSetting('theme', 'light');

assert(db.getSetting('deviceName') === 'My Custom Desktop', 'Saved and retrieved custom deviceName');
assert(db.getSetting('serverPort') === '48630', 'Saved and retrieved custom serverPort');
assert(db.getSetting('confirmBeforeReceive') === 'false', 'Saved and retrieved confirmBeforeReceive toggle');
assert(db.getSetting('historyMode') === 'kirim_sekali', 'Saved and retrieved historyMode');
assert(db.getSetting('retentionHours') === '168', 'Saved and retrieved retentionHours (7 days)');
assert(db.getSetting('theme') === 'light', 'Saved and retrieved theme setting');

const allSettings = db.getAllSettings();
assert(allSettings.serverPort === 48630, 'getAllSettings parses serverPort as number');
assert(allSettings.confirmBeforeReceive === false, 'getAllSettings parses confirmBeforeReceive as boolean');
assert(allSettings.retentionHours === 168, 'getAllSettings parses retentionHours as number');

// 2. Testing Device Management & Renaming
console.log('\n--- 2. Testing Device Management ---');
const devId = 'phone-dev-' + crypto.randomBytes(4).toString('hex');
db.upsertDevice({
  id: devId,
  name: 'Ponsel Lawas',
  certFingerprint: 'sha256-fingerprint-sample',
  status: 'paired',
});

const dev = db.getDevice(devId);
assert(dev && dev.name === 'Ponsel Lawas', 'Device stored and retrieved');

// Rename device
db.upsertDevice({
  ...dev,
  name: 'Ponsel Baru (Ganti Nama)',
});
const renamedDev = db.getDevice(devId);
assert(renamedDev && renamedDev.name === 'Ponsel Baru (Ganti Nama)', 'Device renamed successfully');

// Update last seen
const beforeSeen = renamedDev.lastSeenAt;
db.updateDeviceLastSeen(devId);
const afterSeen = db.getDevice(devId).lastSeenAt;
assert(afterSeen >= beforeSeen, 'lastSeenAt timestamp updated');

// 3. Testing History Filtering & Search
console.log('\n--- 3. Testing History Filtering & Search ---');
const now = Date.now();
const tText = db.addTransfer({
  deviceId: devId,
  direction: 'outgoing',
  kind: 'text',
  textBody: 'Catatan penting belanja bulanan: Kopi, Gula, Susu',
  status: 'Selesai',
  createdAt: now - 5000,
});

const tLink = db.addTransfer({
  deviceId: devId,
  direction: 'outgoing',
  kind: 'link',
  textBody: 'https://github.com/google/antigravity',
  status: 'Selesai',
  createdAt: now - 4000,
});

const tPhoto = db.addTransfer({
  deviceId: devId,
  direction: 'incoming',
  kind: 'photo',
  fileName: 'liburan_bali_2026.jpg',
  fileSize: 2048000,
  status: 'Selesai',
  createdAt: now - 3000,
});

const tFile = db.addTransfer({
  deviceId: devId,
  direction: 'incoming',
  kind: 'file',
  fileName: 'skripsi_revisi_final.pdf',
  fileSize: 5120000,
  status: 'Selesai',
  createdAt: now - 2000,
});

// Filter tests
const allList = db.getTransfers({ kind: 'all' });
assert(allList.length >= 4, 'kind: "all" returns all transfers');

const textList = db.getTransfers({ kind: 'text' });
assert(textList.some((t) => t.id === tText.id) && !textList.some((t) => t.id === tPhoto.id), 'kind: "text" filters only text items');

const linkList = db.getTransfers({ kind: 'link' });
assert(linkList.some((t) => t.id === tLink.id), 'kind: "link" filters URL link items');

const photoList = db.getTransfers({ kind: 'photo' });
assert(photoList.some((t) => t.id === tPhoto.id), 'kind: "photo" filters photo items');

const fileList = db.getTransfers({ kind: 'file' });
assert(fileList.some((t) => t.id === tFile.id), 'kind: "file" filters document files');

// Search query tests
const searchKopi = db.getTransfers({ search: 'belanja' });
assert(searchKopi.some((t) => t.id === tText.id), 'Search matches text body substring ("belanja")');

const searchBali = db.getTransfers({ search: 'bali_2026' });
assert(searchBali.some((t) => t.id === tPhoto.id), 'Search matches file name substring ("bali_2026")');

const searchDevice = db.getTransfers({ search: 'Ganti Nama' });
assert(searchDevice.length >= 4, 'Search matches device name substring');

// 4. Testing Pinning & Top Ordering
console.log('\n--- 4. Testing Pinning & Ordering ---');
// Pin the older text transfer
db.pinTransfer(tText.id, 1);
const pinnedTransfer = db.getTransfer(tText.id);
assert(pinnedTransfer && pinnedTransfer.pinned === 1, 'Transfer pinned successfully');

// When fetching transfers, pinned transfers must appear first (ORDER BY pinned DESC, createdAt DESC)
const orderedList = db.getTransfers();
assert(orderedList[0].id === tText.id, 'Pinned transfer is ranked #1 at top of list');

// Filter by pinned
const pinnedOnly = db.getTransfers({ kind: 'pinned' });
assert(pinnedOnly.length === 1 && pinnedOnly[0].id === tText.id, 'kind: "pinned" returns only pinned transfers');

// Unpin
db.pinTransfer(tText.id, 0);
const unpinned = db.getTransfer(tText.id);
assert(unpinned && unpinned.pinned === 0, 'Transfer unpinned successfully');

// 5. Testing Ephemeral Retention Cleanup ("Kirim Sekali")
console.log('\n--- 5. Testing Ephemeral Retention Cleanup ("Kirim Sekali") ---');
db.setSetting('historyMode', 'kirim_sekali');

// 5a. Expired unpinned transfer (must be deleted)
const tExpiredUnpinned = db.addTransfer({
  deviceId: devId,
  direction: 'outgoing',
  kind: 'text',
  textBody: 'Pesan rahasia sudah kadaluwarsa',
  status: 'Selesai',
  pinned: 0,
  createdAt: now - 100000,
  expiresAt: now - 1000, // Expired in the past!
});

// 5b. Expired PINNED transfer (must NEVER be deleted!)
const tExpiredPinned = db.addTransfer({
  deviceId: devId,
  direction: 'outgoing',
  kind: 'text',
  textBody: 'Pesan penting yang disematkan (tidak boleh terhapus)',
  status: 'Selesai',
  pinned: 1, // PINNED!
  createdAt: now - 100000,
  expiresAt: now - 1000, // Expired in the past, but pinned
});

// 5c. Non-expired unpinned transfer (must NOT be deleted)
const tActiveUnpinned = db.addTransfer({
  deviceId: devId,
  direction: 'outgoing',
  kind: 'text',
  textBody: 'Pesan masih aktif',
  status: 'Selesai',
  pinned: 0,
  createdAt: now,
  expiresAt: now + 3600000, // Expired in 1 hour
});

// Run cleanup
const cleanedCount = db.cleanupExpiredTransfers();
assert(cleanedCount >= 1, `cleanupExpiredTransfers removed ${cleanedCount} expired records`);

assert(db.getTransfer(tExpiredUnpinned.id) === null, 'Expired unpinned transfer was safely deleted');
assert(db.getTransfer(tExpiredPinned.id) !== null, 'Expired PINNED transfer was PRESERVED (protected from retention cleanup)');
assert(db.getTransfer(tActiveUnpinned.id) !== null, 'Active non-expired transfer was preserved');

// 6. Testing Delete Single & Clear All
console.log('\n--- 6. Testing Delete & Clear All ---');
const delSuccess = db.deleteTransfer(tActiveUnpinned.id);
assert(delSuccess === true, 'Single transfer deleted');
assert(db.getTransfer(tActiveUnpinned.id) === null, 'Deleted transfer no longer in database');

const clearSuccess = db.clearAllTransfers();
assert(clearSuccess === true, 'clearAllTransfers executed successfully');
const remaining = db.getTransfers();
assert(remaining.length === 0, 'History table is completely empty after clearAllTransfers()');

// 7. Testing Network Troubleshooting Helper
console.log('\n--- 7. Testing Network Troubleshooting Helper ---');
const info = getPlatformTroubleshootingInfo();
assert(typeof info.os === 'string', `Detected platform OS: ${info.os}`);
assert(typeof info.firewallCmd === 'string' && info.firewallCmd.length > 0, `Firewall command provided: ${info.firewallCmd}`);
assert(Array.isArray(info.tips) && info.tips.length > 0, 'Troubleshooting tips list provided');

// Clean up test environment
fs.rmSync(TEST_DIR, { recursive: true, force: true });

console.log('\n====================================================');
console.log(`M5 Test Results: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================\n');

if (failed > 0) {
  process.exit(1);
}
