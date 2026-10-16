const db = require('./db');
const { getLocalIPv4Addresses } = require('./network');
const { secretManager } = require('./secrets');
const { syncBoardServer } = require('./server');

async function main() {
  console.log('==================================================');
  console.log('       SyncBoard TLS WSS Server (Standalone)      ');
  console.log('==================================================\n');

  db.initDatabase();
  secretManager.init();

  const ips = getLocalIPv4Addresses();
  console.log('Alamat IP Lokal terdeteksi di jaringan:');
  if (ips.length === 0) {
    console.log('  (Tidak ada antarmuka jaringan aktif yang terdeteksi)');
  } else {
    ips.forEach((ip) => {
      console.log(`  - [${ip.interface}] https://${ip.address}:${db.getSetting('serverPort', '48620')}`);
    });
  }

  const res = await syncBoardServer.start();
  console.log(`\n[OK] Server SyncBoard TLS aktif di port: ${res.port}`);
  console.log(`[OK] Fingerprint Sertifikat SHA-256: ${res.certFingerprint}`);
  console.log('\nMenunggu koneksi dari aplikasi Android SyncBoard...');
  console.log('Tekan Ctrl+C untuk menghentikan server.\n');

  process.on('SIGINT', async () => {
    console.log('\nMenutup koneksi dan menghentikan server...');
    await syncBoardServer.stop();
    console.log('Server SyncBoard telah dinonaktifkan.');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await syncBoardServer.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Gagal menjalankan server SyncBoard:', err);
  process.exit(1);
});
