const crypto = require('crypto');

const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

function sanitizeFileName(rawName) {
  if (!rawName || typeof rawName !== 'string') return 'berkas_syncboard';
  let clean = rawName.replace(/^.*[\\/]/, '');
  clean = clean.replace(/[\x00-\x1F\x7F]/g, '');
  clean = clean.replace(/[<>:"/\\|?*]/g, '_');
  clean = clean.trim().replace(/^\.+|\.+$/g, '');
  const baseNameWithoutExt = clean.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(baseNameWithoutExt)) {
    clean = `_${clean}`;
  }
  if (clean.length === 0) return 'berkas_syncboard';
  return clean;
}

function resolveUniqueFileName(targetDir, fileName, fileExistsFn) {
  const sanitized = sanitizeFileName(fileName);
  let fullPath = `${targetDir}/${sanitized}`;

  if (!fileExistsFn(fullPath)) {
    return { finalName: sanitized, fullPath };
  }

  const lastDotIdx = sanitized.lastIndexOf('.');
  const base = lastDotIdx !== -1 ? sanitized.slice(0, lastDotIdx) : sanitized;
  const ext = lastDotIdx !== -1 ? sanitized.slice(lastDotIdx) : '';

  let counter = 1;
  while (counter < 10000) {
    const candidateName = `${base} (${counter})${ext}`;
    const candidatePath = `${targetDir}/${candidateName}`;
    if (!fileExistsFn(candidatePath)) {
      return { finalName: candidateName, fullPath: candidatePath };
    }
    counter++;
  }

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const fallbackName = `${base}_${randomSuffix}${ext}`;
  return { finalName: fallbackName, fullPath: `${targetDir}/${fallbackName}` };
}

function deriveVerificationCode(pairToken, desktopDeviceId, phoneDeviceId) {
  const raw = `${pairToken}${desktopDeviceId}${phoneDeviceId}`;
  const hash = crypto.createHash('sha256').update(raw, 'utf8').digest();
  const num = hash.readUInt32BE(0) % 1000000;
  const padded = String(num).padStart(6, '0');
  return `${padded.slice(0, 3)}-${padded.slice(3)}`;
}

console.log('=============================================');
console.log('      SyncBoard Protocol & Core Tests        ');
console.log('=============================================\n');

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

// 1. Filename Sanitization Tests
console.log('--- 1. Testing Filename Sanitization ---');
assert(sanitizeFileName('../../etc/passwd') === 'passwd', 'Strips directory traversal');
assert(sanitizeFileName('C:\\Windows\\System32\\cmd.exe') === 'cmd.exe', 'Strips Windows path separators');
assert(sanitizeFileName('CON.txt') === '_CON.txt', 'Protects reserved Windows name CON');
assert(sanitizeFileName('prn') === '_prn', 'Protects reserved Windows name PRN');
assert(sanitizeFileName('My:Document*<Test>?.pdf') === 'My_Document__Test__.pdf', 'Replaces invalid characters');
assert(sanitizeFileName('   file.txt   ') === 'file.txt', 'Trims whitespace');
assert(sanitizeFileName('.....') === 'berkas_syncboard', 'Handles empty/dot input gracefully');

// 2. Collision Resolution Tests
console.log('\n--- 2. Testing Collision Resolution ---');
const existingFiles = new Set(['/downloads/laporan.pdf', '/downloads/laporan (1).pdf']);
const fileExists = (p) => existingFiles.has(p);
const resolved = resolveUniqueFileName('/downloads', 'laporan.pdf', fileExists);
assert(resolved.finalName === 'laporan (2).pdf', 'Auto-renames to laporan (2).pdf on duplicate');
const nonDuplicate = resolveUniqueFileName('/downloads', 'dokumen_baru.pdf', fileExists);
assert(nonDuplicate.finalName === 'dokumen_baru.pdf', 'Preserves original name if no duplicate');

// 3. Verification Code Derivation
console.log('\n--- 3. Testing 6-Digit Verification Code ---');
const code1 = deriveVerificationCode('token123', 'desktopA', 'phoneB');
const code2 = deriveVerificationCode('token123', 'desktopA', 'phoneB');
assert(code1 === code2, 'Deterministic SHA-256 derivation');
assert(/^\d{3}-\d{3}$/.test(code1), `Code has exact 6-digit XXX-XXX format: ${code1}`);

// 4. Binary Chunk Streaming & Reassembly
console.log('\n--- 4. Testing Binary Chunk Streaming & SHA-256 Checksum ---');
const testData = crypto.randomBytes(1024 * 1024); // 1 MB test payload
const originalSha256 = crypto.createHash('sha256').update(testData).digest('hex');

const CHUNK_SIZE = 256 * 1024; // 256 KB
const transferId = crypto.randomBytes(16);
const chunks = [];

for (let offset = 0; offset < testData.length; offset += CHUNK_SIZE) {
  const payload = testData.subarray(offset, Math.min(offset + CHUNK_SIZE, testData.length));
  const frame = Buffer.alloc(24 + payload.length);
  transferId.copy(frame, 0); // 16 bytes transfer ID
  frame.writeBigUInt64BE(BigInt(offset), 16); // 8 bytes offset
  payload.copy(frame, 24);
  chunks.push(frame);
}

assert(chunks.length === 4, '1 MB correctly partitioned into 4 x 256 KB frames');

// Reassembly & Verification
const reassembled = Buffer.alloc(testData.length);
const streamHasher = crypto.createHash('sha256');

for (const chunk of chunks) {
  const rxId = chunk.subarray(0, 16);
  assert(rxId.equals(transferId), 'Chunk frame header contains exact transfer ID');
  const rxOffset = Number(chunk.readBigUInt64BE(16));
  const rxPayload = chunk.subarray(24);
  rxPayload.copy(reassembled, rxOffset);
  streamHasher.update(rxPayload);
}

const reassembledSha256 = streamHasher.digest('hex');
assert(reassembledSha256 === originalSha256, `SHA-256 checksum verified: ${reassembledSha256.slice(0, 16)}...`);
assert(reassembled.equals(testData), 'Reassembled bytes match original binary 100%');

console.log('\n=============================================');
console.log(`Core Protocol Results: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================\n');

if (failed > 0) process.exit(1);

const { fork } = require('child_process');
const path = require('path');

function runSubTest(file) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, file));
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} failed with code ${code}`));
    });
  });
}

(async () => {
  try {
    await runSubTest('m2_server.test.js');
    await runSubTest('m3_text.test.js');
    await runSubTest('m4_files.test.js');
    await runSubTest('m5_history_settings.test.js');
    console.log('\n=============================================');
    console.log('  ALL TEST SUITES COMPLETED SUCCESSFULLY!  ');
    console.log('=============================================\n');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
})();
