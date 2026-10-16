const crypto = require('crypto');
const WebSocket = require('ws');

const db = require('../src/main/db');
const { secretManager } = require('../src/main/secrets');
const { syncBoardServer } = require('../src/main/server');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runM3Tests() {
  console.log('====================================================');
  console.log('   SyncBoard Milestone 3: Two-Way Text & Ack Tests  ');
  console.log('====================================================\n');

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

  // 1. Initialize and start server on test port 48626
  db.initDatabase();
  secretManager.init();

  const TEST_PORT = 48626;
  console.log('--- 1. Starting Test Server ---');
  await syncBoardServer.start(TEST_PORT);

  // Register a paired test phone device
  const phoneDeviceId = 'pixel-8-pro-' + crypto.randomBytes(4).toString('hex');
  const phoneClientSecret = crypto.randomBytes(32).toString('hex');
  const phoneName = 'Google Pixel 8 Pro';

  secretManager.setDeviceSecret(phoneDeviceId, phoneClientSecret);
  db.upsertDevice({
    id: phoneDeviceId,
    name: phoneName,
    certFingerprint: 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
    status: 'paired',
  });

  // 2. Connect phone and complete reconnect auth
  console.log('--- 2. Connecting Client & Performing Auth Handshake ---');
  const phoneWs = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
    rejectUnauthorized: false,
  });

  const clientNonce = crypto.randomBytes(16).toString('hex');

  await new Promise((resolve) => {
    phoneWs.on('open', () => {
      phoneWs.send(
        JSON.stringify({
          type: 'auth.hello',
          deviceId: phoneDeviceId,
          nonce: clientNonce,
        })
      );
    });

    phoneWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'auth.challenge') {
        const signature = crypto
          .createHmac('sha256', phoneClientSecret)
          .update(`${msg.challenge}${clientNonce}`, 'utf8')
          .digest('hex');

        phoneWs.send(
          JSON.stringify({
            type: 'auth.response',
            signature,
          })
        );
      } else if (msg.type === 'auth.ok') {
        resolve();
      }
    });
  });

  assert(true, 'Phone client connected and authenticated');

  // 3. Test Desktop sending text to Phone
  console.log('\n--- 3. Testing Desktop Sending Text to Phone ---');
  const messageToSend = 'Halo dari SyncBoard Desktop! Jaringan Wi-Fi lokal bekerja optimal.';

  // Phone listens for incoming text.send and replies with text.ack
  const phoneReceivedPromise = new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'text.send') {
        // Send back text.ack immediately
        phoneWs.send(JSON.stringify({ type: 'text.ack', id: msg.id }));
        phoneWs.off('message', handler);
        resolve(msg);
      }
    };
    phoneWs.on('message', handler);
  });

  const outgoingTransfer = await syncBoardServer.sendTextMessage(phoneDeviceId, messageToSend, 'text');
  assert(outgoingTransfer && outgoingTransfer.id, 'Created outgoing transfer record');
  assert(outgoingTransfer.direction === 'outgoing', 'Direction is outgoing');

  const receivedOnPhone = await phoneReceivedPromise;
  assert(receivedOnPhone.body === messageToSend, 'Phone received exact message body');
  assert(receivedOnPhone.kind === 'text', 'Kind is text');
  assert(receivedOnPhone.id === outgoingTransfer.id, 'Transfer IDs match');

  // Wait briefly for server to process the text.ack
  await sleep(150);

  const updatedTransfer = db.getTransfer(outgoingTransfer.id);
  assert(updatedTransfer.status === 'Selesai', 'Transfer status transitioned to "Selesai" upon text.ack');

  // 4. Test Phone sending text to Desktop (Byte-Identical UTF-8 Integrity)
  console.log('\n--- 4. Testing Phone Sending Text to Desktop (Byte-Identical UTF-8) ---');
  // Raw string with spaces, newlines, emojis, special characters (MUST NOT BE TRIMMED)
  const rawTestBody = '   \n\n🚀 Halo SyncBoard! Ini teks dengan spasi depan & belakang   \n\tBaris tabulasi khusus   ';
  const incomingId = crypto.randomUUID();

  // Listen for text.ack on phone
  const ackReceivedPromise = new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'text.ack' && msg.id === incomingId) {
        phoneWs.off('message', handler);
        resolve(msg);
      }
    };
    phoneWs.on('message', handler);
  });

  // Phone sends text.send
  phoneWs.send(
    JSON.stringify({
      type: 'text.send',
      id: incomingId,
      kind: 'text',
      body: rawTestBody,
      ts: Date.now(),
    })
  );

  const ack = await ackReceivedPromise;
  assert(ack && ack.id === incomingId, 'Phone received text.ack from Desktop server');

  const incomingTransfer = db.getTransfer(incomingId);
  assert(incomingTransfer !== null, 'Incoming transfer stored in SQLite');
  assert(incomingTransfer.direction === 'incoming', 'Direction is incoming');
  assert(incomingTransfer.status === 'Selesai', 'Status is Selesai');
  assert(
    incomingTransfer.textBody === rawTestBody,
    'Text received is 100% byte-identical to text sent (no trimming, UTF-8 preserved)'
  );

  // 5. Test Sending Links (kind: "link")
  console.log('\n--- 5. Testing Sending Web Link (kind: "link") ---');
  const linkUrl = 'https://github.com/google/syncboard?ref=local_wifi';

  const phoneLinkPromise = new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'text.send' && msg.kind === 'link') {
        phoneWs.send(JSON.stringify({ type: 'text.ack', id: msg.id }));
        phoneWs.off('message', handler);
        resolve(msg);
      }
    };
    phoneWs.on('message', handler);
  });

  const linkTransfer = await syncBoardServer.sendTextMessage(phoneDeviceId, linkUrl, 'link');
  assert(linkTransfer.kind === 'link', 'Outgoing transfer kind is "link"');

  const phoneLink = await phoneLinkPromise;
  assert(phoneLink.body === linkUrl, 'Phone received URL link');
  assert(phoneLink.kind === 'link', 'Phone received kind: "link"');

  // 6. Test Retry Transfer
  console.log('\n--- 6. Testing Retry Transfer ---');
  // Create a simulated failed transfer
  const failedTransfer = db.addTransfer({
    deviceId: phoneDeviceId,
    direction: 'outgoing',
    kind: 'text',
    textBody: 'Pesan coba lagi',
    status: 'Gagal',
  });

  const retryPromise = new Promise((resolve) => {
    const handler = (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'text.send' && msg.body === 'Pesan coba lagi') {
        phoneWs.send(JSON.stringify({ type: 'text.ack', id: msg.id }));
        phoneWs.off('message', handler);
        resolve(msg);
      }
    };
    phoneWs.on('message', handler);
  });

  const retried = await syncBoardServer.retryTransfer(failedTransfer.id);
  assert(retried && retried.status === 'Mengirim', 'Retried transfer launched with status "Mengirim"');

  const receivedRetry = await retryPromise;
  assert(receivedRetry.body === 'Pesan coba lagi', 'Phone received retried message');

  // 7. Test "Kirim Sekali" Expiry Calculation
  console.log('\n--- 7. Testing "Kirim Sekali" Retention Mode ---');
  db.setSetting('historyMode', 'kirim_sekali');
  db.setSetting('retentionHours', '24');

  const ephemeralTransfer = db.addTransfer({
    deviceId: phoneDeviceId,
    direction: 'incoming',
    kind: 'text',
    textBody: 'Pesan sementara',
    status: 'Selesai',
  });

  const expectedExpiry = ephemeralTransfer.createdAt + 24 * 3600 * 1000;
  assert(
    Math.abs(ephemeralTransfer.expiresAt - expectedExpiry) < 1000,
    'Calculated retention expiresAt for 24 hours correctly'
  );

  // Restore historyMode to simpan
  db.setSetting('historyMode', 'simpan');

  // Clean up
  phoneWs.close();
  await syncBoardServer.stop();
  db.removeDevice(phoneDeviceId);
  secretManager.removeDeviceSecret(phoneDeviceId);

  console.log('\n====================================================');
  console.log(`M3 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runM3Tests().catch((err) => {
  console.error('M3 Tests error:', err);
  process.exit(1);
});
