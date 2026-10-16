import path from 'path';
import os from 'os';
import fs from 'fs';
import { app } from 'electron';
import { DEFAULT_PORT, RETENTION_OPTIONS } from '../shared/constants';
import { AppSettings } from '../shared/types';

export function getAppPaths() {
  const userData = process.env.SYNCBOARD_USER_DATA || (app?.getPath ? app.getPath('userData') : path.join(os.homedir(), '.config', 'SyncBoard'));
  const downloads = app?.getPath ? app.getPath('downloads') : path.join(os.homedir(), 'Downloads');
  const syncBoardDownloads = process.env.SYNCBOARD_DOWNLOADS_PATH || path.join(downloads, 'SyncBoard');
  const tempDir = process.env.SYNCBOARD_TEMP_PATH || path.join(userData, 'temp');
  const certsDir = path.join(userData, 'certs');
  const dbPath = process.env.SYNCBOARD_DB_PATH || path.join(userData, 'syncboard.db');

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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  serverPort: DEFAULT_PORT,
  deviceName: os.hostname() || 'SyncBoard Desktop',
  downloadDir: '',
  confirmBeforeReceive: true,
  historyMode: 'simpan',
  retentionHours: 24,
  theme: 'dark',
  startWithSystem: false,
};
