const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocket } = require('ws');
const { parse: uuidParse, stringify: uuidStringify } = require('uuid');

// Set test database and directories
const TEST_DIR = path.join(__dirname, '../scratch/m4_test_env');
const TEST_DB = path.join(TEST_DIR, 'test_m4.db');
const TEST_DOWNLOADS = path.join(TEST_DIR, 'downloads');
const TEST_TEMP = path.join(TEST_DIR, 'temp');

if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
fs.mkdirSync(TEST_DOWNLOADS, { recursive: true });
fs.mkdirSync(TEST_TEMP, { recursive: true });
fs.mkdirSync(path.join(TEST_DIR, 'certs'), { recursive: true });

process.env.SYNCBOARD_USER_DATA = TEST_DIR;
process.env.SYNCBOARD_DB_PATH = TEST_DB;
process.env.SYNCBOARD_DOWNLOADS_PATH = TEST_DOWNLOADS;
process.env.SYNCBOARD_TEMP_PATH = TEST_TEMP;

const db = require('../src/main/db');
db.initDatabase();
db.setSetting('downloadDir', TEST_DOWNLOADS);

// Override paths in config
const config = require('../src/main/config');
config.getAppPaths = () => ({
  userData: TEST_DIR,
  downloads: TEST_DOWNLOADS,
  tempDir: TEST_TEMP,
  certsDir: path.join(TEST_DIR, 'certs'),
  dbPath: TEST_DB,
});
config.getPaths = config.getAppPaths;

const { secretManager } = require('../src/main/secrets');
secretManager.init();

const { pairingManager } = require('../src/main/pairing');
const { syncBoardServer } = require('../src/main/server');
const { transferManager } = require('../src/main/transfers');

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

const TEST_PORT = 48627;
const PHONE_DEVICE_ID = 'pixel-fold-' + crypto.randomBytes(4).toString('hex');
const PHONE_SECRET = crypto.randomBytes(32).toString('hex');

function createClient(certFingerprint) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
      rejectUnauthorized: false,
      checkServerIdentity: (_host, cert) => {
        const rawCert = cert.raw;
        const computedSha256 = crypto
          .createHash('sha256')
          .update(rawCert)
          .digest('hex')
          .toLowerCase();

        if (computedSha256 !== certFingerprint.toLowerCase()) {
          throw new Error('TLS Pinning Mismatch');
        }
      },
    });

    ws.on('open', () => resolve(ws));
    ws.on('error', (err) => reject(err));
  });
}

async function authenticateClient(ws, deviceId, secret) {
  return new Promise((resolve, reject) => {
    const nonce = crypto.randomBytes(16).toString('hex');

    const handleMsg = (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(data.toString('utf8'));

      if (msg.type === 'auth.challenge') {
        const signature = crypto
          .createHmac('sha256', secret)
          .update(msg.challenge + nonce, 'utf8')
          .digest('hex');

        ws.send(JSON.stringify({ type: 'auth.response', signature }));
      } else if (msg.type === 'auth.ok') {
        ws.off('message', handleMsg);
        resolve(msg);
      }
    };

    ws.on('message', handleMsg);
    ws.send(JSON.stringify({ type: 'auth.hello', deviceId, nonce }));
  });
}

