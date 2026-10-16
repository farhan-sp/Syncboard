import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import path from 'path';

let tray: Tray | null = null;

export function setupTray(mainWindow: BrowserWindow, onQuit: () => void) {
  if (tray) return tray;

  // Create simple 16x16 tray icon image or canvas
  const icon = nativeImage.createFromBuffer(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAYgz4//8/AxZ1DEyMTChyTFCMzQA0uQxUgzYwMDAwMLIxMhKnGBuACRhGFtCEhSEqGFiJdQA+v5DjyEKYkYyMjAx4XUHOu5R4nxgDkL0OM0yJ9wEAAZon2jI6p4AAAAAASUVORK5CYII=',
      'base64'
    )
  );

  tray = new Tray(icon);
  tray.setToolTip('SyncBoard Desktop - Lokal Wi-Fi P2P');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Buka SyncBoard',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Status: Server TLS Aktif',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Keluar',
      click: () => {
        onQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
