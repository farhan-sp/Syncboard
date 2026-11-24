import { BrowserWindow, screen, globalShortcut, Notification, app, ipcMain, dialog, clipboard, shell, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import * as db from './db';
import { syncBoardServer } from './server';
import { getLocalIPv4Addresses, getHostIpList } from './network';
import { getOrCreateCertificate } from './cert';

let islandWindow: BrowserWindow | null = null;
let currentShortcut: string | null = null;
let isWayland = false;

// Content dimensions (window bounds = content + 24px margin for shadow)
export const CONTENT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  collapsed: { width: 190, height: 40 },
  progress: { width: 380, height: 68 },
  text_link: { width: 440, height: 68 },
  file_offer: { width: 440, height: 68 },
  expanded: { width: 520, height: 470 },
};

export const SHADOW_MARGIN = 24;

export function calculateIslandBounds(contentWidth: number, contentHeight: number) {
  const windowWidth = contentWidth + SHADOW_MARGIN;
  const windowHeight = contentHeight + SHADOW_MARGIN;

  let display;
  try {
    const cursor = screen.getCursorScreenPoint();
    display = screen.getDisplayNearestPoint(cursor) || screen.getPrimaryDisplay();
  } catch (err) {
    display = screen.getPrimaryDisplay();
  }

  const workArea = display.workArea || display.bounds;
  const x = Math.round(workArea.x + (workArea.width - windowWidth) / 2);
  const y = workArea.y + 10;

  return { x, y, width: windowWidth, height: windowHeight };
}

export function isWaylandSession(): boolean {
  return process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland';
}

export function showWaylandNotification(title: string, body: string, onClick?: () => void) {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: title || 'SyncBoard',
      body: body || '',
      silent: false,
    });
    if (onClick) {
      notif.on('click', onClick);
    }
    notif.show();
  }
}

