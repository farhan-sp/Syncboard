import { app, BrowserWindow, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import * as db from './db';
import { getOrCreateCertificate } from './cert';
import { getAppPaths } from './config';
import { setupIpcHandlers } from './ipc';
import { setupTray, destroyTray } from './tray';
import { secretManager } from './secrets';
import { syncBoardServer } from './server';
import { createIslandWindow, destroyIsland, handleServerActivity, broadcastThemeChanged } from './island';

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

    let initialBg = '#202020';
    try {
      const savedTheme = (db as any).getSetting('theme', 'dark');
      if (savedTheme === 'light') {
        initialBg = '#F3F3F3';
      } else if (savedTheme === 'system') {
        const { nativeTheme } = require('electron');
        initialBg = nativeTheme.shouldUseDarkColors ? '#202020' : '#F3F3F3';
      }
    } catch {}

    const iconCandidates = [
      path.join(__dirname, '../renderer/src/assets/logo.png'),
      path.join(__dirname, '../../src/renderer/src/assets/logo.png'),
      path.join(__dirname, '../../dist/renderer/assets/logo.png'),
    ];
    const appIcon = iconCandidates.find(p => fs.existsSync(p));

    mainWindow = new BrowserWindow({
      width: 1120,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      title: 'SyncBoard Desktop',
      icon: appIcon,
      backgroundColor: initialBg,
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
    destroyIsland();

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
      handleServerActivity(event, data, () => mainWindow);
    });

    // Handle OS native theme changes
    nativeTheme.on('updated', () => {
      const savedTheme = db.getSetting('theme', 'dark');
      if (savedTheme === 'system') {
        const isDark = nativeTheme.shouldUseDarkColors;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setBackgroundColor(isDark ? '#202020' : '#F3F3F3');
          mainWindow.webContents.send('settings:update', { key: 'theme', value: 'system' });
        }
        broadcastThemeChanged('system', isDark);
      }
    });

    // Start TLS WSS Server
    try {
      await syncBoardServer.start();
    } catch (err) {
      console.error('[SyncBoard] Failed to start TLS WSS Server:', err);
    }

    // Create Main Window
    createWindow();

    // Create Dynamic Island Window
    createIslandWindow(() => mainWindow);

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
