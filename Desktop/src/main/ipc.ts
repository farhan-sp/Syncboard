import { ipcMain, dialog, clipboard, shell, BrowserWindow } from 'electron';
import * as db from './db';
import { getOrCreateCertificate } from './cert';
import { getLocalIPv4Addresses, getHostIpList, getPlatformTroubleshootingInfo } from './network';
import { pairingManager } from './pairing';
import { secretManager } from './secrets';
import { syncBoardServer } from './server';
import { NetworkInfo } from '../shared/types';

export function setupIpcHandlers(getMainWindow: () => BrowserWindow | null) {
  // Settings
  ipcMain.handle('settings:get-all', async () => {
    return db.getAllSettings();
  });

  ipcMain.handle('settings:save', async (_event, { key, val }) => {
    if (typeof key !== 'string') throw new Error('Key must be a string');
    db.setSetting(key, val);
    return true;
  });

  ipcMain.handle('settings:select-dir', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Pilih Folder Unduhan SyncBoard',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      const selected = res.filePaths[0];
      db.setSetting('downloadDir', selected);
      return selected;
    }
    return null;
  });

  // Network & Troubleshooting
  ipcMain.handle('network:get-info', async (): Promise<NetworkInfo> => {
    const certInfo = await getOrCreateCertificate();
    const ips = getLocalIPv4Addresses();
    const port = parseInt(db.getSetting('serverPort', '48620') || '48620', 10);
    return {
      deviceId: db.getSetting('deviceId') || '',
      deviceName: db.getSetting('deviceName') || 'SyncBoard Desktop',
      serverPort: port,
      certFingerprint: certInfo.fingerprint,
      addresses: ips,
      hosts: getHostIpList(),
      isServerRunning: true,
      activeClientCount: syncBoardServer.getConnectedDeviceCount(),
    };
  });

  ipcMain.handle('network:get-troubleshooting', async () => {
    return getPlatformTroubleshootingInfo();
  });

  // Devices
  ipcMain.handle('devices:get-all', async () => {
    return db.getDevices();
  });

  ipcMain.handle('devices:rename', async (_event, { id, name }) => {
    if (!id || typeof name !== 'string') throw new Error('Invalid arguments');
    return db.renameDevice(id, name.trim());
  });

  ipcMain.handle('devices:disconnect', async (_event, { id }) => {
    if (!id) throw new Error('Device ID required');
    return syncBoardServer.disconnectDevice(id);
  });

  ipcMain.handle('devices:remove', async (_event, { id }) => {
    if (!id) throw new Error('Device ID required');
    return syncBoardServer.removeDevice(id);
  });

  // Transfers
  ipcMain.handle('transfers:get-all', async (_event, filter) => {
    return db.getTransfers(filter || {});
  });

  ipcMain.handle('transfers:delete', async (_event, { id }) => {
    if (!id) throw new Error('Transfer ID required');
    return db.deleteTransfer(id);
  });

  ipcMain.handle('transfers:clear-all', async () => {
    return db.clearAllTransfers();
  });

  ipcMain.handle('transfers:pin', async (_event, { id, pinned }) => {
    if (!id) throw new Error('Transfer ID required');
    return db.pinTransfer(id, pinned);
  });

  ipcMain.handle('transfers:send-text', async (_event, { text, kind, deviceId }) => {
    if (typeof text !== 'string') throw new Error('Text must be a string');
    return await syncBoardServer.sendTextMessage(deviceId, text, kind);
  });

  ipcMain.handle('transfers:send-file', async (_event, { filePath, deviceId }) => {
    if (typeof filePath !== 'string') throw new Error('File path required');
    return await syncBoardServer.sendFile(filePath, deviceId);
  });

  ipcMain.handle('transfers:select-files', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const res = await dialog.showOpenDialog(win, {
      title: 'Pilih Berkas untuk Dikirim',
      properties: ['openFile', 'multiSelections'],
    });
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths;
    }
    return null;
  });

  ipcMain.handle('transfers:cancel', async (_event, { id }) => {
    if (!id) throw new Error('Transfer ID required');
    return syncBoardServer.cancelTransfer(id);
  });

  ipcMain.handle('transfers:retry', async (_event, { id }) => {
    if (!id) throw new Error('Transfer ID required');
    return await syncBoardServer.retryTransfer(id);
  });

  ipcMain.handle('transfers:respond-offer', async (_event, response: { offerId: string; accept: boolean }) => {
    if (!response || !response.offerId) throw new Error('Invalid offer response parameters');
    return syncBoardServer.respondFileOffer(response.offerId, response.accept);
  });

  // Pairing
  ipcMain.handle('pairing:create-session', async () => {
    return await pairingManager.createPairingSession();
  });

  ipcMain.handle('pairing:respond', async (_event, response: { requestId: string; accept: boolean }) => {
    return syncBoardServer.respondPairRequest(response.requestId, response.accept);
  });

  // System Helpers
  ipcMain.handle('system:copy-clipboard', async (_event, { text }) => {
    if (typeof text === 'string') {
      clipboard.writeText(text);
      return true;
    }
    return false;
  });

  ipcMain.handle('system:open-file-location', async (_event, { filePath }) => {
    if (typeof filePath === 'string') {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });
}
