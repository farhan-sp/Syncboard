const https = require('https');
const crypto = require('crypto');
const WebSocket = require('ws');

// Import modules
const db = require('../src/main/db');
const { getAppPaths } = require('../src/main/config');
const { getOrCreateCertificate } = require('../src/main/cert');
const { pairingManager } = require('../src/main/pairing');
const { secretManager } = require('../src/main/secrets');
const { syncBoardServer } = require('../src/main/server');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runM2Tests() {
  console.log('====================================================');
  console.log('   SyncBoard Milestone 2: WSS Server & Auth Tests  ');
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

  // 1. Initialize DB and secrets
  db.initDatabase();
  secretManager.init();

  // 2. Start WSS TLS Server on test port 48625
  const TEST_PORT = 48625;
  console.log('--- 1. Testing TLS / WSS Server Startup ---');
  const serverInfo = await syncBoardServer.start(TEST_PORT);
  assert(serverInfo.port === TEST_PORT, `Server listening on port ${TEST_PORT}`);
  assert(
    serverInfo.certFingerprint && serverInfo.certFingerprint.length === 64,
    `Valid 64-character SHA-256 fingerprint: ${serverInfo.certFingerprint.slice(0, 16)}...`
  );

  // 3. Test Certificate Fingerprint Pinning Verification
  console.log('\n--- 2. Testing Certificate Fingerprint Pinning ---');
  const certInfo = await getOrCreateCertificate();

  // Establish TLS socket and read peer certificate DER to compute SHA-256 fingerprint
  const fingerprintVerified = await new Promise((resolve) => {
    const req = https.request(
      `https://127.0.0.1:${TEST_PORT}`,
      {
        rejectUnauthorized: false,
      },
      (res) => {
        const peerCert = res.socket.getPeerCertificate(true);
        const peerDer = peerCert.raw;
        const peerFp = crypto.createHash('sha256').update(peerDer).digest('hex').toLowerCase();
        resolve(peerFp === certInfo.fingerprint);
      }
    );
    req.on('error', (err) => {
      console.error('TLS Pinning check error:', err);
      resolve(false);
    });
    req.end();
  });

  assert(fingerprintVerified, 'Phone client verified TLS certificate fingerprint via SHA-256 pinning');

  // 4. Test QR Pairing Flow
  console.log('\n--- 3. Testing QR Pairing Handshake ---');
  const pairSession = await pairingManager.createPairingSession();
  assert(pairSession.payload.pairToken.length > 20, 'Pair token generated');

  const testPhoneId = 'galaxy-s23-' + crypto.randomBytes(4).toString('hex');
  const testPhoneSecret = crypto.randomBytes(32).toString('hex');
  const testPhoneName = 'Samsung Galaxy S23 Ultra';

  let receivedVerifyCode = null;
  syncBoardServer.setEventCallback((event, data) => {
    if (event === 'event:pair-request') {
      receivedVerifyCode = data.verificationCode;
      // Simulate user clicking "Izinkan"
      setTimeout(() => {
        syncBoardServer.respondPairRequest(data.requestId, true);
      }, 50);
    }
  });

  // Phone connects to WSS
  const pairWs = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
    rejectUnauthorized: false,
  });

  const pairResult = await new Promise((resolve) => {
    pairWs.on('open', () => {
      // Send pair.request
      pairWs.send(
        JSON.stringify({
          type: 'pair.request',
          deviceId: testPhoneId,
          deviceName: testPhoneName,
          pairToken: pairSession.payload.pairToken,
          clientSecret: testPhoneSecret,
        })
      );
    });

    pairWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pair.response') {
        resolve(msg);
      }
    });

    pairWs.on('error', (err) => {
      console.error('Pair WebSocket error:', err);
      resolve({ ok: false, error: err.message });
    });
  });

  assert(pairResult.ok === true, 'Pair response accepted with ok: true');
  assert(
    receivedVerifyCode && /^\d{3}-\d{3}$/.test(receivedVerifyCode),
    `6-Digit verification code displayed: ${receivedVerifyCode}`
  );

  // Check that device is now in SQLite database
  const savedDev = db.getDevice(testPhoneId);
  assert(savedDev && savedDev.name === testPhoneName, 'Device stored in SQLite devices table');

  // Check that secret is stored securely in secret storage (not in plain file/db)
  const storedSecret = secretManager.getDeviceSecret(testPhoneId);
  assert(storedSecret === testPhoneSecret, 'Client secret securely stored and retrievable via OS SafeStorage');

  // Close pairing connection
  pairWs.close();
  await sleep(100);

  // 5. Test Token Reuse Rejection
  console.log('\n--- 4. Testing Single-Use Token Reuse Rejection ---');
  const reuseWs = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
    rejectUnauthorized: false,
  });

  const reuseResult = await new Promise((resolve) => {
    reuseWs.on('open', () => {
      reuseWs.send(
        JSON.stringify({
          type: 'pair.request',
          deviceId: 'attacker-phone-id',
          deviceName: 'Hacker Phone',
          pairToken: pairSession.payload.pairToken, // Reusing consumed token!
          clientSecret: 'secret123',
        })
      );
    });

    reuseWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pair.response') {
        resolve(msg);
      }
    });

    reuseWs.on('close', (code, reason) => {
      resolve({ ok: false, code, reason: reason.toString() });
    });
  });

  assert(
    reuseResult.ok === false,
    `Reused token was successfully rejected: "${reuseResult.reason}"`
  );
  reuseWs.close();
  await sleep(100);

  // 6. Test Reconnect Challenge-Response Auth
  console.log('\n--- 5. Testing Reconnect & HMAC-SHA256 Auth Handshake ---');
  const authWs = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
    rejectUnauthorized: false,
  });

  const clientNonce = crypto.randomBytes(16).toString('hex');

  const authResult = await new Promise((resolve) => {
    authWs.on('open', () => {
      // Step 1: Send auth.hello
      authWs.send(
        JSON.stringify({
          type: 'auth.hello',
          deviceId: testPhoneId,
          nonce: clientNonce,
        })
      );
    });

    authWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());

      // Step 2: Handle auth.challenge from desktop
      if (msg.type === 'auth.challenge') {
        const challenge = msg.challenge;
        // Step 3: Compute signature = HMAC-SHA256(clientSecret, challenge + nonce)
        const signature = crypto
          .createHmac('sha256', testPhoneSecret)
          .update(`${challenge}${clientNonce}`, 'utf8')
          .digest('hex');

        // Step 4: Send auth.response
        authWs.send(
          JSON.stringify({
            type: 'auth.response',
            signature,
          })
        );
      }

      // Step 5: Receive auth.ok
      if (msg.type === 'auth.ok') {
        resolve({ ok: true, msg });
      }
    });

    authWs.on('close', (code, reason) => {
      resolve({ ok: false, code, reason: reason.toString() });
    });
  });

  assert(authResult.ok === true, 'Reconnect auth handshake succeeded (received auth.ok)');
  assert(authResult.msg.deviceName !== undefined, `Desktop host identified as "${authResult.msg.deviceName}"`);

  // 7. Test Ping / Pong Heartbeat
  console.log('\n--- 6. Testing Heartbeat (Ping/Pong) ---');
  const pongReceived = await new Promise((resolve) => {
    authWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pong') {
        resolve(true);
      }
    });
    authWs.send(JSON.stringify({ type: 'ping' }));
    setTimeout(() => resolve(false), 2000);
  });

  assert(pongReceived, 'Server replied to ping with pong frame');

  // 8. Test Invalid Signature Auth Rejection
  console.log('\n--- 7. Testing Invalid Signature Rejection ---');
  const badAuthWs = new WebSocket(`wss://127.0.0.1:${TEST_PORT}`, {
    rejectUnauthorized: false,
  });

  const badAuthRejected = await new Promise((resolve) => {
    badAuthWs.on('open', () => {
      badAuthWs.send(
        JSON.stringify({
          type: 'auth.hello',
          deviceId: testPhoneId,
          nonce: 'dummy-nonce',
        })
      );
    });

    badAuthWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth.challenge') {
        // Send fake bogus signature
        badAuthWs.send(
          JSON.stringify({
            type: 'auth.response',
            signature: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
          })
        );
      }
    });

    badAuthWs.on('close', (code) => {
      // Should close with 4401
      resolve(code === 4401);
    });
  });

  assert(badAuthRejected, 'Server immediately closed connection on invalid HMAC signature (code 4401)');

  // 9. Clean up and stop server
  authWs.close();
  await syncBoardServer.stop();
  console.log('\n[SyncBoard Server] Test server shut down cleanly.');

  // Clean test device
  db.removeDevice(testPhoneId);
  secretManager.removeDeviceSecret(testPhoneId);

  // Summary
  console.log('\n====================================================');
  console.log(`M2 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) process.exit(1);
}

runM2Tests().catch((err) => {
  console.error('M2 Tests error:', err);
  process.exit(1);
});
