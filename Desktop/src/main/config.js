const path = require('path');
const os = require('os');
const fs = require('fs');
let app = null;
if (process.versions && process.versions.electron) {
  try {
    app = require('electron').app;
  } catch (err) {
    app = null;
  }
}

function getPaths() {
  const userData = process.env.SYNCBOARD_USER_DATA || ((app && typeof app.getPath === 'function') 
    ? app.getPath('userData') 
    : path.join(__dirname, '../../data/userData'));
  const downloads = (app && typeof app.getPath === 'function') 
    ? app.getPath('downloads') 
    : path.join(__dirname, '../../data/downloads');
  const syncBoardDownloads = process.env.SYNCBOARD_DOWNLOADS_PATH || path.join(downloads, 'SyncBoard');
  const tempDir = process.env.SYNCBOARD_TEMP_PATH || path.join(userData, 'temp');
  const certsDir = path.join(userData, 'certs');
  const dbPath = process.env.SYNCBOARD_DB_PATH || path.join(userData, 'syncboard.db');

  // Ensure directories exist
  [syncBoardDownloads, tempDir, certsDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  return {
    userData,
    downloads: syncBoardDownloads,
    tempDir,
    certsDir,
    dbPath,
  };
}

const DEFAULT_SETTINGS = {
  serverPort: '48620',
  deviceName: os.hostname() || 'SyncBoard Desktop',
  downloadDir: '', // Will be resolved dynamically to syncBoardDownloads
  autoAcceptFiles: 'false',
  historyMode: 'simpan', // 'simpan' or 'kirim_sekali'
  retentionHours: '24', // 1, 24, 168 (7 days)
  deviceId: '', // Generated on first start
};

module.exports = {
  getPaths,
  getAppPaths: getPaths,
  DEFAULT_SETTINGS,
};