export function createIslandWindow(getMainWindow: () => BrowserWindow | null): BrowserWindow | null {
  if (isWaylandSession()) {
    console.log('[SyncBoard Island] Wayland terdeteksi. Island dinonaktifkan otomatis, menggunakan native notification.');
    isWayland = true;
    return null;
  }

  const preloadCandidates = [
    path.join(__dirname, '../preload/island.js'),
    path.join(__dirname, 'preload/island.js'),
    path.join(__dirname, '../../dist/main/preload/island.js'),
    path.join(__dirname, 'island_preload.js'),
  ];
  const preloadPath = preloadCandidates.find((p) => fs.existsSync(p)) || preloadCandidates[0];

  const initBounds = calculateIslandBounds(
    CONTENT_DIMENSIONS.collapsed.width,
    CONTENT_DIMENSIONS.collapsed.height
  );

  islandWindow = new BrowserWindow({
    x: initBounds.x,
    y: initBounds.y,
    width: initBounds.width,
    height: initBounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  islandWindow.setAlwaysOnTop(true, 'screen-saver');

  const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER_URL;
  if (isDev) {
    islandWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}/island.html`);
  } else {
    const candidatePaths = [
      path.join(__dirname, '../../renderer/island.html'),
      path.join(__dirname, '../../dist/renderer/island.html'),
      path.join(__dirname, '../renderer/island.html'),
      path.join(__dirname, '../../../dist/renderer/island.html'),
    ];
    const rendererPath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
    islandWindow.loadFile(rendererPath);
  }

  islandWindow.once('ready-to-show', () => {
    const enabled = db.getSetting('islandEnabled', 'true') !== 'false';
    if (enabled && islandWindow && !islandWindow.isDestroyed()) {
      islandWindow.showInactive();
    }
  });

  islandWindow.on('closed', () => {
    islandWindow = null;
  });

  setupIslandIpc(getMainWindow);
  setupIslandShortcut();

  return islandWindow;
}

export function setupIslandIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.removeHandler('island:set-bounds');
  ipcMain.handle('island:set-bounds', async (_event, { stateName, bounds }) => {
    if (!islandWindow || islandWindow.isDestroyed()) return false;

    let width = bounds?.width;
    let height = bounds?.height;

    if (!width || !height) {
      const standard = CONTENT_DIMENSIONS[stateName] || CONTENT_DIMENSIONS.collapsed;
      width = standard.width;
      height = standard.height;
    }

    const newBounds = calculateIslandBounds(width, height);
    islandWindow.setBounds(newBounds, false);
    return true;
  });

  ipcMain.removeHandler('island:request-expand');
  ipcMain.handle('island:request-expand', async () => {
    if (!islandWindow || islandWindow.isDestroyed()) return false;
    const expBounds = calculateIslandBounds(
      CONTENT_DIMENSIONS.expanded.width,
      CONTENT_DIMENSIONS.expanded.height
    );
    islandWindow.setBounds(expBounds, false);
    islandWindow.show();
    islandWindow.focus();
    return true;
  });

  ipcMain.removeHandler('island:request-collapse');
  ipcMain.handle('island:request-collapse', async () => {
    if (!islandWindow || islandWindow.isDestroyed()) return false;
    return true;
  });

  ipcMain.removeHandler('island:get-transfers-fresh');
  ipcMain.handle('island:get-transfers-fresh', async () => {
    return db.getTransfers({ limit: 100 });
  });

  ipcMain.removeHandler('island:action');
  ipcMain.handle('island:action', async (_event, { name, payload }: { name: string; payload?: any }) => {
    const mainWin = getMainWindow ? getMainWindow() : null;

    switch (name) {
      case 'getSettings':
        return db.getAllSettings();

      case 'saveSetting': {
        if (!payload || typeof payload.key !== 'string') throw new Error('Invalid setting payload');
        db.setSetting(payload.key, payload.value);
        if (payload.key === 'theme') {
          const isDark =
            payload.value === 'dark' || (payload.value === 'system' && nativeTheme.shouldUseDarkColors);
          broadcastThemeChanged(payload.value, isDark);
          if (mainWin && !mainWin.isDestroyed()) {
            mainWin.setBackgroundColor(isDark ? '#202020' : '#F3F3F3');
          }
        } else if (payload.key === 'islandEnabled') {
          setIslandVisibility(payload.value === true || payload.value === 'true');
        } else if (payload.key === 'islandShortcut') {
          setupIslandShortcut(payload.value);
        }
        broadcastEvent('settings:update', { key: payload.key, value: payload.value });
        return true;
      }

      case 'getDevices':
        return db.getDevices();

      case 'getTransfers':
        return db.getTransfers(payload || {});

      case 'getTransfersFresh':
        return db.getTransfers({ limit: payload?.limit || 100 });

      case 'getNetworkInfo': {
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
      }

      case 'sendText': {
        const text = payload?.text;
        const kind = payload?.kind || 'text';
        const deviceId = payload?.deviceId;
        if (!text) throw new Error('Text content required');
        return await syncBoardServer.sendTextMessage(deviceId, text, kind);
      }

      case 'sendFiles': {
        let paths = payload?.paths;
        const deviceId = payload?.deviceId;
        if (!paths || paths.length === 0) {
          const res = await dialog.showOpenDialog(islandWindow || mainWin!, {
            title: 'Pilih Berkas untuk Dikirim',
            properties: ['openFile', 'multiSelections'],
          });
          if (!res.canceled && res.filePaths.length > 0) {
            paths = res.filePaths;
          }
        }
        if (paths && paths.length > 0) {
          const results = [];
          for (const p of paths) {
            results.push(await syncBoardServer.sendFile(p, deviceId));
          }
          return results;
        }
        return false;
      }

      case 'selectFilesToSend': {
        const res = await dialog.showOpenDialog(islandWindow || mainWin!, {
          title: 'Pilih Berkas untuk Dikirim',
          properties: ['openFile', 'multiSelections'],
        });
        if (!res.canceled && res.filePaths.length > 0) {
          return res.filePaths;
        }
        return null;
      }

      case 'respondFileOffer': {
        if (!payload || !payload.offerId) throw new Error('Invalid offer response payload');
        return syncBoardServer.respondFileOffer(payload.offerId, payload.accept);
      }

      case 'cancelTransfer':
        if (!payload?.id) throw new Error('Transfer ID required');
        return syncBoardServer.cancelTransfer(payload.id);

      case 'retryTransfer':
        if (!payload?.id) throw new Error('Transfer ID required');
        return await syncBoardServer.retryTransfer(payload.id);

      case 'deleteTransfer':
        if (!payload?.id) throw new Error('Transfer ID required');
        return db.deleteTransfer(payload.id);

      case 'pinTransfer':
        if (!payload?.id) throw new Error('Transfer ID required');
        return db.pinTransfer(payload.id, payload.pinned);

      case 'clearAllTransfers':
        return db.clearAllTransfers();

      case 'copyToClipboard':
        if (typeof payload?.text === 'string') {
          clipboard.writeText(payload.text);
          return true;
        }
        return false;

      case 'openExternal':
        if (typeof payload?.url === 'string') {
          shell.openExternal(payload.url);
          return true;
        }
        return false;

      case 'openFolder':
        if (typeof payload?.path === 'string') {
          shell.showItemInFolder(payload.path);
          return true;
        }
        return false;

      case 'selectDownloadDir': {
        const res = await dialog.showOpenDialog(islandWindow || mainWin!, {
          title: 'Pilih Folder Unduhan SyncBoard',
          properties: ['openDirectory', 'createDirectory'],
        });
        if (!res.canceled && res.filePaths.length > 0) {
          const selected = res.filePaths[0];
          db.setSetting('downloadDir', selected);
          return selected;
        }
        return null;
      }

      case 'openMainWindow':
        if (mainWin) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
        }
        return true;

      case 'openPairModal':
        if (mainWin) {
          if (mainWin.isMinimized()) mainWin.restore();
          mainWin.show();
          mainWin.focus();
          mainWin.webContents.send('event:open-pairing-modal');
        }
        return true;

      default:
        throw new Error(`Unknown action: ${name}`);
    }
  });
}

export function setupIslandShortcut(customShortcut?: string) {
  try {
    if (currentShortcut) {
      globalShortcut.unregister(currentShortcut);
      currentShortcut = null;
    }

    const shortcutStr =
      customShortcut || db.getSetting('islandShortcut', 'CommandOrControl+Shift+Space') || 'CommandOrControl+Shift+Space';

    const registered = globalShortcut.register(shortcutStr, () => {
      toggleIsland();
    });

    if (registered) {
      currentShortcut = shortcutStr;
    } else {
      console.warn(`[SyncBoard Island] Gagal mendaftarkan shortcut: ${shortcutStr}`);
    }
  } catch (err) {
    console.error('[SyncBoard Island] Error setup shortcut:', err);
  }
}

export function toggleIsland() {
  if (isWayland || !islandWindow || islandWindow.isDestroyed()) return;

  const enabled = db.getSetting('islandEnabled', 'true') !== 'false';
  if (!enabled) return;

  if (islandWindow.isVisible()) {
    islandWindow.webContents.send('island:toggle');
  } else {
    islandWindow.showInactive();
    islandWindow.webContents.send('island:toggle');
  }
}

export function setIslandVisibility(visible: boolean) {
  if (isWayland || !islandWindow || islandWindow.isDestroyed()) return;

  if (visible) {
    islandWindow.showInactive();
  } else {
    islandWindow.hide();
  }
}

export function broadcastEvent(channel: string, payload: any) {
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.webContents.send(channel, payload);
  }
}

export function broadcastThemeChanged(themeSetting: string, isDark: boolean) {
  broadcastEvent('theme:changed', { theme: themeSetting, isDark });
}

export function handleServerActivity(event: string, data: any, getMainWindow: () => BrowserWindow | null) {
  const enabled = db.getSetting('islandEnabled', 'true') !== 'false';

  const isCompleted = data?.status === 'completed' || data?.status === 'Selesai';
  const isIncoming = data?.direction === 'incoming';
  const isTextOrLink = data?.kind === 'text' || data?.kind === 'link' || data?.type === 'text' || data?.type === 'link';
  const textContent = data?.textBody || data?.textContent || '';
  const isUrl = (data?.kind === 'link' || data?.type === 'link') || /^https?:\/\//i.test(textContent);

  if (isWayland) {
    if (!enabled) return;
    const mainWin = getMainWindow ? getMainWindow() : null;
    const openApp = () => {
      if (mainWin) {
        if (mainWin.isMinimized()) mainWin.restore();
        mainWin.show();
        mainWin.focus();
      }
    };

    if (event === 'event:transfer-update' && isCompleted && isIncoming) {
      if (isTextOrLink && textContent) {
        try {
          clipboard.writeText(textContent);
        } catch (err) {
          console.error('[SyncBoard Island] Gagal auto-copy ke clipboard di Wayland:', err);
        }
        showWaylandNotification(
          isUrl ? 'Tautan Masuk' : 'Teks Masuk',
          textContent || 'Pesan teks baru diterima',
          openApp
        );
      } else {
        showWaylandNotification(
          'Berkas Selesai Diterima',
          data.fileName || data.filename || 'Berkas baru telah disimpan',
          openApp
        );
      }
    } else if (event === 'event:file-offer') {
      showWaylandNotification(
        'Tawaran Berkas Masuk',
        `${data.filename || data.name} (${data.size ? Math.round(data.size / 1024) + ' KB' : ''}) dari ${data.deviceName || 'Perangkat'}`,
        openApp
      );
    }
    return;
  }

  if (!islandWindow || islandWindow.isDestroyed()) {
    // Tetap auto-copy ke clipboard meskipun jendela Island tidak terbuka
    if (event === 'event:transfer-update' && isCompleted && isIncoming && isTextOrLink && textContent) {
      try {
        clipboard.writeText(textContent);
        console.log(`[SyncBoard Clipboard] Auto-copied incoming text (${textContent.length} chars)`);
      } catch (err) {
        console.error('[SyncBoard Island] Gagal auto-copy ke clipboard:', err);
      }
    }
    return;
  }

  islandWindow.webContents.send(event, data);

  if (event === 'event:transfer-update') {
    const freshTransfer = data?.id ? db.getTransfer(data.id) : null;
    islandWindow.webContents.send('transfers:update', freshTransfer || data);

    if (isCompleted && isIncoming && isTextOrLink && textContent) {
      // Auto-copy ke OS clipboard
      try {
        clipboard.writeText(textContent);
        islandWindow.webContents.send('island:clipboard-auto-copied', {
          text: textContent,
          isUrl,
        });
      } catch (err) {
        console.error('[SyncBoard Island] Gagal auto-copy ke clipboard:', err);
      }

      const activity = {
        id: data.id,
        type: 'text_link',
        deviceName: data.deviceName || 'Perangkat',
        text: textContent,
        isUrl,
        timestamp: Date.now(),
      };
      if (enabled && !islandWindow.isVisible()) islandWindow.showInactive();
      islandWindow.webContents.send('island:activity', activity);
    }

    if (isCompleted) {
      islandWindow.webContents.send('transfer:done', data);
    } else if (data?.status === 'failed' || data?.status === 'cancelled' || data?.status === 'Gagal' || data?.status === 'Dibatalkan') {
      islandWindow.webContents.send('transfer:error', data);
    }
  } else if (event === 'event:file-offer') {
    const activity = {
      id: data.offerId || data.id,
      type: 'file_offer',
      deviceName: data.deviceName || 'Perangkat',
      filename: data.filename || 'Berkas',
      size: data.size || 0,
      timestamp: Date.now(),
      rawOffer: data,
    };
    if (enabled && !islandWindow.isVisible()) islandWindow.showInactive();
    islandWindow.webContents.send('transfer:offer', data);
    islandWindow.webContents.send('island:activity', activity);
  } else if (event === 'event:transfer-progress') {
    const activity = {
      id: data.id,
      type: 'progress',
      filename: data.filename || 'Mentransfer berkas...',
      deviceName: data.deviceName || 'Perangkat',
      bytesReceived: data.bytesReceived || 0,
      totalBytes: data.totalBytes || 1,
      percent: data.percent || (data.totalBytes ? Math.round((data.bytesReceived / data.totalBytes) * 100) : 0),
      timestamp: Date.now(),
    };
    if (enabled && !islandWindow.isVisible()) islandWindow.showInactive();
    islandWindow.webContents.send('transfer:progress', data);
    islandWindow.webContents.send('island:activity', activity);
  } else if (event === 'event:device-status') {
    islandWindow.webContents.send('devices:update', data);
  }
}

export function getIslandWindow(): BrowserWindow | null {
  return islandWindow;
}

export function destroyIsland() {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
    currentShortcut = null;
  }
  if (islandWindow && !islandWindow.isDestroyed()) {
    islandWindow.destroy();
    islandWindow = null;
  }
}

export default {
  createIslandWindow,
  getIslandWindow,
  setupIslandShortcut,
  toggleIsland,
  setIslandVisibility,
  broadcastEvent,
  broadcastThemeChanged,
  handleServerActivity,
  destroyIsland,
};