(async () => {
  try {
    console.log('====================================================');
    console.log('   SyncBoard Milestone 4: File Transfer Test Suite  ');
    console.log('====================================================\n');

    // 1. Start Server & Pre-register device
    console.log('--- 1. Starting Server & Pairing Device ---');
    const { certFingerprint } = await syncBoardServer.start(TEST_PORT);
    db.upsertDevice({
      id: PHONE_DEVICE_ID,
      name: 'Google Pixel Fold',
      certFingerprint: 'dummy-cert',
      status: 'paired',
    });
    secretManager.setDeviceSecret(PHONE_DEVICE_ID, PHONE_SECRET);
    db.setSetting('confirmBeforeReceive', 'false'); // Auto-accept for tests 1-3
    assert(true, 'Test server running and test device registered');

    // 2. Connect and Authenticate Phone Client
    const clientWs = await createClient(certFingerprint);
    await authenticateClient(clientWs, PHONE_DEVICE_ID, PHONE_SECRET);
    assert(true, 'Phone client connected & authenticated over TLS');

    // 3. Test Case 1: Phone Sending File to Desktop (Auto-Accept, Chunks, SHA-256 verification)
    console.log('\n--- 2. Testing Incoming File Transfer (Phone -> Desktop) ---');
    const testFileSize = 600 * 1024; // 600 KB (multi-chunk: 256KB + 256KB + 88KB)
    const testFilePayload = crypto.randomBytes(testFileSize);
    const expectedSha256 = crypto.createHash('sha256').update(testFilePayload).digest('hex');
    const transferId1 = crypto.randomUUID();
    const fileName1 = 'dokumentasi_proyek.pdf';

    const file1DonePromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.done' && msg.id === transferId1) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    const file1AcceptPromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.accept' && msg.id === transferId1) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    // Phone offers file
    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId1,
        name: fileName1,
        size: testFileSize,
        mime: 'application/pdf',
        sha256: expectedSha256,
        chunkSize: 256 * 1024,
      })
    );

    const acceptMsg = await file1AcceptPromise;
    assert(acceptMsg.type === 'file.accept', 'Desktop auto-accepted incoming file offer');

    // Stream 256 KB binary chunks
    const CHUNK_SIZE = 256 * 1024;
    const transferIdBytes1 = Buffer.from(uuidParse(transferId1));

    for (let offset = 0; offset < testFileSize; offset += CHUNK_SIZE) {
      const slice = testFilePayload.subarray(offset, Math.min(offset + CHUNK_SIZE, testFileSize));
      const frame = Buffer.alloc(24 + slice.length);
      transferIdBytes1.copy(frame, 0); // 16 bytes UUID
      frame.writeBigUInt64BE(BigInt(offset), 16); // 8 bytes Offset
      slice.copy(frame, 24); // Payload
      clientWs.send(frame, { binary: true });
    }

    const done1Msg = await file1DonePromise;
    assert(done1Msg.ok === true, 'Desktop verified SHA-256 and responded with file.done { ok: true }');

    const savedFile1Path = path.join(TEST_DOWNLOADS, fileName1);
    assert(fs.existsSync(savedFile1Path), 'File saved to destination downloads directory');
    const savedFile1Bytes = fs.readFileSync(savedFile1Path);
    assert(savedFile1Bytes.equals(testFilePayload), 'Saved file byte-for-byte identical to original');

    const dbTransfer1 = db.getTransfer(transferId1);
    assert(dbTransfer1 && dbTransfer1.status === 'Selesai', 'Database record transitioned to "Selesai"');

    // 4. Test Case 2: Duplicate Filename Collision Handling
    console.log('\n--- 3. Testing Duplicate Filename Collision Handling ---');
    const transferId2 = crypto.randomUUID();
    const testFile2Payload = crypto.randomBytes(100 * 1024);
    const expectedSha256_2 = crypto.createHash('sha256').update(testFile2Payload).digest('hex');

    const file2DonePromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.done' && msg.id === transferId2) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId2,
        name: fileName1, // Exact same name as file 1!
        size: testFile2Payload.length,
        mime: 'application/pdf',
        sha256: expectedSha256_2,
        chunkSize: 256 * 1024,
      })
    );

    // Wait 50ms for accept
    await new Promise((r) => setTimeout(r, 50));

    const transferIdBytes2 = Buffer.from(uuidParse(transferId2));
    const frame2 = Buffer.alloc(24 + testFile2Payload.length);
    transferIdBytes2.copy(frame2, 0);
    frame2.writeBigUInt64BE(BigInt(0), 16);
    testFile2Payload.copy(frame2, 24);
    clientWs.send(frame2, { binary: true });

    await file2DonePromise;
    const expectedCollisionName = 'dokumentasi_proyek (1).pdf';
    const savedCollisionPath = path.join(TEST_DOWNLOADS, expectedCollisionName);
    assert(fs.existsSync(savedCollisionPath), `Auto-renamed duplicate file to "${expectedCollisionName}"`);
    assert(fs.readFileSync(savedCollisionPath).equals(testFile2Payload), 'Collision file preserved intact');

    // 5. Test Case 3: Checksum Corruption / Integrity Mismatch Handling
    console.log('\n--- 4. Testing Checksum Corruption Detection & Cleanup ---');
    const transferId3 = crypto.randomUUID();
    const testFile3Payload = crypto.randomBytes(50 * 1024);
    const bogusSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    const file3DonePromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.done' && msg.id === transferId3) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId3,
        name: 'berkas_rusak.zip',
        size: testFile3Payload.length,
        mime: 'application/zip',
        sha256: bogusSha256,
        chunkSize: 256 * 1024,
      })
    );

    await new Promise((r) => setTimeout(r, 50));

    const transferIdBytes3 = Buffer.from(uuidParse(transferId3));
    const frame3 = Buffer.alloc(24 + testFile3Payload.length);
    transferIdBytes3.copy(frame3, 0);
    frame3.writeBigUInt64BE(BigInt(0), 16);
    testFile3Payload.copy(frame3, 24);
    clientWs.send(frame3, { binary: true });

    const done3Msg = await file3DonePromise;
    assert(done3Msg.ok === false, 'Desktop rejected corrupted file with ok: false');
    assert(done3Msg.reason && done3Msg.reason.includes('Hash SHA-256 tidak cocok'), 'Reason mentions SHA-256 integrity failure');

    const temp3Path = path.join(TEST_TEMP, `${transferId3}.tmp`);
    assert(!fs.existsSync(temp3Path), 'Temporary file (.tmp) was deleted immediately upon checksum mismatch');
    const dbTransfer3 = db.getTransfer(transferId3);
    assert(dbTransfer3 && dbTransfer3.status === 'Gagal', 'Transfer status marked as "Gagal"');

    // 6. Test Case 4: Approval Flow (confirmBeforeReceive: true)
    console.log('\n--- 5. Testing Approval Flow (Izinkan vs Tolak) ---');
    db.setSetting('confirmBeforeReceive', 'true');

    // 4a. User rejects offer
    const transferId4a = crypto.randomUUID();
    const rejectPromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.reject' && msg.id === transferId4a) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId4a,
        name: 'laporan_ditolak.docx',
        size: 12345,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      })
    );

    await new Promise((r) => setTimeout(r, 50));
    // Simulate user clicking "Tolak" in desktop UI
    transferManager.respondPendingOffer(transferId4a, false);

    const rejectMsg = await rejectPromise;
    assert(rejectMsg.type === 'file.reject', 'Received file.reject after desktop user clicked Tolak');
    const dbTransfer4a = db.getTransfer(transferId4a);
    assert(dbTransfer4a && dbTransfer4a.status === 'Dibatalkan', 'Rejected transfer marked as "Dibatalkan"');

    // 4b. User accepts offer
    const transferId4b = crypto.randomUUID();
    const testFile4bPayload = crypto.randomBytes(30 * 1024);
    const sha4b = crypto.createHash('sha256').update(testFile4bPayload).digest('hex');

    const accept4bPromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.accept' && msg.id === transferId4b) {
          clientWs.off('message', onMsg);
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId4b,
        name: 'laporan_diterima.docx',
        size: testFile4bPayload.length,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sha256: sha4b,
      })
    );

    await new Promise((r) => setTimeout(r, 50));
    // Simulate user clicking "Izinkan" in desktop UI modal
    transferManager.respondPendingOffer(transferId4b, true);

    const accept4bMsg = await accept4bPromise;
    assert(accept4bMsg.type === 'file.accept', 'Received file.accept after desktop user clicked Izinkan');

    // Send chunks
    const transferIdBytes4b = Buffer.from(uuidParse(transferId4b));
    const frame4b = Buffer.alloc(24 + testFile4bPayload.length);
    transferIdBytes4b.copy(frame4b, 0);
    frame4b.writeBigUInt64BE(BigInt(0), 16);
    testFile4bPayload.copy(frame4b, 24);
    clientWs.send(frame4b, { binary: true });

    await new Promise((r) => setTimeout(r, 100));
    const dbTransfer4b = db.getTransfer(transferId4b);
    assert(dbTransfer4b && dbTransfer4b.status === 'Selesai', 'Accepted transfer successfully completed and verified');

    // 7. Test Case 5: Transfer Cancel Handling
    console.log('\n--- 6. Testing Transfer Cancellation ---');
    const transferId5 = crypto.randomUUID();
    clientWs.send(
      JSON.stringify({
        type: 'file.offer',
        id: transferId5,
        name: 'berkas_dibatalkan.iso',
        size: 500000,
        mime: 'application/octet-stream',
        sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      })
    );
    await new Promise((r) => setTimeout(r, 50));
    transferManager.respondPendingOffer(transferId5, true); // accept
    await new Promise((r) => setTimeout(r, 50));

    // Cancel while in progress
    transferManager.cancelTransfer(transferId5);
    const temp5Path = path.join(TEST_TEMP, `${transferId5}.tmp`);
    assert(!fs.existsSync(temp5Path), 'Temp file cleaned up immediately upon cancelTransfer()');
    const dbTransfer5 = db.getTransfer(transferId5);
    assert(dbTransfer5 && dbTransfer5.status === 'Dibatalkan', 'Status transitioned to "Dibatalkan"');

    // 8. Test Case 6: Desktop Sending File to Phone (Outgoing)
    console.log('\n--- 7. Testing Desktop Sending File to Phone (Outgoing) ---');
    const outgoingLocalFile = path.join(TEST_DIR, 'catatan_rahasia.txt');
    const outgoingContent = 'SyncBoard local P2P file transfer test content with UTF-8: 🚀 Halo Ponsel!';
    fs.writeFileSync(outgoingLocalFile, outgoingContent, 'utf8');

    const phoneOfferReceivedPromise = new Promise((resolve) => {
      const onMsg = (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString('utf8'));
        if (msg.type === 'file.offer') {
          resolve(msg);
        }
      };
      clientWs.on('message', onMsg);
    });

    // Start outgoing send from desktop
    const sendPromise = syncBoardServer.sendFile(outgoingLocalFile, PHONE_DEVICE_ID);

    const receivedOffer = await phoneOfferReceivedPromise;
    assert(receivedOffer.name === 'catatan_rahasia.txt', 'Phone received file.offer with correct filename');
    assert(receivedOffer.size === Buffer.byteLength(outgoingContent), 'Phone received file.offer with correct size');

    // Phone accepts offer and prepares to receive binary chunks
    const receivedChunks = [];
    const phoneChunkPromise = new Promise((resolve) => {
      const onChunk = (data, isBinary) => {
        if (!isBinary) return;
        const buf = Buffer.from(data);
        const chunkId = uuidStringify(buf.subarray(0, 16));
        if (chunkId === receivedOffer.id) {
          const chunkOffset = Number(buf.readBigUInt64BE(16));
          const chunkPayload = buf.subarray(24);
          receivedChunks.push({ offset: chunkOffset, payload: chunkPayload });
          clientWs.off('message', onChunk);
          resolve();
        }
      };
      clientWs.on('message', onChunk);
    });

    clientWs.send(JSON.stringify({ type: 'file.accept', id: receivedOffer.id }));
    await phoneChunkPromise;

    assert(receivedChunks.length > 0, 'Phone received binary chunk frame from Desktop');
    const receivedText = receivedChunks[0].payload.toString('utf8');
    assert(receivedText === outgoingContent, 'Phone received exact file content from binary frame');

    // Phone confirms file.done { ok: true }
    clientWs.send(JSON.stringify({ type: 'file.done', id: receivedOffer.id, ok: true }));
    await new Promise((r) => setTimeout(r, 100));

    const outgoingDbRecord = db.getTransfer(receivedOffer.id);
    assert(outgoingDbRecord && outgoingDbRecord.status === 'Selesai', 'Outgoing transfer transitioned to "Selesai" upon file.done OK');

    // Clean up
    clientWs.close();
    await syncBoardServer.stop();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });

    console.log('\n====================================================');
    console.log(`M4 Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('M4 Test Suite failed with unexpected error:', err);
    process.exit(1);
  }
})();
