import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import * as db from './db';
import { getOrCreateCertificate } from './cert';
import { getAppPaths } from './config';
import { setupIpcHandlers } from './ipc';
import { setupTray, destroyTray } from './tray';
import { secretManager } from './secrets';
import { syncBoardServer } from './server';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// 1. Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[SyncBoard] Another instance is already running. Exiting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Focus existing window when a second instance tries to launch
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  function createWindow() {
    const preloadCandidates = [
      path.join(__dirname, '../preload/index.js'),
      path.join(__dirname, 'preload.js'),
      path.join(__dirname, '../../dist/main/preload/index.js'),
    ];
    const preloadPath = preloadCandidates.find(p => fs.existsSync(p)) || preloadCandidates[0];

    mainWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      title: 'SyncBoard Desktop',
      backgroundColor: '#090e17',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
      autoHideMenuBar: true,
    });

    const isDev = !app.isPackaged && process.env.VITE_DEV_SERVER_URL;
    if (isDev) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL!);
    } else {
      const candidatePaths = [
        path.join(__dirname, '../../renderer/index.html'),
        path.join(__dirname, '../../dist/renderer/index.html'),
        path.join(__dirname, '../renderer/index.html'),
        path.join(__dirname, '../../../dist/renderer/index.html'),
      ];
      const rendererPath = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];
      mainWindow.loadFile(rendererPath);
    }

    // Window minimize to tray behavior
    mainWindow.on('close', (e) => {
      if (!isQuitting) {
        e.preventDefault();
        mainWindow?.hide();
      }
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Notify renderer of any secret storage warning on Linux
    mainWindow.webContents.on('did-finish-load', () => {
      const warning = secretManager.getWarningMessage();
      if (warning) {
        mainWindow?.webContents.send('event:secret-store-warning', { warning });
      }
    });
  }

  // Graceful shutdown
  async function gracefulShutdown() {
    isQuitting = true;
    console.log('[SyncBoard] Performing graceful shutdown...');
    destroyTray();

    try {
      await syncBoardServer.stop();
    } catch (err) {
      console.error('[SyncBoard] Error stopping server:', err);
    }

    try {
      // Clean up temporary files
      const paths = getAppPaths();
      if (fs.existsSync(paths.tempDir)) {
        const files = fs.readdirSync(paths.tempDir);
        for (const file of files) {
          try {
            fs.unlinkSync(path.join(paths.tempDir, file));
          } catch {}
        }
      }
    } catch (err) {
      console.error('[SyncBoard] Error cleaning temp files during shutdown:', err);
    }

    app.quit();
  }

  app.whenReady().then(async () => {
    // Initialize Database
    db.initDatabase();

    // Initialize OS Secrets Storage
    secretManager.init();

    // Initialize TLS Certificate & Fingerprint
    await getOrCreateCertificate();

    // Setup IPC Handlers
    setupIpcHandlers(() => mainWindow);

    // Setup Server Event Bridge
    syncBoardServer.setEventCallback((event, data) => {
      mainWindow?.webContents.send(event, data);
    });

    // Start TLS WSS Server
    try {
      await syncBoardServer.start();
    } catch (err) {
      console.error('[SyncBoard] Failed to start TLS WSS Server:', err);
    }

    // Create Main Window
    createWindow();

    // Setup System Tray
    if (mainWindow) {
      setupTray(mainWindow, gracefulShutdown);
    }

    // Periodic cleanup of expired transfers (Kirim Sekali mode)
    db.cleanupExpiredTransfers();
    setInterval(() => {
      db.cleanupExpiredTransfers();
    }, 30 * 60 * 1000);

    app.on('activate', () => {
      if (mainWindow) {
        mainWindow.show();
      } else {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // Keep running in tray unless explicitly quit
    }
  });
}
