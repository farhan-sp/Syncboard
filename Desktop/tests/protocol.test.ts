import crypto from 'crypto';
import {
  sanitizeFileName,
  deriveVerificationCode,
  resolveUniqueFileName,
} from '../src/shared/validation';
import {
  BINARY_HEADER_ID_SIZE,
  BINARY_HEADER_OFFSET_SIZE,
  BINARY_HEADER_TOTAL_SIZE,
  DEFAULT_CHUNK_SIZE,
} from '../src/shared/constants';

function runUnitTests() {
  console.log('=============================================');
  console.log('   SyncBoard Protocol & Core Unit Tests     ');
  console.log('=============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // --- 1. Filename Sanitization Tests ---
  console.log('--- 1. Testing Filename Sanitization ---');
  assert(
    sanitizeFileName('../../etc/passwd') === 'passwd',
    'Strips directory path traversal'
  );
  assert(
    sanitizeFileName('C:\\Windows\\System32\\cmd.exe') === 'cmd.exe',
    'Strips Windows backslash paths'
  );
  assert(
    sanitizeFileName('CON.txt') === '_CON.txt',
    'Protects Windows reserved name CON'
  );
  assert(
    sanitizeFileName('prn') === '_prn',
    'Protects Windows reserved name PRN (case-insensitive)'
  );
  assert(
    sanitizeFileName('My:Document*<Test>?.pdf') === 'My_Document__Test__.pdf',
    'Replaces illegal Windows characters (<>:"/\\|?*)'
  );
  assert(
    sanitizeFileName('   file.txt   ') === 'file.txt',
    'Trims leading and trailing spaces'
  );
  assert(
    sanitizeFileName('.....') === 'berkas_syncboard',
    'Falls back to default name on dots-only input'
  );

  // --- 2. Auto-Renaming Uniqueness Test ---
  console.log('\n--- 2. Testing Unique Filename Collision Resolution ---');
  const existingFiles = new Set(['laporan.pdf', 'laporan (1).pdf']);
  const fakeFileExists = (p: string) => existingFiles.has(p.replace(/^.*[\\/]/, ''));
  const fakeJoin = (...parts: string[]) => parts.join('/');

  const res1 = resolveUniqueFileName('/downloads', 'laporan.pdf', fakeFileExists, fakeJoin);
  assert(
    res1.finalName === 'laporan (2).pdf',
    'Resolves collision by auto-incrementing to laporan (2).pdf'
  );

  const res2 = resolveUniqueFileName('/downloads', 'baru.txt', fakeFileExists, fakeJoin);
  assert(
    res2.finalName === 'baru.txt',
    'Keeps original filename if no collision exists'
  );

  // --- 3. 6-Digit Verification Code Derivation ---
  console.log('\n--- 3. Testing 6-Digit Verification Code Derivation ---');
  const pairToken = 'dGVzdF9wYWlyX3Rva2VuXzMyX2J5dGVzX2xvbmc';
  const desktopId = '550e8400-e29b-41d4-a716-446655440000';
  const phoneId = 'c8b417e2-4720-410a-b31b-4148e6587441';

  const code1 = deriveVerificationCode(pairToken, desktopId, phoneId);
  const code2 = deriveVerificationCode(pairToken, desktopId, phoneId);

  assert(code1 === code2, 'Derivation is completely deterministic');
  assert(/^\d{3}-\d{3}$/.test(code1), `Code has exact "XXX-XXX" format: ${code1}`);

  const diffCode = deriveVerificationCode(pairToken, desktopId, 'different-phone-id');
  assert(code1 !== diffCode, 'Different device ID produces different verification code');

  // --- 4. Binary Chunk Framing & Reassembly ---
  console.log('\n--- 4. Testing Binary Chunk Framing & SHA-256 Checksum ---');
  // Generate 1 MB of test data
  const originalData = crypto.randomBytes(1024 * 1024);
  const expectedSha256 = crypto.createHash('sha256').update(originalData).digest('hex');

  // Chunk into 256 KB slices with 24-byte headers
  const transferIdBuffer = crypto.randomBytes(BINARY_HEADER_ID_SIZE);
  const chunkSize = DEFAULT_CHUNK_SIZE;
  const chunks: Buffer[] = [];

  for (let offset = 0; offset < originalData.length; offset += chunkSize) {
    const slice = originalData.subarray(offset, Math.min(offset + chunkSize, originalData.length));
    const frame = Buffer.alloc(BINARY_HEADER_TOTAL_SIZE + slice.length);

    // Write 16-byte Transfer ID
    transferIdBuffer.copy(frame, 0);
    // Write 8-byte Big-Endian uint64 Offset
    frame.writeBigUInt64BE(BigInt(offset), BINARY_HEADER_ID_SIZE);
    // Write payload
    slice.copy(frame, BINARY_HEADER_TOTAL_SIZE);

    chunks.push(frame);
  }

  assert(chunks.length === 4, `1 MB correctly split into 4 chunks (chunkSize=${chunkSize})`);

  // Simulate Receiver parsing and reassembly
  const reassembled = Buffer.alloc(originalData.length);
  const incrementalHash = crypto.createHash('sha256');

  for (const chunkFrame of chunks) {
    const rxTransferId = chunkFrame.subarray(0, BINARY_HEADER_ID_SIZE);
    assert(
      rxTransferId.equals(transferIdBuffer),
      'Parsed chunk Transfer ID matches header'
    );

    const rxOffset = Number(chunkFrame.readBigUInt64BE(BINARY_HEADER_ID_SIZE));
    const payload = chunkFrame.subarray(BINARY_HEADER_TOTAL_SIZE);

    payload.copy(reassembled, rxOffset);
    incrementalHash.update(payload);
  }

  const actualSha256 = incrementalHash.digest('hex');
  assert(
    actualSha256 === expectedSha256,
    `Incremental SHA-256 matches original payload hash (${actualSha256.slice(0, 16)}...)`
  );
  assert(
    reassembled.equals(originalData),
    'Reassembled binary data is byte-identical to original'
  );

  // --- Final Summary ---
  console.log('\n=============================================');
  console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests();
